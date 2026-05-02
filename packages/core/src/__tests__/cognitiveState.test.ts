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
// cognitive_state event today. The full reducer + timeline + round-trip
// assertions land in C2.
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
