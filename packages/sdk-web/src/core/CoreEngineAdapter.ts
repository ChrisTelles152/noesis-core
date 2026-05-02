/**
 * Core Engine Adapter
 *
 * Bridges @noesis-edu/core with sdk-web, providing:
 * - Access to the core learning engine
 * - Event emission using canonical core event types
 * - Event log for analysis/replay
 * - Clock injection for sdk-web (uses Date.now() here, not in core)
 */

import {
  createNoesisCoreEngine,
  createSkillGraph,
  createEventFactoryContext,
  createPracticeEvent,
  createDiagnosticEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  type NoesisCoreEngineImpl,
  type SkillGraph,
  type Skill,
  type SessionConfig,
  type SessionAction,
  type NoesisEvent,
  type PracticeEvent,
  type DiagnosticEvent,
  type SessionEvent,
  type ClockFn,
  type IdGeneratorFn,
  type EventFactoryContext,
} from '@noesis-edu/core';

/**
 * Configuration for the core engine adapter.
 *
 * `clock` and `idGenerator` are optional **at the SDK boundary only** —
 * if omitted, the adapter falls back to `Date.now()` and a UUID-shaped string,
 * and emits a one-time `console.warn` so the consumer is aware that replay
 * determinism is no longer guaranteed for events created via this adapter.
 *
 * For replay/testing, inject a deterministic clock and idGenerator. For server
 * code that uses a request-scoped UUID source, inject those.
 */
export interface CoreAdapterConfig {
  /** Learning ID for this learner */
  learnerId: string;
  /** Debug mode */
  debug?: boolean;
  /**
   * Custom clock function. **Recommended** to inject explicitly. Falls back to
   * `Date.now()` with a one-time `console.warn` if omitted.
   */
  clock?: ClockFn;
  /**
   * Custom ID generator. **Recommended** to inject explicitly. Falls back to a
   * UUID-shaped `Math.random()` string with a one-time `console.warn` if omitted.
   */
  idGenerator?: IdGeneratorFn;
  /** Initial skill definitions */
  skills?: Skill[];
  /** Session configuration */
  sessionConfig?: Partial<SessionConfig>;
  /**
   * If `true`, suppress the one-time non-determinism warning when `clock` or
   * `idGenerator` are omitted. Use only when you are intentionally accepting
   * non-replayability (e.g. a one-shot demo). Default `false`.
   */
  suppressNonDeterminismWarning?: boolean;
}

/**
 * Module-level flag so the warning fires at most once per JS process.
 * Exposed via {@link _resetNonDeterminismWarning} for tests.
 */
let nonDeterminismWarningEmitted = false;

/**
 * Test-only — reset the once-per-process warning latch.
 * Not part of the public SDK contract.
 */
export function _resetNonDeterminismWarning(): void {
  nonDeterminismWarningEmitted = false;
}

// ────────────────────────────────────────────────────────────────────────────
// Persistence transport — Phase B
// ────────────────────────────────────────────────────────────────────────────

/**
 * Transport interface for persisting and rehydrating engine state.
 *
 * `save` writes the JSON string from `engine.exportState()`.
 * `load` returns the previously saved string, or `null` if none exists.
 *
 * Implementations should propagate errors via rejected promises; the adapter's
 * autosave path catches them and routes them to the optional `onError` hook.
 */
export interface PersistenceTransport {
  save(state: string): Promise<void>;
  load(): Promise<string | null>;
}

/**
 * Options accepted by {@link CoreEngineAdapter.persistTo}.
 */
export interface PersistOptions {
  /**
   * Debounce window for autosaves. Mutations within this window coalesce into
   * a single `transport.save(...)` call.
   * - `> 0` (default 1000): classic debounce — wait this many ms after the last
   *   mutation, then save once.
   * - `0`: no coalescing — every mutation schedules its own microtask save.
   *   Useful for tests.
   */
  autosaveDebounceMs?: number;
  /**
   * Called with whatever `transport.save(...)` rejected with. Default behaviour
   * is to swallow the error so a flaky save does not crash the host app.
   */
  onError?: (error: unknown) => void;
}

/**
 * Build a {@link PersistenceTransport} backed by `window.localStorage`.
 *
 * Stores the full engine snapshot under `key`. Suitable for offline demos and
 * single-device pilots. Not suitable for cross-device sync (use
 * {@link httpTransport} for that, typically pointing at `/api/engine/state`).
 */
