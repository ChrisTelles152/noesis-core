import { describe, it, expect } from 'vitest';
import {
  createNoesisCoreEngine,
  createDeterministicEngine,
  createSkillGraph,
  createPracticeEvent,
  createEventFactoryContext,
  createDeterministicIdGenerator,
} from '../index.js';
import type { Skill, ImplicitCreditEvent } from '../constitution.js';

function createEncompassingSkills(): Skill[] {
  return [
    { id: 'addition', name: 'Addition', prerequisites: [] },
    { id: 'subtraction', name: 'Subtraction', prerequisites: [] },
    { id: 'multiplication', name: 'Multiplication', prerequisites: ['addition'], encompassedSkills: ['addition'] },
    { id: 'division', name: 'Division', prerequisites: ['multiplication'], encompassedSkills: ['multiplication', 'subtraction'] },
  ];
}

describe('Implicit Credit Propagation (FIRe)', () => {
  const startTime = 1000000;

  function setupEngine(config: { implicitCreditFraction?: number; implicitCreditMinSpeed?: number } = {}) {
    const skills = createEncompassingSkills();
    const graph = createSkillGraph(skills);
    const engine = createDeterministicEngine(graph, {
      implicitCreditFraction: config.implicitCreditFraction ?? 0.5,
      implicitCreditMinSpeed: config.implicitCreditMinSpeed ?? 1.0,
    }, startTime);
    const idGen = createDeterministicIdGenerator('evt');
    const ctx = createEventFactoryContext(() => startTime, idGen);
    return { engine, ctx };
  }

  it('should shift encompassed skill nextReview forward on correct practice', () => {
    const { engine, ctx } = setupEngine();

    // First, practice addition so it has a memory state
    const addEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'addition', 'item-1', true, 5000);
    engine.processEvent(addEvent);

    const addStateBefore = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;
    const nextReviewBefore = addStateBefore.nextReview;

    // Now practice multiplication (which encompasses addition)
    const mulEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-2', true, 5000);
    engine.processEvent(mulEvent);

    const addStateAfter = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;

    // Addition's nextReview should have been shifted forward
    expect(addStateAfter.nextReview).toBeGreaterThan(nextReviewBefore);
  });

  it('should NOT give credit on incorrect practice', () => {
    const { engine, ctx } = setupEngine();

    // Practice addition first
    const addEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'addition', 'item-1', true, 5000);
    engine.processEvent(addEvent);

    const addStateBefore = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;

    // Practice multiplication INCORRECTLY
    const mulEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-2', false, 5000);
    engine.processEvent(mulEvent);

    const addStateAfter = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;

    // Addition's nextReview should NOT have changed
    expect(addStateAfter.nextReview).toBe(addStateBefore.nextReview);
  });

  it('should skip credit when learner speed is below minimum', () => {
    const { engine, ctx } = setupEngine({ implicitCreditMinSpeed: 1.0 });

    // Practice addition first
    const addEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'addition', 'item-1', true, 5000);
    engine.processEvent(addEvent);

    // Set learning speed for addition below minimum
    engine.setLearningSpeed('learner-1', 'addition', 0.7);

    const addStateBefore = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;

    // Practice multiplication (encompasses addition)
    const mulEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-2', true, 5000);
    engine.processEvent(mulEvent);

    const addStateAfter = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;

    // No credit — speed too low, learner must practice explicitly
    expect(addStateAfter.nextReview).toBe(addStateBefore.nextReview);
  });

  it('should emit ImplicitCreditEvent to event log', () => {
    const { engine, ctx } = setupEngine();

    // Set up states for encompassed skill
    const addEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'addition', 'item-1', true, 5000);
    engine.processEvent(addEvent);

    // Practice multiplication
    const mulEvent = createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-2', true, 5000);
    engine.processEvent(mulEvent);

    const log = engine.getEventLog();
    const creditEvents = log.filter((e) => e.type === 'implicit_credit') as ImplicitCreditEvent[];

    expect(creditEvents.length).toBe(1);
    expect(creditEvents[0].sourceSkillId).toBe('multiplication');
    expect(creditEvents[0].targetSkillId).toBe('addition');
    expect(creditEvents[0].creditFraction).toBe(0.5);
    expect(creditEvents[0].nextReviewShiftMs).toBeGreaterThan(0);
  });

  it('should propagate credit to multiple encompassed skills', () => {
    const { engine, ctx } = setupEngine();

    // Set up states for both encompassed skills
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-1', true, 5000));
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'subtraction', 'item-2', true, 5000));

    const mulBefore = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'multiplication')!.nextReview;
    const subBefore = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'subtraction')!.nextReview;

    // Practice division (encompasses multiplication AND subtraction)
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'division', 'item-3', true, 5000));

    const mulAfter = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'multiplication')!.nextReview;
    const subAfter = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'subtraction')!.nextReview;

    // Both should have been shifted forward
    expect(mulAfter).toBeGreaterThan(mulBefore);
    expect(subAfter).toBeGreaterThan(subBefore);

    // Should have 2 implicit credit events (one per encompassed skill)
    const creditEvents = engine.getEventLog().filter((e) => e.type === 'implicit_credit');
    expect(creditEvents.length).toBe(2);
  });

  it('should not give credit to skills without existing memory state', () => {
    const { engine, ctx } = setupEngine();

    // DO NOT practice addition first — it has no memory state

    // Practice multiplication (encompasses addition)
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-1', true, 5000));

    // No credit event should be emitted for addition (no existing state)
    const creditEvents = engine.getEventLog().filter((e) => e.type === 'implicit_credit');
    expect(creditEvents.length).toBe(0);
  });

  it('should not change stability or difficulty of encompassed skills', () => {
    const { engine, ctx } = setupEngine();

    // Practice addition
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'addition', 'item-1', true, 5000));

    const addBefore = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;

    // Practice multiplication (encompasses addition)
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-2', true, 5000));

    const addAfter = engine.getMemoryStates('learner-1').find((s) => s.skillId === 'addition')!;

    // Only nextReview changed — stability and difficulty are untouched
    expect(addAfter.stability).toBe(addBefore.stability);
    expect(addAfter.difficulty).toBe(addBefore.difficulty);
    expect(addAfter.successCount).toBe(addBefore.successCount);
    expect(addAfter.failureCount).toBe(addBefore.failureCount);
  });

  it('should be disabled when implicitCreditFraction is 0', () => {
    const { engine, ctx } = setupEngine({ implicitCreditFraction: 0 });

    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'addition', 'item-1', true, 5000));
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'multiplication', 'item-2', true, 5000));

    const creditEvents = engine.getEventLog().filter((e) => e.type === 'implicit_credit');
    expect(creditEvents.length).toBe(0);
  });

  it('should work with skills that have no encompassed skills (backward compat)', () => {
    const skills: Skill[] = [
      { id: 'a', name: 'A', prerequisites: [] },
      { id: 'b', name: 'B', prerequisites: ['a'] }, // no encompassedSkills
    ];
    const graph = createSkillGraph(skills);
    const engine = createDeterministicEngine(graph, { implicitCreditFraction: 0.5 }, startTime);
    const idGen = createDeterministicIdGenerator('evt');
    const ctx = createEventFactoryContext(() => startTime, idGen);

    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'a', 'item-1', true, 5000));
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 'session-1', 'b', 'item-2', true, 5000));

    // No credit events — no encompassed skills declared
    const creditEvents = engine.getEventLog().filter((e) => e.type === 'implicit_credit');
    expect(creditEvents.length).toBe(0);
  });
});
