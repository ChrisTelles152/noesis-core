/**
 * Replay-Equivalence Property Tests (Phase A3)
 *
 * Property-style suite that gates the determinism contract in CI:
 *   - generate N events with a seeded PRNG
 *   - feed them into engine A via processEvent (sequential processing)
 *   - feed the same event log into engine B via replayEvents
 *   - assert byte-identical exportState() output
 *
 * Plus the export → import → export round-trip across many seeds, and an
 * order-sensitivity sanity check (shuffling the event order produces different
 * state, proving the byte-equality is not trivially passing).
 *
 * If this suite goes red, do not merge: replay determinism is broken.
 */

import { describe, it, expect } from 'vitest';
import { createDeterministicEngine, type NoesisCoreEngineImpl } from '../engine';
import { createSkillGraph } from '../graph';
import {
  createEventFactoryContext,
  createPracticeEvent,
  createDiagnosticEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  createCognitiveStateEvent,
  type NoesisEvent,
} from '../events';
import type { Skill } from '../constitution';

// A deterministic 32-bit PRNG (mulberry32). Same seed → same sequence forever,
// across machines and Node versions. Required because the property check has
// to be reproducible: a flaky property test gates nothing.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const skills: Skill[] = [
  { id: 'a', name: 'A', prerequisites: [] },
  { id: 'b', name: 'B', prerequisites: ['a'] },
  { id: 'c', name: 'C', prerequisites: ['a'] },
  { id: 'd', name: 'D', prerequisites: ['b', 'c'] },
];

/**
 * Generate `count` events using the given engine's clock and idGenerator,
 * driven by a seeded PRNG so the sequence is reproducible.
 *
 * The mix is biased to practice events (the dominant case in real workloads)
 * with occasional diagnostics and session boundaries to exercise all reducers.
 */
function generateEvents(engine: NoesisCoreEngineImpl, count: number, seed: number): NoesisEvent[] {
  const rng = mulberry32(seed);
  const ctx = createEventFactoryContext(
    () => engine.getCurrentTime(),
    () => engine.generateEventId()
  );
  const events: NoesisEvent[] = [];
  let inSession = false;
  let sessionId = 'session-init';

  for (let i = 0; i < count; i++) {
    const r = rng();
    if (!inSession || r < 0.02) {
      // ~2% chance to end+restart a session (boundary churn).
      if (inSession) {
        events.push(
          createSessionEndEvent(ctx, 'l1', sessionId, {
            durationMinutes: 5,
            itemsAttempted: 1,
            itemsCorrect: 1,
            skillsPracticed: ['a'],
          })
        );
      }
      sessionId = `session-${i}`;
      events.push(
        createSessionStartEvent(ctx, 'l1', sessionId, {
          maxDurationMinutes: 30,
          targetItems: 20,
          masteryThreshold: 0.85,
          enforceSpacedRetrieval: true,
          requireTransferTests: false,
        })
      );
      inSession = true;
    } else if (r < 0.05) {
      // ~3% diagnostic events.
      events.push(
        createDiagnosticEvent(
          ctx,
          'l1',
          sessionId,
          ['a', 'b'],
          [
            { skillId: 'a', score: rng(), itemsAttempted: 3, itemsCorrect: Math.floor(rng() * 4) },
            { skillId: 'b', score: rng(), itemsAttempted: 3, itemsCorrect: Math.floor(rng() * 4) },
          ]
        )
      );
    } else if (r < 0.15) {
      // ~10% cognitive_state events (NALS, Phase C). Vectors are seeded from
      // the same RNG so the gate verifies replay determinism for this reducer
      // path too.
      const ts = engine.getCurrentTime();
      events.push(
        createCognitiveStateEvent(ctx, 'l1', sessionId, {
          attention: { value: rng(), confidence: rng(), timestamp: ts },
          recallStrength: { value: rng(), confidence: rng(), timestamp: ts },
          affect: { value: rng(), confidence: rng(), timestamp: ts },
        })
      );
    } else {
      // The rest: practice events, randomised across skills + correctness.
      const skill = skills[Math.floor(rng() * skills.length)]!;
      const correct = rng() < 0.7; // bias toward correct, like real learners
      const responseTime = 500 + Math.floor(rng() * 5000);
      const confidence = rng();
      events.push(
        createPracticeEvent(ctx, 'l1', sessionId, skill.id, `item-${i}`, correct, responseTime, {
          confidence,
        })
      );
    }
  }
  return events;
}

describe('Replay-equivalence property: sequential processing == replayEvents', () => {
  it('byte-identical state after 200 events (seed=42)', () => {
    // Engine A drives event creation AND processes sequentially.
    const engineA = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const events = generateEvents(engineA, 200, 42);
    for (const e of events) engineA.processEvent(e);

    // Engine B: fresh, replays the same captured event log.
    const engineB = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    engineB.replayEvents(events);

    expect(engineB.exportState()).toBe(engineA.exportState());
  });

  it('byte-identical state across multiple seeds', () => {
    for (const seed of [1, 7, 42, 100, 123, 999, 31415]) {
      const engineA = createDeterministicEngine(createSkillGraph(skills), {}, 0);
      const events = generateEvents(engineA, 75, seed);
      for (const e of events) engineA.processEvent(e);

      const engineB = createDeterministicEngine(createSkillGraph(skills), {}, 0);
      engineB.replayEvents(events);

      expect(engineB.exportState()).toBe(engineA.exportState());
    }
  });
});

describe('Replay-equivalence property: exportState → importState round-trip is lossless', () => {
  it('byte-identical exportState before and after import, across many seeds', () => {
    for (const seed of [3, 17, 91, 2024, 8675309]) {
      const engineA = createDeterministicEngine(createSkillGraph(skills), {}, 0);
      const events = generateEvents(engineA, 60, seed);
      for (const e of events) engineA.processEvent(e);

      const exported = engineA.exportState();

      // A fresh engine that imports must export the exact same string.
      const engineB = createDeterministicEngine(createSkillGraph(skills), {}, 0);
      engineB.importState(exported);

      expect(engineB.exportState()).toBe(exported);
    }
  });
});

describe('Replay-equivalence property: order sensitivity sanity check', () => {
  it('reversing a non-trivial event sequence on a single skill produces different state', () => {
    // Construct two engines and feed them events on the SAME skill in opposite
    // orders. BKT is path-dependent: [correct, incorrect] vs [incorrect, correct]
    // produce different posterior pMastery. If this assertion ever flips, the
    // determinism test above could be trivially passing (e.g. both engines stuck
    // at default state) — so this is the canary.
    const engineA = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctxA = createEventFactoryContext(
      () => engineA.getCurrentTime(),
      () => engineA.generateEventId()
    );
    engineA.processEvent(createPracticeEvent(ctxA, 'l1', 's1', 'a', 'q1', true, 500));
    engineA.processEvent(createPracticeEvent(ctxA, 'l1', 's1', 'a', 'q2', false, 800));

    const engineB = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    const ctxB = createEventFactoryContext(
      () => engineB.getCurrentTime(),
      () => engineB.generateEventId()
    );
    engineB.processEvent(createPracticeEvent(ctxB, 'l1', 's1', 'a', 'q1', false, 800));
    engineB.processEvent(createPracticeEvent(ctxB, 'l1', 's1', 'a', 'q2', true, 500));

    expect(engineA.exportState()).not.toBe(engineB.exportState());
  });
});
