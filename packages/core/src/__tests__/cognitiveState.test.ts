/**
 * Cognitive-State Vector tests (NALS, Phase C)
 *
 * Verifies:
 *  - C1: type + factory + union acceptance.
 *  - C2: engine reduces cognitive_state events into a per-learner timeline,
 *        and the timeline survives export/import round-trip.
 */

import { describe, it, expect } from 'vitest';
import { createSkillGraph } from '../graph';
import { createDeterministicEngine } from '../engine';
import {
  createCognitiveStateEvent,
  createEventFactoryContext,
  createDeterministicIdGenerator,
  validateEvent,
  type CognitiveStateVector,
  type NoesisEvent,
} from '../events';

const fixedVector: CognitiveStateVector = {
  attention: { value: 0.85, confidence: 0.9, timestamp: 1000 },
  recallStrength: { value: 0.6, confidence: 0.7, timestamp: 1000 },
  affect: { value: 0.75, confidence: 0.5, timestamp: 1000 },
};

describe('Phase C1: CognitiveStateEvent factory', () => {
  it('produces a deterministic event for a fixed clock + idGenerator', () => {
    const ctx = createEventFactoryContext(() => 1000, createDeterministicIdGenerator('cs'));

    const event = createCognitiveStateEvent(ctx, 'learner-1', 'session-1', fixedVector);

    // Snapshot-style comparison — all fields are predictable.
    expect(event).toEqual({
      id: 'cs-0001',
      type: 'cognitive_state',
      learnerId: 'learner-1',
      sessionId: 'session-1',
      timestamp: 1000,
      vector: fixedVector,
    });
  });

  it('NoesisEvent union accepts cognitive_state at the type level', () => {
    const ctx = createEventFactoryContext(() => 0, createDeterministicIdGenerator('cs'));
    // The next line failing to compile would be a type-level regression — by
    // having it here as a typed const, we assert the union accepts the variant.
    const e: NoesisEvent = createCognitiveStateEvent(ctx, 'l', 's', fixedVector);
    expect(e.type).toBe('cognitive_state');
    expect(validateEvent(e).valid).toBe(true);
  });

  it('passes validateEvent for a well-formed event', () => {
    const ctx = createEventFactoryContext(() => 1000, createDeterministicIdGenerator('cs'));
    const e = createCognitiveStateEvent(ctx, 'learner-1', 'session-1', fixedVector);
    expect(validateEvent(e).valid).toBe(true);
  });

  it('preserves the full vector verbatim — confidence/timestamp/value all carried through', () => {
    const ctx = createEventFactoryContext(() => 2000, createDeterministicIdGenerator('cs'));
    const v: CognitiveStateVector = {
      attention: { value: 0.1, confidence: 0.2, timestamp: 1500 },
      recallStrength: { value: 0.3, confidence: 0.4, timestamp: 1600 },
      affect: { value: 0.5, confidence: 0.6, timestamp: 1700 },
    };

    const e = createCognitiveStateEvent(ctx, 'l1', 's1', v);
    expect(e.vector.attention).toEqual({ value: 0.1, confidence: 0.2, timestamp: 1500 });
    expect(e.vector.recallStrength).toEqual({ value: 0.3, confidence: 0.4, timestamp: 1600 });
    expect(e.vector.affect).toEqual({ value: 0.5, confidence: 0.6, timestamp: 1700 });
  });
});

// Smoke check that the engine *at least does not crash* when given a
// cognitive_state event today.
describe('Phase C1: cognitive_state events flow through the engine without error', () => {
  it('engine.processEvent accepts a CognitiveStateEvent without throwing', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];
    const engine = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctx = createEventFactoryContext(
      () => engine.getCurrentTime(),
      () => engine.generateEventId()
    );
    expect(() =>
      engine.processEvent(createCognitiveStateEvent(ctx, 'l1', 's1', fixedVector))
    ).not.toThrow();
  });
});