export function localStorageTransport(key: string): PersistenceTransport {
  const ls: Storage | undefined =
    typeof globalThis !== 'undefined' ? (globalThis as { localStorage?: Storage }).localStorage : undefined;
  if (!ls) {
    throw new Error(
      'localStorageTransport: window.localStorage is not available in this environment'
    );
  }
  return {
    async save(state: string): Promise<void> {
      ls.setItem(key, state);
    },
    async load(): Promise<string | null> {
      return ls.getItem(key);
    },
  };
}

/**
 * Build a {@link PersistenceTransport} backed by an HTTP endpoint.
 *
 * Matches the contract of `apps/server`'s `PUT /api/engine/state` and
 * `GET /api/engine/state` routes:
 *   - `PUT { state }` returns 200 on success.
 *   - `GET` returns `{ state }` on 200, or 404 when no state has been saved
 *     (treated as `null` by `load`).
 *
 * If `csrfToken` is provided, it is sent as the `X-CSRF-Token` header on save
 * (matches `apps/server/csrf.ts`).
 */
export function httpTransport(
  url: string,
  options?: { csrfToken?: string; fetchImpl?: typeof fetch }
): PersistenceTransport {
  const fetchImpl: typeof fetch =
    options?.fetchImpl ?? ((globalThis as { fetch?: typeof fetch }).fetch as typeof fetch);
  if (typeof fetchImpl !== 'function') {
    throw new Error('httpTransport: no fetch implementation available — pass options.fetchImpl');
  }
  return {
    async save(state: string): Promise<void> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options?.csrfToken) {
        headers['X-CSRF-Token'] = options.csrfToken;
      }
      const res = await fetchImpl(url, {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: JSON.stringify({ state }),
      });
      if (!res.ok) {
        throw new Error(`httpTransport: save failed (${res.status} ${res.statusText})`);
      }
    },
    async load(): Promise<string | null> {
      const res = await fetchImpl(url, { method: 'GET', credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`httpTransport: load failed (${res.status} ${res.statusText})`);
      }
      const data = (await res.json()) as { state?: string };
      return data.state ?? null;
    },
  };
}

/**
 * Default session configuration for sdk-web
 */
const DEFAULT_SDK_SESSION_CONFIG: SessionConfig = {
  maxDurationMinutes: 30,
  targetItems: 20,
  masteryThreshold: 0.85,
  enforceSpacedRetrieval: true,
  requireTransferTests: false, // Relaxed for web apps
};

/**
 * Generate a simple UUID-like ID
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Core Engine Adapter for sdk-web
 */
export class CoreEngineAdapter {
  private engine: NoesisCoreEngineImpl;
  private graph: SkillGraph;
  private eventContext: EventFactoryContext;
  private eventLog: NoesisEvent[] = [];
  private sessionId: string;
  private learnerId: string;
  private sessionConfig: SessionConfig;
  private debug: boolean;
  private clock: ClockFn;
  private idGenerator: IdGeneratorFn;

  // Persistence (Phase B). Set by persistTo; null until then.
  private transport: PersistenceTransport | null = null;
  private autosaveDebounceMs = 1000;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private onAutosaveError: ((error: unknown) => void) | null = null;

  constructor(config: CoreAdapterConfig) {
    this.debug = config.debug ?? false;
    this.learnerId = config.learnerId;

    const clockProvided = typeof config.clock === 'function';
    const idGeneratorProvided = typeof config.idGenerator === 'function';
    if (
      (!clockProvided || !idGeneratorProvided) &&
      !config.suppressNonDeterminismWarning &&
      !nonDeterminismWarningEmitted
    ) {
      nonDeterminismWarningEmitted = true;
      const missing = [
        !clockProvided ? 'clock' : null,
        !idGeneratorProvided ? 'idGenerator' : null,
      ]
        .filter(Boolean)
        .join(' and ');
      console.warn(
        `[NoesisSDK] CoreEngineAdapter constructed without ${missing}; falling back to ` +
          'Date.now() / Math.random(). Replay determinism is NOT guaranteed for events ' +
          'produced by this adapter. Inject clock + idGenerator to opt in to determinism, ' +
          'or set suppressNonDeterminismWarning: true to silence this notice.'
      );
    }

    this.clock = config.clock ?? (() => Date.now());
    this.idGenerator = config.idGenerator ?? generateId;
    this.sessionId = this.idGenerator();

    // Initialize skill graph
    this.graph = createSkillGraph(config.skills ?? []);

    // Event factory context shares the same clock + idGenerator as the engine,
    // so events created by the adapter and events created internally by the
    // engine (e.g. ImplicitCreditEvent) come from the same deterministic source.
    this.eventContext = createEventFactoryContext(this.clock, this.idGenerator);

    // Create core engine — pass BOTH clock and idGenerator so the engine's
    // own internal event creation is also deterministic when those are injected.
    this.engine = createNoesisCoreEngine(this.graph, {}, this.clock, this.idGenerator);

    // Session config
    this.sessionConfig = {
      ...DEFAULT_SDK_SESSION_CONFIG,
      ...config.sessionConfig,
    };

    this.log('CoreEngineAdapter initialized');
  }

