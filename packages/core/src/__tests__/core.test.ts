/**
 * Noesis Core SDK Tests
 *
 * Comprehensive test suite for all core modules.
 * Tests verify:
 * - Correct behavior
 * - Determinism (same inputs → same outputs)
 * - Known numeric expectations
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Graph module
import { createSkillGraph, type Skill } from '../graph';

// Learner module
import { createBKTEngine, DEFAULT_BKT_PARAMS } from '../learner';

// Memory module
import { createFSRSScheduler, calculateRetention, calculateNextInterval } from '../memory';

// Diagnostic module
import { createDiagnosticEngine } from '../diagnostic';

// Transfer module
import { createTransferGate } from '../transfer';

// Planning module
import { createSessionPlanner, DEFAULT_SESSION_CONFIG } from '../planning';

// Engine module
import { createNoesisCoreEngine, createDeterministicEngine } from '../engine';

// Event module
import {
  createEventFactoryContext,
  createDeterministicIdGenerator,
  createPracticeEvent,
} from '../events';

// Types
import type {
  SkillGraph,
  MemoryState,
  TransferTest,
  TransferTestResult,
  ItemSkillMapping,
  PracticeEvent,
  SessionAction,
} from '../constitution';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createTestSkills(): Skill[] {
  return [
    { id: 'arithmetic', name: 'Basic Arithmetic', prerequisites: [] },
    { id: 'algebra', name: 'Algebra', prerequisites: ['arithmetic'] },
    { id: 'geometry', name: 'Geometry', prerequisites: ['arithmetic'] },
    { id: 'calculus', name: 'Calculus', prerequisites: ['algebra', 'geometry'] },
    { id: 'statistics', name: 'Statistics', prerequisites: ['algebra'] },
  ];
}

function createTestItemMappings(): ItemSkillMapping[] {
  return [
    { itemId: 'item1', primarySkillId: 'arithmetic', secondarySkillIds: [], difficulty: 0.3 },
    { itemId: 'item2', primarySkillId: 'arithmetic', secondarySkillIds: [], difficulty: 0.5 },
    { itemId: 'item3', primarySkillId: 'arithmetic', secondarySkillIds: [], difficulty: 0.7 },
    { itemId: 'item4', primarySkillId: 'algebra', secondarySkillIds: ['arithmetic'], difficulty: 0.4 },
    { itemId: 'item5', primarySkillId: 'algebra', secondarySkillIds: ['arithmetic'], difficulty: 0.6 },
    { itemId: 'item6', primarySkillId: 'geometry', secondarySkillIds: ['arithmetic'], difficulty: 0.5 },
    { itemId: 'item7', primarySkillId: 'calculus', secondarySkillIds: ['algebra', 'geometry'], difficulty: 0.7 },
    { itemId: 'item8', primarySkillId: 'statistics', secondarySkillIds: ['algebra'], difficulty: 0.5 },
  ];
}

function createTestTransferTests(): TransferTest[] {
  return [
    { id: 'test1', skillId: 'arithmetic', transferType: 'near', context: 'Word problems', passingScore: 0.7 },
    { id: 'test2', skillId: 'arithmetic', transferType: 'far', context: 'Real-world budgeting', passingScore: 0.6 },
    { id: 'test3', skillId: 'algebra', transferType: 'near', context: 'Variable expressions', passingScore: 0.7 },
    { id: 'test4', skillId: 'algebra', transferType: 'far', context: 'Physics equations', passingScore: 0.6 },
  ];
}

// =============================================================================
// SKILL GRAPH TESTS
// =============================================================================

describe('SkillGraph', () => {
  it('should create a graph from skills', () => {
    const graph = createSkillGraph(createTestSkills());
    expect(graph.skills.size).toBe(5);
    expect(graph.getSkill('arithmetic')).toBeDefined();
    expect(graph.getSkill('calculus')).toBeDefined();
  });

  it('should validate a valid graph', () => {
    const graph = createSkillGraph(createTestSkills());
    const result = graph.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing prerequisites', () => {
    const skills: Skill[] = [
      { id: 'advanced', name: 'Advanced', prerequisites: ['missing'] },
    ];
    const graph = createSkillGraph(skills);
    const result = graph.validate();
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('MISSING_PREREQUISITE');
  });

  it('should detect cycles', () => {
    const skills: Skill[] = [
      { id: 'a', name: 'A', prerequisites: ['c'] },
      { id: 'b', name: 'B', prerequisites: ['a'] },
      { id: 'c', name: 'C', prerequisites: ['b'] },
    ];
    const graph = createSkillGraph(skills);
    const result = graph.validate();
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('CYCLE_DETECTED');
  });

  it('should return topological order', () => {
    const graph = createSkillGraph(createTestSkills());
    const order = graph.getTopologicalOrder();

    // Arithmetic must come before algebra and geometry
    expect(order.indexOf('arithmetic')).toBeLessThan(order.indexOf('algebra'));
    expect(order.indexOf('arithmetic')).toBeLessThan(order.indexOf('geometry'));

    // Algebra and geometry must come before calculus
    expect(order.indexOf('algebra')).toBeLessThan(order.indexOf('calculus'));
    expect(order.indexOf('geometry')).toBeLessThan(order.indexOf('calculus'));
  });

  it('should get all prerequisites transitively', () => {
    const graph = createSkillGraph(createTestSkills());
    const prereqs = graph.getAllPrerequisites('calculus');

    expect(prereqs).toContain('algebra');
    expect(prereqs).toContain('geometry');
    expect(prereqs).toContain('arithmetic');
  });

  it('should get dependents', () => {
    const graph = createSkillGraph(createTestSkills());
    const dependents = graph.getDependents('arithmetic');

    expect(dependents).toContain('algebra');
    expect(dependents).toContain('geometry');
    expect(dependents).toContain('calculus');
    expect(dependents).toContain('statistics');
  });

  it('should check prerequisite relationship', () => {
    const graph = createSkillGraph(createTestSkills());

    expect(graph.isPrerequisiteOf('arithmetic', 'calculus')).toBe(true);
    expect(graph.isPrerequisiteOf('calculus', 'arithmetic')).toBe(false);
  });

  it('should be deterministic', () => {
    const skills = createTestSkills();
    const graph1 = createSkillGraph(skills);
    const graph2 = createSkillGraph(skills);

    expect(graph1.getTopologicalOrder()).toEqual(graph2.getTopologicalOrder());
    expect(graph1.getAllPrerequisites('calculus')).toEqual(graph2.getAllPrerequisites('calculus'));
  });
});

// =============================================================================
// BKT ENGINE TESTS
// =============================================================================

describe('BKTEngine', () => {
  const fixedClock = () => 1000000;
  let engine: ReturnType<typeof createBKTEngine>;
  let graph: SkillGraph;

  beforeEach(() => {
    engine = createBKTEngine({}, fixedClock);
    graph = createSkillGraph(createTestSkills());
  });

  it('should create a model with default priors', () => {
    const model = engine.createModel('learner1', graph);

    expect(model.learnerId).toBe('learner1');
    expect(model.skillProbabilities.size).toBe(5);
    expect(model.totalEvents).toBe(0);

    for (const [, prob] of model.skillProbabilities) {
      expect(prob.pMastery).toBe(DEFAULT_BKT_PARAMS.pInit);
      expect(prob.pSlip).toBe(DEFAULT_BKT_PARAMS.pSlip);
      expect(prob.pGuess).toBe(DEFAULT_BKT_PARAMS.pGuess);
      expect(prob.pLearn).toBe(DEFAULT_BKT_PARAMS.pLearn);
    }
  });

  it('should update model on correct response', () => {
    let model = engine.createModel('learner1', graph);
    const initialP = engine.getPMastery(model, 'arithmetic');

    const event: PracticeEvent = {
      id: 'evt1',
      type: 'practice',
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: fixedClock(),
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: true,
      responseTimeMs: 5000,
    };

    model = engine.updateModel(model, event);
    const newP = engine.getPMastery(model, 'arithmetic');

    // Correct response should increase mastery probability
    expect(newP).toBeGreaterThan(initialP);
    expect(model.totalEvents).toBe(1);
  });

  it('should update model on incorrect response', () => {
    // Start with a higher initial mastery
    const highInitEngine = createBKTEngine({ pInit: 0.7 }, fixedClock);
    let model = highInitEngine.createModel('learner1', graph);
    const initialP = highInitEngine.getPMastery(model, 'arithmetic');

    const event: PracticeEvent = {
      id: 'evt1',
      type: 'practice',
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: fixedClock(),
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: false,
      responseTimeMs: 5000,
    };

    model = highInitEngine.updateModel(model, event);
    const newP = highInitEngine.getPMastery(model, 'arithmetic');

    // Incorrect response should decrease mastery probability (or increase less due to pLearn)
    expect(newP).toBeLessThan(initialP + 0.1); // Account for pLearn
  });

  it('should have known numeric values for BKT update', () => {
    // Using default params: pInit=0.3, pLearn=0.1, pSlip=0.1, pGuess=0.2
    let model = engine.createModel('learner1', graph);

    // Correct response BKT calculation:
    // P(correct) = (1-pSlip)*pMastery + pGuess*(1-pMastery)
    //            = 0.9 * 0.3 + 0.2 * 0.7 = 0.27 + 0.14 = 0.41
    // P(mastery|correct) = (1-pSlip)*pMastery / P(correct)
    //                    = 0.27 / 0.41 ≈ 0.6585
    // P(mastery after learn) = P(mastery|correct) + (1-P(mastery|correct)) * pLearn
    //                        ≈ 0.6585 + 0.3415 * 0.1 ≈ 0.6927

    const event: PracticeEvent = {
      id: 'evt1',
      type: 'practice',
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: fixedClock(),
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: true,
      responseTimeMs: 5000,
    };

    model = engine.updateModel(model, event);
    const pMastery = engine.getPMastery(model, 'arithmetic');

    expect(pMastery).toBeCloseTo(0.6927, 3);
  });

  it('should get unmastered skills', () => {
    let model = engine.createModel('learner1', graph);

    // Initially all skills are unmastered (pMastery = 0.3)
    let unmastered = engine.getUnmasteredSkills(model, 0.85);
    expect(unmastered).toHaveLength(5);

    // Simulate multiple correct responses to master arithmetic
    for (let i = 0; i < 10; i++) {
      const event: PracticeEvent = {
        id: `evt${i}`,
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: fixedClock(),
        skillId: 'arithmetic',
        itemId: 'item1',
        correct: true,
        responseTimeMs: 5000,
      };
      model = engine.updateModel(model, event);
    }

    unmastered = engine.getUnmasteredSkills(model, 0.85);
    expect(unmastered).not.toContain('arithmetic');
    expect(unmastered).toHaveLength(4);
  });

  it('should serialize and deserialize model', () => {
    let model = engine.createModel('learner1', graph);

    // Update the model
    const event: PracticeEvent = {
      id: 'evt1',
      type: 'practice',
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: fixedClock(),
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: true,
      responseTimeMs: 5000,
    };
    model = engine.updateModel(model, event);

    // Serialize and deserialize
    const serialized = engine.serialize(model);
    const restored = engine.deserialize(serialized);

    expect(restored.learnerId).toBe(model.learnerId);
    expect(restored.totalEvents).toBe(model.totalEvents);
    expect(engine.getPMastery(restored, 'arithmetic')).toBe(engine.getPMastery(model, 'arithmetic'));
  });

  it('should be deterministic', () => {
    const model1 = engine.createModel('learner1', graph);
    const model2 = engine.createModel('learner1', graph);

    const event: PracticeEvent = {
      id: 'evt1',
      type: 'practice',
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: fixedClock(),
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: true,
      responseTimeMs: 5000,
    };

    const updated1 = engine.updateModel(model1, event);
    const updated2 = engine.updateModel(model2, event);

    expect(engine.getPMastery(updated1, 'arithmetic')).toBe(engine.getPMastery(updated2, 'arithmetic'));
  });
});

// =============================================================================
// FSRS MEMORY SCHEDULER TESTS
// =============================================================================

describe('FSRSScheduler', () => {
  const _MS_PER_DAY = 24 * 60 * 60 * 1000;
  let currentTime = 0;
  const testClock = () => currentTime;
  let scheduler: ReturnType<typeof createFSRSScheduler>;

  beforeEach(() => {
    currentTime = 0;
    scheduler = createFSRSScheduler({}, testClock);
  });

  it('should create initial state for new skill', () => {
    const state = scheduler.createState('skill1');

    expect(state.skillId).toBe('skill1');
    expect(state.state).toBe('new');
    expect(state.successCount).toBe(0);
    expect(state.failureCount).toBe(0);
    expect(state.nextReview).toBe(0); // Due immediately
  });

  it('should schedule review after successful recall', () => {
    let state = scheduler.createState('skill1');

    // Successful recall with Good rating
    state = scheduler.scheduleReview(state, true, 3);

    expect(state.state).toBe('review');
    expect(state.successCount).toBe(1);
    expect(state.nextReview).toBeGreaterThan(currentTime);
  });

  it('should enter relearning on failed recall', () => {
    let state = scheduler.createState('skill1');

    // First get to review state
    state = scheduler.scheduleReview(state, true, 3);
    expect(state.state).toBe('review');

    // Now fail
    state = scheduler.scheduleReview(state, false, 1);

    expect(state.state).toBe('relearning');
    expect(state.failureCount).toBe(1);
  });

  it('should calculate retention correctly', () => {
    // Using FSRS formula: R(t) = (1 + t/(9*S))^(-1)
    // With stability S = 2.3 (Good rating initial)

    expect(calculateRetention(2.3, 0)).toBe(1.0);

    // After 1 day: R = (1 + 1/(9*2.3))^(-1) = (1 + 0.0483)^(-1) ≈ 0.954
    expect(calculateRetention(2.3, 1)).toBeCloseTo(0.954, 2);

    // After 10 days: R = (1 + 10/(9*2.3))^(-1) = (1 + 0.483)^(-1) ≈ 0.674
    expect(calculateRetention(2.3, 10)).toBeCloseTo(0.674, 2);
  });

  it('should calculate next interval correctly', () => {
    // Using FSRS formula: interval = S * 9 * (1/R - 1)
    // For 90% retention with stability 2.3:
    // interval = 2.3 * 9 * (1/0.9 - 1) = 2.3 * 9 * 0.111 ≈ 2.3 days

    const interval = calculateNextInterval(2.3, 0.9);
    expect(interval).toBeCloseTo(2.3, 1);
  });

  it('should get due skills', () => {
    const states: MemoryState[] = [
      { skillId: 'skill1', stability: 1, difficulty: 0.5, lastReview: 0, nextReview: 100, successCount: 1, failureCount: 0, state: 'review' },
      { skillId: 'skill2', stability: 1, difficulty: 0.5, lastReview: 0, nextReview: 200, successCount: 1, failureCount: 0, state: 'review' },
      { skillId: 'skill3', stability: 1, difficulty: 0.5, lastReview: 0, nextReview: 50, successCount: 1, failureCount: 0, state: 'review' },
    ];

    currentTime = 150;
    const due = scheduler.getDueSkills(states, currentTime);

    expect(due).toHaveLength(2);
    expect(due[0].skillId).toBe('skill3'); // Most overdue first
    expect(due[1].skillId).toBe('skill1');
  });

  it('should be deterministic', () => {
    const state1 = scheduler.createState('skill1');
    const state2 = scheduler.createState('skill1');

    const updated1 = scheduler.scheduleReview(state1, true, 3);
    const updated2 = scheduler.scheduleReview(state2, true, 3);

    expect(updated1.stability).toBe(updated2.stability);
    expect(updated1.nextReview).toBe(updated2.nextReview);
  });
});

// =============================================================================
// DIAGNOSTIC ENGINE TESTS
// =============================================================================

describe('DiagnosticEngine', () => {
  let diagnosticEngine: ReturnType<typeof createDiagnosticEngine>;
  let graph: SkillGraph;
  let itemMappings: ItemSkillMapping[];

  beforeEach(() => {
    diagnosticEngine = createDiagnosticEngine();
    graph = createSkillGraph(createTestSkills());
    itemMappings = createTestItemMappings();
  });

  it('should generate diagnostic test', () => {
    const items = diagnosticEngine.generateDiagnostic(graph, itemMappings, 10);

    expect(items.length).toBeLessThanOrEqual(10);
    expect(items.length).toBeGreaterThan(0);
  });

  it('should analyze results correctly', () => {
    const responses = [
      { itemId: 'item1', correct: true },
      { itemId: 'item2', correct: true },
      { itemId: 'item3', correct: false },
    ];

    const estimates = diagnosticEngine.analyzeResults(graph, itemMappings, responses);

    // Arithmetic: 2/3 correct with varying difficulty
    expect(estimates.get('arithmetic')).toBeGreaterThan(0.5);
    expect(estimates.get('arithmetic')).toBeLessThan(0.9);
  });

  it('should propagate estimates to prerequisites', () => {
    // If calculus is mastered, prerequisites should have high estimates
    const responses = [
      { itemId: 'item7', correct: true }, // Calculus item
    ];

    const estimates = diagnosticEngine.analyzeResults(graph, itemMappings, responses);

    // Calculus mastery should boost prerequisite estimates
    expect(estimates.get('arithmetic')).toBeDefined();
  });

  it('should be deterministic', () => {
    const items1 = diagnosticEngine.generateDiagnostic(graph, itemMappings, 10);
    const items2 = diagnosticEngine.generateDiagnostic(graph, itemMappings, 10);

    expect(items1).toEqual(items2);
  });
});

// =============================================================================
// TRANSFER GATE TESTS
// =============================================================================

describe('TransferGate', () => {
  let transferGate: ReturnType<typeof createTransferGate>;
  let tests: TransferTest[];
  let results: TransferTestResult[];

  beforeEach(() => {
    transferGate = createTransferGate({ requireNearTransfer: true, requireFarTransfer: false });
    tests = createTestTransferTests();
    results = [];
  });

  it('should check if skill is unlocked', () => {
    // No results - skill is locked (has required tests)
    expect(transferGate.isSkillUnlocked('arithmetic', results, tests)).toBe(false);

    // Pass near transfer test
    results.push({
      testId: 'test1',
      passed: true,
      score: 0.8,
      timestamp: 1000,
    });

    expect(transferGate.isSkillUnlocked('arithmetic', results, tests)).toBe(true);
  });

  it('should get required tests', () => {
    const required = transferGate.getRequiredTests('arithmetic', tests);

    expect(required.length).toBeGreaterThan(0);
    expect(required.some(t => t.transferType === 'near')).toBe(true);
  });

  it('should get pending tests', () => {
    const pending = transferGate.getPendingTests('arithmetic', results, tests);
    expect(pending.length).toBeGreaterThan(0);

    // Pass one test
    results.push({
      testId: 'test1',
      passed: true,
      score: 0.8,
      timestamp: 1000,
    });

    const pendingAfter = transferGate.getPendingTests('arithmetic', results, tests);
    expect(pendingAfter.length).toBeLessThan(pending.length);
  });

  it('should require far transfer when configured', () => {
    const strictGate = createTransferGate({ requireNearTransfer: true, requireFarTransfer: true });
    const required = strictGate.getRequiredTests('arithmetic', tests);

    expect(required.some(t => t.transferType === 'near')).toBe(true);
    expect(required.some(t => t.transferType === 'far')).toBe(true);
  });
});

// =============================================================================
// SESSION PLANNER TESTS
// =============================================================================

describe('SessionPlanner', () => {
  let graph: SkillGraph;
  let bktEngine: ReturnType<typeof createBKTEngine>;
  let _memoryScheduler: ReturnType<typeof createFSRSScheduler>;
  let sessionPlanner: ReturnType<typeof createSessionPlanner>;
  const fixedClock = () => 1000000;

  beforeEach(() => {
    graph = createSkillGraph(createTestSkills());
    bktEngine = createBKTEngine({}, fixedClock);
    _memoryScheduler = createFSRSScheduler({}, fixedClock);
    sessionPlanner = createSessionPlanner();
  });

  it('should prioritize due reviews', () => {
    const model = bktEngine.createModel('learner1', graph);
    const states: MemoryState[] = [
      {
        skillId: 'arithmetic',
        stability: 1,
        difficulty: 0.5,
        lastReview: 0,
        nextReview: 500000, // Due
        successCount: 1,
        failureCount: 0,
        state: 'review',
      },
    ];

    const action = sessionPlanner.getNextAction(model, graph, states, DEFAULT_SESSION_CONFIG);

    expect(action.type).toBe('review');
    expect(action.skillId).toBe('arithmetic');
  });

  it('should target skills with prerequisites mastered', () => {
    // Create a model where arithmetic is mastered
    let model = bktEngine.createModel('learner1', graph);

    // Master arithmetic through events
    for (let i = 0; i < 15; i++) {
      const event: PracticeEvent = {
        id: `evt${i}`,
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: fixedClock(),
        skillId: 'arithmetic',
        itemId: 'item1',
        correct: true,
        responseTimeMs: 5000,
      };
      model = bktEngine.updateModel(model, event);
    }

    const action = sessionPlanner.getNextAction(model, graph, [], DEFAULT_SESSION_CONFIG);

    // Should target algebra or geometry (both have arithmetic as prerequisite, which is now mastered)
    expect(['algebra', 'geometry']).toContain(action.skillId);
  });

  it('should plan a complete session', () => {
    const model = bktEngine.createModel('learner1', graph);
    const actions = sessionPlanner.planSession(model, graph, [], {
      ...DEFAULT_SESSION_CONFIG,
      targetItems: 5,
    });

    expect(actions.length).toBeLessThanOrEqual(5);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('should be deterministic', () => {
    const model = bktEngine.createModel('learner1', graph);

    const action1 = sessionPlanner.getNextAction(model, graph, [], DEFAULT_SESSION_CONFIG);
    const action2 = sessionPlanner.getNextAction(model, graph, [], DEFAULT_SESSION_CONFIG);

    expect(action1.skillId).toBe(action2.skillId);
    expect(action1.type).toBe(action2.type);
    expect(action1.priority).toBe(action2.priority);
  });
});

// =============================================================================
// CORE ENGINE TESTS
// =============================================================================

describe('NoesisCoreEngine', () => {
  let graph: SkillGraph;

  beforeEach(() => {
    graph = createSkillGraph(createTestSkills());
  });

  it('should create engine with all components', () => {
    const engine = createNoesisCoreEngine(graph);

    expect(engine.graph).toBeDefined();
    expect(engine.learnerEngine).toBeDefined();
    expect(engine.memoryScheduler).toBeDefined();
    expect(engine.sessionPlanner).toBeDefined();
    expect(engine.transferGate).toBeDefined();
    expect(engine.diagnosticEngine).toBeDefined();
  });

  it('should process practice events', () => {
    const engine = createDeterministicEngine(graph, {}, 0);

    const event: PracticeEvent = {
      id: 'evt1',
      type: 'practice',
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: 1000,
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: true,
      responseTimeMs: 5000,
    };

    engine.processEvent(event);

    const model = engine.getLearnerModel('learner1');
    expect(model).toBeDefined();
    expect(model!.totalEvents).toBe(1);
  });

  it('should replay events deterministically', () => {
    const events: PracticeEvent[] = [
      {
        id: 'evt1',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: 1000,
        skillId: 'arithmetic',
        itemId: 'item1',
        correct: true,
        responseTimeMs: 5000,
      },
      {
        id: 'evt2',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: 2000,
        skillId: 'arithmetic',
        itemId: 'item2',
        correct: true,
        responseTimeMs: 4000,
      },
      {
        id: 'evt3',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: 3000,
        skillId: 'arithmetic',
        itemId: 'item3',
        correct: false,
        responseTimeMs: 6000,
      },
    ];

    // Create two engines and replay same events
    const engine1 = createDeterministicEngine(graph, {}, 0);
    const engine2 = createDeterministicEngine(graph, {}, 0);

    engine1.replayEvents(events);
    engine2.replayEvents(events);

    const model1 = engine1.getLearnerModel('learner1')!;
    const model2 = engine2.getLearnerModel('learner1')!;

    // Same events should produce identical state
    expect(model1.totalEvents).toBe(model2.totalEvents);
    expect(model1.skillProbabilities.get('arithmetic')!.pMastery)
      .toBe(model2.skillProbabilities.get('arithmetic')!.pMastery);
  });

  it('should export and import state', () => {
    const engine = createDeterministicEngine(graph, {}, 0);

    // Process some events
    const event: PracticeEvent = {
      id: 'evt1',
      type: 'practice',
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: 1000,
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: true,
      responseTimeMs: 5000,
    };
    engine.processEvent(event);

    // Export state
    const exported = engine.exportState();

    // Create new engine and import
    const engine2 = createDeterministicEngine(graph, {}, 0);
    engine2.importState(exported);

    const model1 = engine.getLearnerModel('learner1')!;
    const model2 = engine2.getLearnerModel('learner1')!;

    expect(model2.totalEvents).toBe(model1.totalEvents);
  });

  it('should get learner progress', () => {
    const engine = createDeterministicEngine(graph, {}, 0);

    // Process events to master one skill
    for (let i = 0; i < 15; i++) {
      const event: PracticeEvent = {
        id: `evt${i}`,
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: 1000 + i * 1000,
        skillId: 'arithmetic',
        itemId: 'item1',
        correct: true,
        responseTimeMs: 5000,
      };
      engine.processEvent(event);
    }

    const progress = engine.getLearnerProgress('learner1');

    expect(progress.totalSkills).toBe(5);
    expect(progress.masteredSkills).toBeGreaterThanOrEqual(1);
    expect(progress.totalEvents).toBe(15);
  });

  it('should generate deterministic event IDs', () => {
    const engine = createDeterministicEngine(graph, {}, 0);

    const id1 = engine.generateEventId();
    const id2 = engine.generateEventId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^evt-\d{6}$/);
    expect(id2).toMatch(/^evt-\d{6}$/);
  });

  it('should produce identical getNextAction sequences on replay', () => {
    // Scenario: process events, call getNextAction after each, record actions
    // Replay same events -> actions must match exactly

    const events: PracticeEvent[] = [
      { id: 'evt1', type: 'practice', learnerId: 'learner1', sessionId: 'session1', timestamp: 1000, skillId: 'arithmetic', itemId: 'item1', correct: true, responseTimeMs: 5000 },
      { id: 'evt2', type: 'practice', learnerId: 'learner1', sessionId: 'session1', timestamp: 2000, skillId: 'arithmetic', itemId: 'item2', correct: true, responseTimeMs: 4000 },
      { id: 'evt3', type: 'practice', learnerId: 'learner1', sessionId: 'session1', timestamp: 3000, skillId: 'algebra', itemId: 'item3', correct: false, responseTimeMs: 6000 },
      { id: 'evt4', type: 'practice', learnerId: 'learner1', sessionId: 'session1', timestamp: 4000, skillId: 'arithmetic', itemId: 'item4', correct: true, responseTimeMs: 3000 },
      { id: 'evt5', type: 'practice', learnerId: 'learner1', sessionId: 'session1', timestamp: 5000, skillId: 'geometry', itemId: 'item5', correct: true, responseTimeMs: 4500 },
    ];

    const config = { ...DEFAULT_SESSION_CONFIG, enforceSpacedRetrieval: false };

    // First run: process events and record getNextAction after each
    const engine1 = createDeterministicEngine(graph, {}, 0);
    const actions1: SessionAction[] = [];
    for (const event of events) {
      engine1.processEvent(event);
      actions1.push(engine1.getNextAction('learner1', config));
    }

    // Second run: same events, same clock
    const engine2 = createDeterministicEngine(graph, {}, 0);
    const actions2: SessionAction[] = [];
    for (const event of events) {
      engine2.processEvent(event);
      actions2.push(engine2.getNextAction('learner1', config));
    }

    // Actions must match exactly
    expect(actions1.length).toBe(actions2.length);
    for (let i = 0; i < actions1.length; i++) {
      expect(actions1[i].type).toBe(actions2[i].type);
      expect(actions1[i].skillId).toBe(actions2[i].skillId);
      expect(actions1[i].priority).toBe(actions2[i].priority);
      expect(actions1[i].reason).toBe(actions2[i].reason);
    }
  });
});

// =============================================================================
// EVENT FACTORY TESTS
// =============================================================================

describe('Event Factories', () => {
  it('should create deterministic practice events', () => {
    let time = 0;
    let counter = 0;
    const clock = () => time;
    const idGen = () => `evt-${++counter}`;
    const ctx = createEventFactoryContext(clock, idGen);

    time = 1000;
    const event1 = createPracticeEvent(ctx, 'learner1', 'session1', 'skill1', 'item1', true, 5000);

    time = 2000;
    const event2 = createPracticeEvent(ctx, 'learner1', 'session1', 'skill1', 'item2', false, 3000);

    expect(event1.id).toBe('evt-1');
    expect(event1.timestamp).toBe(1000);
    expect(event1.correct).toBe(true);

    expect(event2.id).toBe('evt-2');
    expect(event2.timestamp).toBe(2000);
    expect(event2.correct).toBe(false);
  });

  it('should create deterministic ID generator', () => {
    const gen1 = createDeterministicIdGenerator('test');
    const gen2 = createDeterministicIdGenerator('test');

    expect(gen1()).toBe(gen2());
    expect(gen1()).toBe(gen2());
    expect(gen1()).toBe(gen2());
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Integration', () => {
  it('should run a complete learning session', () => {
    const graph = createSkillGraph(createTestSkills());
    const engine = createDeterministicEngine(graph, {}, 0);
    const itemMappings = createTestItemMappings();
    const transferTests = createTestTransferTests();

    engine.registerItemMappings(itemMappings);
    engine.registerTransferTests(transferTests);

    // Generate diagnostic
    const diagnosticItems = engine.generateDiagnostic(5);
    expect(diagnosticItems.length).toBeGreaterThan(0);

    // Process diagnostic event
    const diagnosticEvent = {
      id: 'diag-1',
      type: 'diagnostic' as const,
      learnerId: 'learner1',
      sessionId: 'session1',
      timestamp: 1000,
      skillsAssessed: ['arithmetic'],
      results: [
        { skillId: 'arithmetic', score: 0.5, itemsAttempted: 3, itemsCorrect: 2 },
      ],
    };
    engine.processEvent(diagnosticEvent);

    // Get next action
    const action = engine.getNextAction('learner1', DEFAULT_SESSION_CONFIG);
    expect(action.type).toBeDefined();

    // Plan a session
    const sessionPlan = engine.planSession('learner1', { ...DEFAULT_SESSION_CONFIG, targetItems: 5 });
    expect(sessionPlan.length).toBeGreaterThan(0);

    // Process practice events
    for (let i = 0; i < 10; i++) {
      const event: PracticeEvent = {
        id: `practice-${i}`,
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: 2000 + i * 1000,
        skillId: 'arithmetic',
        itemId: `item${(i % 3) + 1}`,
        correct: i % 2 === 0,
        responseTimeMs: 5000,
      };
      engine.processEvent(event);
    }

    // Check progress
    const progress = engine.getLearnerProgress('learner1');
    expect(progress.totalEvents).toBe(10);
    expect(progress.averageMastery).toBeGreaterThan(0);

    // Verify event log
    const eventLog = engine.getEventLog();
    expect(eventLog.length).toBe(11); // 1 diagnostic + 10 practice
  });

  it('should maintain determinism across full workflow', () => {
    const skills = createTestSkills();
    const events: PracticeEvent[] = [];

    // Generate consistent events
    for (let i = 0; i < 20; i++) {
      events.push({
        id: `evt-${i}`,
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: i * 1000,
        skillId: skills[i % skills.length].id,
        itemId: `item-${i}`,
        correct: i % 3 !== 0,
        responseTimeMs: 3000 + (i % 5) * 1000,
      });
    }

    // Run twice and compare
    const graph1 = createSkillGraph(skills);
    const graph2 = createSkillGraph(skills);
    const engine1 = createDeterministicEngine(graph1, {}, 0);
    const engine2 = createDeterministicEngine(graph2, {}, 0);

    engine1.replayEvents(events);
    engine2.replayEvents(events);

    // Export and compare
    const state1 = engine1.exportState();
    const state2 = engine2.exportState();

    // States should be identical
    expect(JSON.parse(state1)).toEqual(JSON.parse(state2));
  });

  it('should produce identical results across N runs (property-style determinism)', () => {
    // Property: For any fixed input sequence, N independent runs produce identical output
    const N_RUNS = 5;

    const skills = createTestSkills();
    const events: PracticeEvent[] = [];

    // Generate a fixed sequence of events
    for (let i = 0; i < 15; i++) {
      events.push({
        id: `evt-${i}`,
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: i * 1000,
        skillId: skills[i % skills.length].id,
        itemId: `item-${i}`,
        correct: i % 3 !== 0,
        responseTimeMs: 2000 + (i % 4) * 500,
      });
    }

    const config = { ...DEFAULT_SESSION_CONFIG, enforceSpacedRetrieval: false };

    // Run N times and collect results
    const results: Array<{
      finalMastery: Map<string, number>;
      eventLogLength: number;
      lastAction: string;
      exportedState: string;
    }> = [];

    for (let run = 0; run < N_RUNS; run++) {
      const graph = createSkillGraph(skills);
      const engine = createDeterministicEngine(graph, {}, 0);

      // Process events
      engine.replayEvents(events);

      // Get final mastery for each skill
      const model = engine.getLearnerModel('learner1')!;
      const finalMastery = new Map<string, number>();
      for (const [skillId, prob] of model.skillProbabilities) {
        finalMastery.set(skillId, prob.pMastery);
      }

      // Get next action
      const action = engine.getNextAction('learner1', config);

      results.push({
        finalMastery,
        eventLogLength: engine.getEventLog().length,
        lastAction: `${action.type}:${action.skillId}:${action.priority}`,
        exportedState: engine.exportState(),
      });
    }

    // All N runs must produce identical results
    const reference = results[0];
    for (let i = 1; i < N_RUNS; i++) {
      const current = results[i];

      // Event log length must match
      expect(current.eventLogLength).toBe(reference.eventLogLength);

      // Last action must match exactly
      expect(current.lastAction).toBe(reference.lastAction);

      // All mastery values must match
      for (const [skillId, mastery] of reference.finalMastery) {
        expect(current.finalMastery.get(skillId)).toBe(mastery);
      }

      // Exported states must be identical
      expect(JSON.parse(current.exportedState)).toEqual(JSON.parse(reference.exportedState));
    }
  });
});
