/**
 * Determinism Contract Tests
 *
 * These tests enforce the Core SDK's contract that wall-clock and ID generation
 * are explicit injection points — silent defaults are forbidden. A consumer
 * that forgets to inject either must get a thrown error, not a silently
 * non-deterministic engine.
 *
 * Why this matters: replay correctness, audit, and reproducibility all rest
 * on this contract. If `Date.now()` or `Math.random()` can leak in via a
 * default, the entire determinism guarantee is just a suggestion.
 *
 * See PLAN.md §A for the full motivation.
 */

import { describe, it, expect } from 'vitest';
import {
  NoesisCoreEngineImpl,
  createNoesisCoreEngine,
  createDeterministicEngine,
  createSystemEngine,
} from '../engine';
import { BKTEngine, createBKTEngine } from '../learner';
import { FSRSScheduler, createFSRSScheduler } from '../memory';
import {
  createEventFactoryContext,
  createDeterministicIdGenerator,
  createPracticeEvent,
  requireClock,
  requireIdGenerator,
  type ClockFn,
  type IdGeneratorFn,
} from '../events';
import { createSkillGraph } from '../graph';

// A minimal graph reused across cases.
const skills = [
  { id: 'a', name: 'A', prerequisites: [] },
  { id: 'b', name: 'B', prerequisites: ['a'] },
];

describe('Determinism contract: Core construction', () => {
  it('NoesisCoreEngineImpl throws when constructed without a clock', () => {
    const graph = createSkillGraph(skills);
    // Bypass the TypeScript required-parameter check the way a JS consumer would.
    expect(
      () =>
        new (NoesisCoreEngineImpl as unknown as new (
          g: unknown,
          c: unknown,
          clock?: ClockFn,
          idGen?: IdGeneratorFn
        ) => NoesisCoreEngineImpl)(graph, {}, undefined, () => 'id')
    ).toThrow(/clock must be injected/);
  });

  it('NoesisCoreEngineImpl throws when constructed without an idGenerator', () => {
    const graph = createSkillGraph(skills);
    expect(
      () =>
        new (NoesisCoreEngineImpl as unknown as new (
          g: unknown,
          c: unknown,
          clock?: ClockFn,
          idGen?: IdGeneratorFn
        ) => NoesisCoreEngineImpl)(graph, {}, () => 0, undefined)
    ).toThrow(/idGenerator must be injected/);
  });

  it('createNoesisCoreEngine throws without clock or idGenerator', () => {
    const graph = createSkillGraph(skills);
    expect(() =>
      (
        createNoesisCoreEngine as unknown as (
          g: unknown,
          c: unknown,
          clock?: ClockFn,
          idGen?: IdGeneratorFn
        ) => NoesisCoreEngineImpl
      )(graph, {})
    ).toThrow(/clock must be injected/);
  });

  it('BKTEngine constructor throws without a clock', () => {
    expect(
      () => new (BKTEngine as unknown as new (p: unknown, clock?: ClockFn) => BKTEngine)({})
    ).toThrow(/clock must be injected/);
  });

  it('createBKTEngine throws without a clock', () => {
    expect(() =>
      (createBKTEngine as unknown as (p: unknown, clock?: ClockFn) => unknown)({})
    ).toThrow(/clock must be injected/);
  });

  it('FSRSScheduler constructor throws without a clock', () => {
    expect(
      () =>
        new (FSRSScheduler as unknown as new (p: unknown, clock?: ClockFn) => FSRSScheduler)({})
    ).toThrow(/clock must be injected/);
  });

  it('createFSRSScheduler throws without a clock', () => {
    expect(() =>
      (createFSRSScheduler as unknown as (p: unknown, clock?: ClockFn) => unknown)({})
    ).toThrow(/clock must be injected/);
  });

  it('createEventFactoryContext throws without clock or idGenerator', () => {
    expect(() =>
      (
        createEventFactoryContext as unknown as (
          clock?: ClockFn,
          idGen?: IdGeneratorFn
        ) => unknown
      )()
    ).toThrow(/clock must be injected/);
    expect(() =>
      (
        createEventFactoryContext as unknown as (
          clock?: ClockFn,
          idGen?: IdGeneratorFn
        ) => unknown
      )(() => 0)
    ).toThrow(/idGenerator must be injected/);
  });

  it('requireClock and requireIdGenerator return the function when valid', () => {
    const clock = () => 42;
    const idGen = () => 'evt-1';
    expect(requireClock(clock)).toBe(clock);
    expect(requireIdGenerator(idGen)).toBe(idGen);
  });

  it('requireClock and requireIdGenerator throw on non-functions', () => {
    expect(() => requireClock(undefined)).toThrow(/clock must be injected/);
    expect(() => requireClock(null as unknown as ClockFn)).toThrow(/clock must be injected/);
    expect(() => requireClock(42 as unknown as ClockFn)).toThrow(/clock must be injected/);
    expect(() => requireIdGenerator(undefined)).toThrow(/idGenerator must be injected/);
    expect(() => requireIdGenerator('id' as unknown as IdGeneratorFn)).toThrow(
      /idGenerator must be injected/
    );
  });
});

