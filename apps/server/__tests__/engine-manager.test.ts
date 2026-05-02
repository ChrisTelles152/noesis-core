/**
 * EngineManager tests (Phase E1)
 *
 * Verifies the per-user engine cache + hydration path:
 *   - first access for a user with stored events rebuilds the engine state.
 *   - subsequent accesses return the same instance (no re-hydration cost).
 *   - LRU eviction persists state via storage and drops the entry.
 *   - flush + shutdown persist state without dropping the entry / drop after.
 *
 * The manager is constructed with fakes for CurriculumSource, EngineEventStore,
 * and EngineStateStore so the test runs without a database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createEngineManager,
  type Curriculum,
  type CurriculumSource,
  type EngineEventStore,
  type EngineStateStore,
} from '../engine-manager';
import { coreEventToLearningEvent } from '../event-bridge';
import {
  createDeterministicEngine,
  createSkillGraph,
  createEventFactoryContext,
  createPracticeEvent,
  type PracticeEvent,
  type Skill,
} from '@noesis-edu/core';

const skills: Skill[] = [
  { id: 'a', name: 'A', prerequisites: [] },
  { id: 'b', name: 'B', prerequisites: ['a'] },
];

/**
 * Build three practice events through a deterministic donor engine, return
 * them in the wire shape the manager expects from the event store
 * (LearningEvent rows wrapping `_coreEvent`).
 */
function buildSeedEvents(userId: number): {
  events: PracticeEvent[];
  rows: ReturnType<typeof coreEventToLearningEvent>[];
} {
  const donor = createDeterministicEngine(createSkillGraph(skills), {}, 0);
  const ctx = createEventFactoryContext(
    () => donor.getCurrentTime(),
    () => donor.generateEventId()
  );
  const events: PracticeEvent[] = [];
  for (let i = 0; i < 3; i++) {
    events.push(createPracticeEvent(ctx, 'l1', 's1', 'a', `q${i}`, true, 100 + i));
  }
  for (const e of events) donor.processEvent(e);
  const rows = events.map((e) => coreEventToLearningEvent(userId, e));
  return { events, rows };
}

function makeFakeStores(opts: {
  curriculum?: Curriculum;
  preLoadedRows?: ReturnType<typeof coreEventToLearningEvent>[];
  preLoadedState?: string | null;
}): {
  curriculumSource: CurriculumSource;
  events: EngineEventStore & { saved: ReturnType<typeof coreEventToLearningEvent>[] };
  state: EngineStateStore & { saved: Map<number, string> };
} {
  const events = {
    rows: opts.preLoadedRows ?? [],
    saved: [] as ReturnType<typeof coreEventToLearningEvent>[],
    getLearningEventsByUserId: vi.fn(async (_userId: number) => {
      // Note: in real storage, learning_events has an auto-id; we don't need it here.
      return events.rows.map((r, i) => ({
        ...r,
        id: i + 1,
        timestamp: r.timestamp ?? new Date(),
      })) as unknown as Awaited<ReturnType<EngineEventStore['getLearningEventsByUserId']>>;
    }),
  };
  const stateMap = new Map<number, string>();
  if (opts.preLoadedState !== undefined && opts.preLoadedState !== null) {
    stateMap.set(1, opts.preLoadedState);
  }
  const state = {
    saved: stateMap,
    saveEngineState: vi.fn(async (userId: number, s: string) => {
      stateMap.set(userId, s);
    }),
    loadEngineState: vi.fn(async (userId: number) => stateMap.get(userId) ?? null),
  };
  const curriculumSource: CurriculumSource = {
    loadCurriculum: vi.fn(async () => opts.curriculum ?? null),
  };
  return { curriculumSource, events, state };
}