  /**
   * Start a learning session
   */
  startSession(): SessionEvent {
    this.sessionId = this.idGenerator();
    const event = createSessionStartEvent(
      this.eventContext,
      this.learnerId,
      this.sessionId,
      this.sessionConfig
    );
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * End the current learning session
   */
  endSession(summary: {
    durationMinutes: number;
    itemsAttempted: number;
    itemsCorrect: number;
    skillsPracticed: string[];
  }): SessionEvent {
    const event = createSessionEndEvent(this.eventContext, this.learnerId, this.sessionId, summary);
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * Record a practice event
   */
  recordPractice(
    skillId: string,
    itemId: string,
    correct: boolean,
    responseTimeMs: number,
    options?: { confidence?: number; errorCategory?: string }
  ): PracticeEvent {
    const event = createPracticeEvent(
      this.eventContext,
      this.learnerId,
      this.sessionId,
      skillId,
      itemId,
      correct,
      responseTimeMs,
      options
    );
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * Record a diagnostic event
   */
  recordDiagnostic(
    skillsAssessed: string[],
    results: Array<{
      skillId: string;
      score: number;
      itemsAttempted: number;
      itemsCorrect: number;
    }>
  ): DiagnosticEvent {
    const event = createDiagnosticEvent(
      this.eventContext,
      this.learnerId,
      this.sessionId,
      skillsAssessed,
      results
    );
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * Get the next recommended action from the session planner
   */
  getNextAction(): SessionAction {
    return this.engine.getNextAction(this.learnerId, this.sessionConfig);
  }

  /**
   * Plan a complete session
   */
  planSession(): SessionAction[] {
    return this.engine.planSession(this.learnerId, this.sessionConfig);
  }

  /**
   * Get the learner's progress summary
   */
  getLearnerProgress() {
    return this.engine.getLearnerProgress(this.learnerId);
  }

  /**
   * Get mastery probability for a skill
   */
  getSkillMastery(skillId: string): number {
    const model = this.engine.getLearnerModel(this.learnerId);
    if (!model) return 0;
    const prob = model.skillProbabilities.get(skillId);
    return prob?.pMastery ?? 0;
  }

  /**
   * Get all unmastered skills
   */
  getUnmasteredSkills(threshold: number = 0.85): string[] {
    const model = this.engine.getLearnerModel(this.learnerId);
    if (!model) return [];

    const unmastered: string[] = [];
    for (const [skillId, prob] of model.skillProbabilities) {
      if (prob.pMastery < threshold) {
        unmastered.push(skillId);
      }
    }
    return unmastered;
  }

  /**
   * Get the complete event log
   */
  getEventLog(): NoesisEvent[] {
    return [...this.eventLog];
  }

  /**
   * Export event log as JSON
   */
  exportEventLog(): string {
    return JSON.stringify(this.eventLog, null, 2);
  }

  /**
   * Clear the event log
   */
  clearEventLog(): void {
    this.eventLog = [];
  }

  /**
   * Get the underlying core engine (for advanced use)
   */
  getCoreEngine(): NoesisCoreEngineImpl {
    return this.engine;
  }

  /**
   * Get the skill graph
   */
  getSkillGraph(): SkillGraph {
    return this.graph;
  }

  /**
   * Update the skill graph.
   * Preserves existing learner state by exporting before and importing after recreation.
   */
  updateSkillGraph(skills: Skill[]): void {
    // Preserve existing state across engine recreation
    const savedState = this.engine.exportState();
    this.graph = createSkillGraph(skills);
    // Pass both clock and idGenerator so the recreated engine inherits the
    // adapter's determinism contract (matches the constructor wiring above).
    this.engine = createNoesisCoreEngine(this.graph, {}, this.clock, this.idGenerator);
    try {
      this.engine.importState(savedState);
    } catch {
      // If import fails (e.g., incompatible state), start fresh — this is safer
      // than crashing. The event log in this adapter still holds the history.
      this.log('Warning: could not restore state after skill graph update, starting fresh');
    }
    this.log('Skill graph updated');
    // updateSkillGraph is a state-changing mutation but does not push an event,
    // so trigger autosave explicitly so persistence stays in sync.
    this.scheduleAutosave();
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Push event to log + schedule a persistence autosave.
   *
   * Every state-changing public method (startSession/endSession/recordPractice/
   * recordDiagnostic) flows through here, so this is the single hook point for
   * autosave. updateSkillGraph also explicitly invokes scheduleAutosave() since
   * it does not push an event of its own.
   */
  private pushEvent(event: NoesisEvent): void {
    this.eventLog.push(event);
    this.log('Event recorded:', event.type, event.id);
    this.scheduleAutosave();
  }

  // ─── Persistence (Phase B) ────────────────────────────────────────────────

  /**
   * Install a persistence transport. After this call, every state-changing
   * mutation triggers an autosave through {@link PersistenceTransport.save}.
   *
   * Call {@link hydrate} first if you want to restore prior state.
   * Call {@link flush} on page-unload to force a final save before the tab dies.
   */
  persistTo(transport: PersistenceTransport, options?: PersistOptions): void {
    this.transport = transport;
    this.autosaveDebounceMs = options?.autosaveDebounceMs ?? 1000;
    this.onAutosaveError = options?.onError ?? null;
    this.log('Persistence transport installed; debounce', this.autosaveDebounceMs, 'ms');
  }

  /**
   * Stop autosaving. Pending debounced save (if any) is cancelled.
   *
   * Use this when the consumer wants to take over persistence manually, or
   * when tearing down the adapter.
   */
  stopPersistence(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.transport = null;
    this.onAutosaveError = null;
  }

  /**
   * Load previously-persisted state from a transport into the engine.
   *
   * Returns `true` if state was found and imported, `false` if `transport.load`
   * returned `null` (no prior state). Errors from the transport propagate so
   * the caller can decide whether to surface them or start fresh.
   *
   * Hydration does NOT install the transport for autosave — call
   * {@link persistTo} for that. This separation is deliberate: a consumer may
   * hydrate from one source (e.g. localStorage cache) and persist to another
   * (e.g. the server) without coupling the two.
   */
  async hydrate(transport: PersistenceTransport): Promise<boolean> {
    const state = await transport.load();
    if (state === null || state === undefined) {
      this.log('Hydrate: no prior state in transport');
      return false;
    }
    this.engine.importState(state);
    this.log('Hydrate: state restored from transport');
    return true;
  }

  /**
   * Force an immediate save through the installed transport.
   *
   * Cancels any pending debounced save and awaits the new save. Use on
   * `beforeunload` / `pagehide` so the tab does not close mid-debounce.
   *
   * Returns silently when no transport is installed.
   */
  async flush(): Promise<void> {
    if (!this.transport) return;
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    await this.transport.save(this.engine.exportState());
  }

  /**
   * Schedule a save through the installed transport.
   *
   * - `autosaveDebounceMs > 0`: classic debounce. Multiple mutations within
   *   the window collapse into a single save fired `autosaveDebounceMs` after
   *   the last mutation.
   * - `autosaveDebounceMs === 0`: each mutation schedules its own microtask
   *   save (no coalescing).
   */
  private scheduleAutosave(): void {
    if (!this.transport) return;
    const transport = this.transport;
    const handleError = (err: unknown): void => {
      if (this.onAutosaveError) {
        this.onAutosaveError(err);
      } else {
        this.log('Autosave failed:', err);
      }
    };
    if (this.autosaveDebounceMs === 0) {
      const exported = this.engine.exportState();
      void Promise.resolve().then(() => transport.save(exported).catch(handleError));
      return;
    }
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      transport.save(this.engine.exportState()).catch(handleError);
    }, this.autosaveDebounceMs);
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[CoreEngineAdapter] ${message}`, ...args);
    }
  }
}

/**
 * Factory function
 */
export function createCoreEngineAdapter(config: CoreAdapterConfig): CoreEngineAdapter {
  return new CoreEngineAdapter(config);
}