describe('Determinism contract: createDeterministicEngine produces fully deterministic state', () => {
  it('two engines with the same seed and event sequence produce byte-identical state', () => {
    const graph1 = createSkillGraph(skills);
    const graph2 = createSkillGraph(skills);

    const engine1 = createDeterministicEngine(graph1, {}, 0);
    const engine2 = createDeterministicEngine(graph2, {}, 0);

    // Replay an identical event sequence into both engines using engine-local
    // event factories so each engine's own idGenerator/clock are used.
    const sequence = [
      { skillId: 'a', itemId: 'q1', correct: true, rt: 500 },
      { skillId: 'a', itemId: 'q2', correct: false, rt: 800 },
      { skillId: 'a', itemId: 'q3', correct: true, rt: 400 },
      { skillId: 'b', itemId: 'q4', correct: true, rt: 600 },
    ];

    for (const e of sequence) {
      const ctx1 = createEventFactoryContext(
        () => engine1.getCurrentTime(),
        () => engine1.generateEventId()
      );
      const ctx2 = createEventFactoryContext(
        () => engine2.getCurrentTime(),
        () => engine2.generateEventId()
      );
      engine1.processEvent(
        createPracticeEvent(ctx1, 'l1', 's1', e.skillId, e.itemId, e.correct, e.rt)
      );
      engine2.processEvent(
        createPracticeEvent(ctx2, 'l1', 's1', e.skillId, e.itemId, e.correct, e.rt)
      );
    }

    const state1 = engine1.exportState();
    const state2 = engine2.exportState();

    // Byte-identical export — the strongest determinism assertion.
    expect(state1).toBe(state2);
  });

  it('exportState → importState round-trip is fully lossless', () => {
    const graph = createSkillGraph(skills);
    const engine1 = createDeterministicEngine(graph, {}, 0);

    const ctx = createEventFactoryContext(
      () => engine1.getCurrentTime(),
      createDeterministicIdGenerator('evt')
    );
    engine1.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'a', 'q1', true, 500));
    engine1.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'a', 'q2', true, 400));

    const exported = engine1.exportState();

    const engine2 = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    engine2.importState(exported);

    expect(engine2.exportState()).toBe(exported);
  });
});

describe('Determinism contract: createSystemEngine is the explicit non-deterministic escape hatch', () => {
  it('produces a working engine with system clock + UUID-shaped IDs', () => {
    const graph = createSkillGraph(skills);
    const engine = createSystemEngine(graph);

    // Smoke: the engine works.
    const id = engine.generateEventId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    // It is NOT replayable: two calls return different IDs.
    expect(engine.generateEventId()).not.toBe(id);
  });
});
