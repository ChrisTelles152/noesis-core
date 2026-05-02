/**
 * Engine Manager (Phase E1)
 *
 * Holds one NoesisCoreEngine per user, hydrated on first access by replaying
 * the user's persisted core events through a fresh deterministic engine.
 * Subsequent calls return the cached instance. Ensures every server-side
 * route that needs the engine sees a single, consistent state for the user.
 *
 * Cache: bounded LRU. When the cap is exceeded the oldest engine's state is
 * persisted via `storage.saveEngineState()` and the entry is dropped from
 * memory. The next access re-hydrates from persisted state + event log,
 * which is byte-identical thanks to the Phase A determinism contract.
 *
 * Production wiring:
 *   const manager = configureEngineManager({
 *     curriculumSource: dbCurriculumSource,        // Phase E2
 *     events: storage,                              // server storage interface
 *     state:  storage,
 *     // clock + idGenerator default to Date.now() + a counter so live
 *     // mutations are non-deterministic. Replay during hydration uses a
 *     // fixed clock — see hydrateEngine().
 *   });
 *
 * Tests can inject fakes for every dependency.
 */

import {
  createNoesisCoreEngine,
  createSkillGraph,
  type NoesisCoreEngineImpl,
  type Skill,
  type ItemSkillMapping,
  type TransferTest,
  type ClockFn,
  type IdGeneratorFn,
} from '@noesis-edu/core';
import type { LearningEvent } from '@shared/schema';
import { extractCoreEvents } from './event-bridge';

/**
 * Per-user curriculum payload — the input the engine needs at construction
 * time before any events flow through.
 */
export interface Curriculum {
  skills: Skill[];
  itemMappings?: ItemSkillMapping[];
  transferTests?: TransferTest[];
}

/**
 * Source of curricula. Tests provide an in-memory fake; production wiring
 * (Phase E2) supplies a DB-backed implementation.
 *
 * Returns `null` when no curriculum has been registered for the user — the
 * manager treats that as "empty graph" so practice events for unknown skills
 * become BKT/FSRS no-ops (the existing engine behaviour).
 */
export interface CurriculumSource {
  loadCurriculum(userId: number): Promise<Curriculum | null>;
}

/** Subset of IStorage the manager actually uses. Tests can fake this directly. */
export interface EngineEventStore {
  getLearningEventsByUserId(userId: number): Promise<LearningEvent[]>;
}

export interface EngineStateStore {
  saveEngineState(userId: number, state: string): Promise<void>;
  loadEngineState(userId: number): Promise<string | null>;
}

export interface EngineManagerOptions {
  curriculumSource: CurriculumSource;
  events: EngineEventStore;
  state: EngineStateStore;
  /** LRU cap. Default 100. */
  maxCached?: number;
  /**
   * Live clock used by engines for new events. Defaults to Date.now().
   * Tests inject a stub for byte-identical assertions.
   */
  clock?: ClockFn;
  /**
   * Live id generator. Defaults to a per-process counter. Replay during
   * hydration always uses a deterministic generator regardless of this.
   */
  idGenerator?: IdGeneratorFn;
}

export interface EngineManager {
  /** Get the engine for a user, hydrating on first access. */
  getEngineForUser(userId: number): Promise<NoesisCoreEngineImpl>;
  /** Force-flush a user's state to the store. Used by routes after mutations. */
  flush(userId: number): Promise<void>;
  /** Drop a single user's engine, persisting first. */
  evictUser(userId: number): Promise<void>;
  /** Number of engines currently cached. Useful for tests + diagnostics. */
  size(): number;
  /** Persist all cached engines and clear the cache. Use on graceful shutdown. */
  shutdown(): Promise<void>;
}

const DEFAULT_MAX_CACHED = 100;

interface CachedEntry {
  engine: NoesisCoreEngineImpl;
  lastAccessed: number;
}

class EngineManagerImpl implements EngineManager {
  private cache = new Map<number, CachedEntry>();
  private readonly maxCached: number;
  private readonly curriculumSource: CurriculumSource;
  private readonly events: EngineEventStore;
  private readonly state: EngineStateStore;
  private readonly clock: ClockFn;
  private readonly idGenerator: IdGeneratorFn;