describe('Phase E1: EngineManager.getEngineForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates engine from stored event log when no snapshot exists', async () => {
    const { events: seedEvents, rows: seedRows } = buildSeedEvents(1);
    const { curriculumSource, events, state } = makeFakeStores({
      curriculum: { skills },
      preLoadedRows: seedRows,
    });
    const mgr = createEngineManager({ curriculumSource, events, state });

    const engine = await mgr.getEngineForUser(1);
    expect(engine.getEventLog()).toHaveLength(seedEvents.length);
    expect(engine.getLearnerProgress('l1').totalEvents).toBe(seedEvents.length);
    expect(events.getLearningEventsByUserId).toHaveBeenCalledWith(1);
  });

  it('hydrates from snapshot when one exists (skips event-log replay)', async () => {
    // Build a snapshot from a donor with events, then construct a fake store
    // that has BOTH a snapshot AND raw events. The manager must prefer the
    // snapshot path (cheap) and skip the event-log replay path entirely.
    const donor = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctx = createEventFactoryContext(
      () => donor.getCurrentTime(),
      () => donor.generateEventId()
    );
    donor.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'a', 'q1', true, 100));
    donor.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'a', 'q2', true, 200));
    const snapshot = donor.exportState();

    const { curriculumSource, events, state } = makeFakeStores({
      curriculum: { skills },
      preLoadedRows: [], // would be wrong if used
      preLoadedState: snapshot,
    });
    const mgr = createEngineManager({ curriculumSource, events, state });

    const engine = await mgr.getEngineForUser(1);
    expect(engine.getLearnerProgress('l1').totalEvents).toBe(2);
    // Snapshot path should NOT have hit the event log.
    expect(events.getLearningEventsByUserId).not.toHaveBeenCalled();
    expect(state.loadEngineState).toHaveBeenCalledWith(1);
  });

  it('caches the engine across calls (one hydration per user)', async () => {
    const { curriculumSource, events, state } = makeFakeStores({ curriculum: { skills } });
    const mgr = createEngineManager({ curriculumSource, events, state });

    const a = await mgr.getEngineForUser(7);
    const b = await mgr.getEngineForUser(7);
    expect(a).toBe(b);
    // Curriculum + state load happen once per user, not per call.
    expect(curriculumSource.loadCurriculum).toHaveBeenCalledTimes(1);
    expect(state.loadEngineState).toHaveBeenCalledTimes(1);
  });

  it('respects LRU eviction when the cache exceeds maxCached', async () => {
    const { curriculumSource, events, state } = makeFakeStores({ curriculum: { skills } });
    let now = 0;
    const mgr = createEngineManager({
      curriculumSource,
      events,
      state,
      maxCached: 3,
      clock: () => ++now,
    });

    await mgr.getEngineForUser(1);
    await mgr.getEngineForUser(2);
    await mgr.getEngineForUser(3);
    expect(mgr.size()).toBe(3);

    // A fourth user evicts the oldest (user 1 — never re-touched).
    await mgr.getEngineForUser(4);
    expect(mgr.size()).toBe(3);
    expect(state.saveEngineState).toHaveBeenCalledWith(1, expect.any(String));

    // User 2 access should keep it warm — evict user 3 next time.
    await mgr.getEngineForUser(2);
    await mgr.getEngineForUser(5);
    expect(mgr.size()).toBe(3);
    expect(state.saveEngineState).toHaveBeenCalledWith(3, expect.any(String));
  });

  it('flush(userId) persists state without dropping the cache entry', async () => {
    const { curriculumSource, events, state } = makeFakeStores({ curriculum: { skills } });
    const mgr = createEngineManager({ curriculumSource, events, state });

    await mgr.getEngineForUser(1);
    expect(state.saveEngineState).not.toHaveBeenCalled();

    await mgr.flush(1);
    expect(state.saveEngineState).toHaveBeenCalledWith(1, expect.any(String));
    expect(mgr.size()).toBe(1);
  });

  it('shutdown() persists every cached engine and clears the cache', async () => {
    const { curriculumSource, events, state } = makeFakeStores({ curriculum: { skills } });
    const mgr = createEngineManager({ curriculumSource, events, state });

    await mgr.getEngineForUser(1);
    await mgr.getEngineForUser(2);
    await mgr.getEngineForUser(3);

    await mgr.shutdown();
    expect(state.saveEngineState).toHaveBeenCalledTimes(3);
    expect(state.saveEngineState).toHaveBeenCalledWith(1, expect.any(String));
    expect(state.saveEngineState).toHaveBeenCalledWith(2, expect.any(String));
    expect(state.saveEngineState).toHaveBeenCalledWith(3, expect.any(String));
    expect(mgr.size()).toBe(0);
  });

  it('handles users with no curriculum and no events (empty engine)', async () => {
    const { curriculumSource, events, state } = makeFakeStores({});
    const mgr = createEngineManager({ curriculumSource, events, state });

    const engine = await mgr.getEngineForUser(1);
    expect(engine.getEventLog()).toHaveLength(0);
    expect(engine.getLearnerProgress('whoever').totalEvents).toBe(0);
  });

  it('per-user isolation: two users get distinct engines with independent state', async () => {
    const { curriculumSource, events, state } = makeFakeStores({ curriculum: { skills } });
    const mgr = createEngineManager({ curriculumSource, events, state });

    const e1 = await mgr.getEngineForUser(1);
    const e2 = await mgr.getEngineForUser(2);
    expect(e1).not.toBe(e2);

    const ctx = createEventFactoryContext(
      () => e1.getCurrentTime(),
      () => e1.generateEventId()
    );
    e1.processEvent(createPracticeEvent(ctx, 'lA', 's1', 'a', 'q1', true, 100));

    expect(e1.getLearnerProgress('lA').totalEvents).toBe(1);
    expect(e2.getLearnerProgress('lA').totalEvents).toBe(0);
  });
});