describe('Phase C2: engine accumulates cognitive_state events', () => {
  it('appends each event to a per-learner timeline; getCognitiveState returns the most recent', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];
    const engine = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctx = createEventFactoryContext(
      () => engine.getCurrentTime(),
      () => engine.generateEventId()
    );

    const v1: CognitiveStateVector = {
      attention: { value: 0.5, confidence: 1, timestamp: 100 },
      recallStrength: { value: 0.5, confidence: 1, timestamp: 100 },
      affect: { value: 0.5, confidence: 1, timestamp: 100 },
    };
    const v2: CognitiveStateVector = {
      attention: { value: 0.7, confidence: 1, timestamp: 200 },
      recallStrength: { value: 0.6, confidence: 1, timestamp: 200 },
      affect: { value: 0.8, confidence: 1, timestamp: 200 },
    };
    const v3: CognitiveStateVector = {
      attention: { value: 0.9, confidence: 1, timestamp: 300 },
      recallStrength: { value: 0.7, confidence: 1, timestamp: 300 },
      affect: { value: 0.9, confidence: 1, timestamp: 300 },
    };

    engine.processEvent(createCognitiveStateEvent(ctx, 'learner-1', 's1', v1));
    engine.processEvent(createCognitiveStateEvent(ctx, 'learner-1', 's1', v2));
    engine.processEvent(createCognitiveStateEvent(ctx, 'learner-1', 's1', v3));

    const history = engine.getCognitiveStateHistory('learner-1');
    expect(history).toHaveLength(3);
    expect(history[0]).toEqual(v1);
    expect(history[1]).toEqual(v2);
    expect(history[2]).toEqual(v3);

    // Latest accessor returns the last vector.
    expect(engine.getCognitiveState('learner-1')).toEqual(v3);
  });

  it('isolates timelines per learner', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];
    const engine = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctx = createEventFactoryContext(
      () => engine.getCurrentTime(),
      () => engine.generateEventId()
    );

    engine.processEvent(createCognitiveStateEvent(ctx, 'A', 's1', fixedVector));
    engine.processEvent(createCognitiveStateEvent(ctx, 'A', 's1', fixedVector));
    engine.processEvent(createCognitiveStateEvent(ctx, 'B', 's1', fixedVector));

    expect(engine.getCognitiveStateHistory('A')).toHaveLength(2);
    expect(engine.getCognitiveStateHistory('B')).toHaveLength(1);
    expect(engine.getCognitiveStateHistory('C')).toHaveLength(0);
  });

  it('returns undefined for a learner with no cognitive_state events', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];
    const engine = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    expect(engine.getCognitiveState('nobody')).toBeUndefined();
    expect(engine.getCognitiveStateHistory('nobody')).toEqual([]);
  });

  it('returned history is a defensive copy — appending to it does not mutate engine state', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];
    const engine = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctx = createEventFactoryContext(
      () => engine.getCurrentTime(),
      () => engine.generateEventId()
    );

    engine.processEvent(createCognitiveStateEvent(ctx, 'A', 's1', fixedVector));
    const history = engine.getCognitiveStateHistory('A');
    history.push(fixedVector); // mutate the returned array
    expect(engine.getCognitiveStateHistory('A')).toHaveLength(1);
  });

  it('cognitive state survives export/import round-trip', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];

    const engineA = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctxA = createEventFactoryContext(
      () => engineA.getCurrentTime(),
      () => engineA.generateEventId()
    );

    const v1: CognitiveStateVector = {
      attention: { value: 0.4, confidence: 0.9, timestamp: 100 },
      recallStrength: { value: 0.3, confidence: 0.7, timestamp: 100 },
      affect: { value: 0.6, confidence: 0.5, timestamp: 100 },
    };
    const v2: CognitiveStateVector = {
      attention: { value: 0.8, confidence: 0.95, timestamp: 200 },
      recallStrength: { value: 0.5, confidence: 0.8, timestamp: 200 },
      affect: { value: 0.7, confidence: 0.6, timestamp: 200 },
    };

    engineA.processEvent(createCognitiveStateEvent(ctxA, 'l1', 's1', v1));
    engineA.processEvent(createCognitiveStateEvent(ctxA, 'l1', 's1', v2));

    const exported = engineA.exportState();

    const engineB = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    engineB.importState(exported);

    expect(engineB.getCognitiveStateHistory('l1')).toEqual([v1, v2]);
    expect(engineB.getCognitiveState('l1')).toEqual(v2);
    // Composes with A1 determinism: re-export yields the same string.
    expect(engineB.exportState()).toBe(exported);
  });

  it('replayEvents reconstructs cognitive state from the event log alone', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];
    const engineA = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctx = createEventFactoryContext(
      () => engineA.getCurrentTime(),
      () => engineA.generateEventId()
    );

    engineA.processEvent(createCognitiveStateEvent(ctx, 'l1', 's1', fixedVector));
    engineA.processEvent(createCognitiveStateEvent(ctx, 'l1', 's1', fixedVector));

    const events = engineA.getEventLog();

    // Engine B replays the captured events; cognitive state must reappear.
    const engineB = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    engineB.replayEvents(events);
    expect(engineB.getCognitiveStateHistory('l1')).toHaveLength(2);
  });

  it('importing a pre-1.2 snapshot (no cognitiveStates field) starts with empty timelines', () => {
    const skills = [{ id: 'a', name: 'A', prerequisites: [] }];
    const engine = createDeterministicEngine(createSkillGraph(skills), {}, 0);

    // Forge a snapshot lacking the cognitiveStates field.
    const legacyState = JSON.stringify({
      version: '1.1.0',
      timestamp: 0,
      learnerModels: [],
      memoryStates: [],
      transferResults: [],
      eventLog: [],
      learnerSpeeds: [],
    });

    expect(() => engine.importState(legacyState)).not.toThrow();
    expect(engine.getCognitiveStateHistory('any')).toEqual([]);
  });
});