  constructor(opts: EngineManagerOptions) {
    this.curriculumSource = opts.curriculumSource;
    this.events = opts.events;
    this.state = opts.state;
    this.maxCached = opts.maxCached ?? DEFAULT_MAX_CACHED;
    this.clock = opts.clock ?? ((): number => Date.now());
    if (opts.idGenerator) {
      this.idGenerator = opts.idGenerator;
    } else {
      let counter = 0;
      this.idGenerator = (): string => `srv-${++counter}-${Date.now().toString(36)}`;
    }
  }

  async getEngineForUser(userId: number): Promise<NoesisCoreEngineImpl> {
    const cached = this.cache.get(userId);
    if (cached) {
      cached.lastAccessed = this.clock();
      return cached.engine;
    }

    const engine = await this.hydrateEngine(userId);
    this.cache.set(userId, { engine, lastAccessed: this.clock() });
    await this.evictIfOverLimit();
    return engine;
  }

  async flush(userId: number): Promise<void> {
    const entry = this.cache.get(userId);
    if (!entry) return;
    await this.state.saveEngineState(userId, entry.engine.exportState());
  }

  async evictUser(userId: number): Promise<void> {
    const entry = this.cache.get(userId);
    if (!entry) return;
    await this.state.saveEngineState(userId, entry.engine.exportState());
    this.cache.delete(userId);
  }

  size(): number {
    return this.cache.size;
  }

  async shutdown(): Promise<void> {
    const ids = Array.from(this.cache.keys());
    for (const id of ids) {
      const entry = this.cache.get(id);
      if (entry) {
        await this.state.saveEngineState(id, entry.engine.exportState());
      }
    }
    this.cache.clear();
  }

  /**
   * Build a fresh engine for the user, register its curriculum, then
   * (a) import any persisted snapshot, OR
   * (b) replay the user's core event log from the event store.
   *
   * (a) is preferred when a snapshot exists — it's O(1). (b) is the
   * fallback for users with events but no snapshot, and ensures we never
   * lose data if a snapshot was missed.
   *
   * After hydration the engine continues running with the live clock +
   * idGenerator from the manager, so newly emitted events get system-time
   * stamps. Determinism for past events is preserved because we stored
   * them with whatever clock + ids they had at creation time.
   */
  private async hydrateEngine(userId: number): Promise<NoesisCoreEngineImpl> {
    const curriculum = (await this.curriculumSource.loadCurriculum(userId)) ?? {
      skills: [],
    };
    const graph = createSkillGraph(curriculum.skills);
    const engine = createNoesisCoreEngine(graph, {}, this.clock, this.idGenerator);

    if (curriculum.itemMappings && curriculum.itemMappings.length > 0) {
      engine.registerItemMappings(curriculum.itemMappings);
    }
    if (curriculum.transferTests && curriculum.transferTests.length > 0) {
      engine.registerTransferTests(curriculum.transferTests);
    }

    const snapshot = await this.state.loadEngineState(userId);
    if (snapshot) {
      engine.importState(snapshot);
      return engine;
    }

    // Fallback: rebuild from the canonical event log (slower but durable).
    const stored = await this.events.getLearningEventsByUserId(userId);
    const coreEvents = extractCoreEvents(stored);
    if (coreEvents.length > 0) {
      engine.replayEvents(coreEvents);
    }
    return engine;
  }

  private async evictIfOverLimit(): Promise<void> {
    while (this.cache.size > this.maxCached) {
      let oldestUserId: number | undefined;
      let oldestTime = Infinity;
      for (const [userId, entry] of this.cache) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestUserId = userId;
        }
      }
      if (oldestUserId === undefined) break;
      await this.evictUser(oldestUserId);
    }
  }
}

// ─── Module-level singleton (mirrors storage / wsService patterns) ─────────

let instance: EngineManager | null = null;

/** Configure the engine manager at app startup. */
export function configureEngineManager(opts: EngineManagerOptions): EngineManager {
  instance = new EngineManagerImpl(opts);
  return instance;
}

/** Get the configured engine manager. Throws if not configured. */
export function getEngineManager(): EngineManager {
  if (!instance) {
    throw new Error(
      'EngineManager not configured — call configureEngineManager() at server startup'
    );
  }
  return instance;
}

/** Test-only — reset the singleton between cases. */
export function resetEngineManager(): void {
  instance = null;
}

/**
 * Direct factory — useful for tests that want their own manager without
 * touching the module-level singleton.
 */
export function createEngineManager(opts: EngineManagerOptions): EngineManager {
  return new EngineManagerImpl(opts);
}
