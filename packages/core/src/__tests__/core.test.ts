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
  NoesisEvent,
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
    {
      itemId: 'item4',
      primarySkillId: 'algebra',
      secondarySkillIds: ['arithmetic'],
      difficulty: 0.4,
    },
    {
      itemId: 'item5',
      primarySkillId: 'algebra',
      secondarySkillIds: ['arithmetic'],
      difficulty: 0.6,
    },
    {
      itemId: 'item6',
      primarySkillId: 'geometry',
      secondarySkillIds: ['arithmetic'],
      difficulty: 0.5,
    },
    {
      itemId: 'item7',
      primarySkillId: 'calculus',
      secondarySkillIds: ['algebra', 'geometry'],
      difficulty: 0.7,
    },
    {
      itemId: 'item8',
      primarySkillId: 'statistics',
      secondarySkillIds: ['algebra'],
      difficulty: 0.5,
    },
  ];
}

function createTestTransferTests(): TransferTest[] {
  return [
    {
      id: 'test1',
      skillId: 'arithmetic',
      transferType: 'near',
      context: 'Word problems',
      passingScore: 0.7,
    },
    {
      id: 'test2',
      skillId: 'arithmetic',
      transferType: 'far',
      context: 'Real-world budgeting',
      passingScore: 0.6,
    },
    {
      id: 'test3',
      skillId: 'algebra',
      transferType: 'near',
      context: 'Variable expressions',
      passingScore: 0.7,
    },
    {
      id: 'test4',
      skillId: 'algebra',
      transferType: 'far',
      context: 'Physics equations',
      passingScore: 0.6,
    },
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
    const skills: Skill[] = [{ id: 'advanced', name: 'Advanced', prerequisites: ['missing'] }];
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

  it('should clean up dangling prerequisite references when removing a skill', () => {
    // Given: A → B → C (arithmetic is prereq of algebra, algebra is prereq of calculus)
    const graph = createSkillGraph(createTestSkills());

    // When: we remove 'algebra' which is a prerequisite of 'calculus' and 'statistics'
    const removed = graph.removeSkill('algebra');
    expect(removed).toBe(true);

    // Then: 'algebra' should no longer appear in any skill's prerequisites
    const calculus = graph.getSkill('calculus');
    expect(calculus).toBeDefined();
    expect(calculus!.prerequisites).not.toContain('algebra');

    const statistics = graph.getSkill('statistics');
    expect(statistics).toBeDefined();
    expect(statistics!.prerequisites).not.toContain('algebra');

    // And: the graph should still be valid (no MISSING_PREREQUISITE errors for 'algebra')
    const result = graph.validate();
    expect(result.valid).toBe(true);
  });

  it('should handle removing a skill with no dependents', () => {
    const graph = createSkillGraph(createTestSkills());

    // 'calculus' is a leaf node — no other skill lists it as a prerequisite
    const removed = graph.removeSkill('calculus');
    expect(removed).toBe(true);
    expect(graph.skills.size).toBe(4);

    const result = graph.validate();
    expect(result.valid).toBe(true);
  });

  it('should return false when removing a non-existent skill', () => {
    const graph = createSkillGraph(createTestSkills());
    expect(graph.removeSkill('nonexistent')).toBe(false);
    expect(graph.skills.size).toBe(5);
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
    expect(engine.getPMastery(restored, 'arithmetic')).toBe(
      engine.getPMastery(model, 'arithmetic')
    );
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

    expect(engine.getPMastery(updated1, 'arithmetic')).toBe(
      engine.getPMastery(updated2, 'arithmetic')
    );
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
      {
        skillId: 'skill1',
        stability: 1,
        difficulty: 0.5,
        lastReview: 0,
        nextReview: 100,
        successCount: 1,
        failureCount: 0,
        state: 'review',
      },
      {
        skillId: 'skill2',
        stability: 1,
        difficulty: 0.5,
        lastReview: 0,
        nextReview: 200,
        successCount: 1,
        failureCount: 0,
        state: 'review',
      },
      {
        skillId: 'skill3',
        stability: 1,
        difficulty: 0.5,
        lastReview: 0,
        nextReview: 50,
        successCount: 1,
        failureCount: 0,
        state: 'review',
      },
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
    expect(required.some((t) => t.transferType === 'near')).toBe(true);
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

    expect(required.some((t) => t.transferType === 'near')).toBe(true);
    expect(required.some((t) => t.transferType === 'far')).toBe(true);
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
    expect(model1.skillProbabilities.get('arithmetic')!.pMastery).toBe(
      model2.skillProbabilities.get('arithmetic')!.pMastery
    );
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
        skillId: 'algebra',
        itemId: 'item3',
        correct: false,
        responseTimeMs: 6000,
      },
      {
        id: 'evt4',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: 4000,
        skillId: 'arithmetic',
        itemId: 'item4',
        correct: true,
        responseTimeMs: 3000,
      },
      {
        id: 'evt5',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 'session1',
        timestamp: 5000,
        skillId: 'geometry',
        itemId: 'item5',
        correct: true,
        responseTimeMs: 4500,
      },
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
      results: [{ skillId: 'arithmetic', score: 0.5, itemsAttempted: 3, itemsCorrect: 2 }],
    };
    engine.processEvent(diagnosticEvent);

    // Get next action
    const action = engine.getNextAction('learner1', DEFAULT_SESSION_CONFIG);
    expect(action.type).toBeDefined();

    // Plan a session
    const sessionPlan = engine.planSession('learner1', {
      ...DEFAULT_SESSION_CONFIG,
      targetItems: 5,
    });
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

// =============================================================================
// HIGH-PRIORITY MISSING TESTS
// These 5 tests close the highest-risk untested code paths in the core engine.
// =============================================================================

describe('Critical Path: exportState/importState round-trip preserves all state', () => {
  // WHY THIS MATTERS: exportState/importState is the persistence boundary.
  // If memory states, transfer results, or the event log are lost during
  // round-trip, learners lose their review schedules and history between
  // sessions. The existing test only checked totalEvents on the learner model.
  it('should preserve learner model, memory states, transfer results, and event log', () => {
    const graph = createSkillGraph(createTestSkills());
    const engine = createDeterministicEngine(graph, {}, 0);

    // Process multiple practice events across different skills
    const practiceEvents: PracticeEvent[] = [
      {
        id: 'evt1',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 1000,
        skillId: 'arithmetic',
        itemId: 'item1',
        correct: true,
        responseTimeMs: 3000,
      },
      {
        id: 'evt2',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 2000,
        skillId: 'algebra',
        itemId: 'item4',
        correct: false,
        responseTimeMs: 8000,
      },
      {
        id: 'evt3',
        type: 'practice',
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 3000,
        skillId: 'arithmetic',
        itemId: 'item2',
        correct: true,
        responseTimeMs: 2500,
      },
    ];

    for (const evt of practiceEvents) {
      engine.processEvent(evt);
    }

    // Also process a transfer test event so transferResults are populated
    engine.processEvent({
      id: 'transfer1',
      type: 'transfer_test' as const,
      learnerId: 'learner1',
      sessionId: 's1',
      timestamp: 4000,
      testId: 'tt1',
      skillId: 'arithmetic',
      transferType: 'near' as const,
      score: 0.85,
      passed: true,
    });

    // Capture original state
    const origModel = engine.getLearnerModel('learner1')!;
    const origMemory = engine.getMemoryStates('learner1');
    const origTransfer = engine.getTransferResults();
    const origLog = engine.getEventLog();
    const origNextAction = engine.getNextAction('learner1', {
      ...DEFAULT_SESSION_CONFIG,
      enforceSpacedRetrieval: false,
    });

    // Export and import into a fresh engine
    const exported = engine.exportState();
    const engine2 = createDeterministicEngine(graph, {}, 0);
    engine2.importState(exported);

    // Verify learner model
    const restoredModel = engine2.getLearnerModel('learner1')!;
    expect(restoredModel.totalEvents).toBe(origModel.totalEvents);
    expect(restoredModel.learnerId).toBe(origModel.learnerId);
    for (const [skillId, prob] of origModel.skillProbabilities) {
      expect(restoredModel.skillProbabilities.get(skillId)!.pMastery).toBe(prob.pMastery);
    }

    // Verify memory states (FSRS scheduling data)
    const restoredMemory = engine2.getMemoryStates('learner1');
    expect(restoredMemory.length).toBe(origMemory.length);
    for (let i = 0; i < origMemory.length; i++) {
      expect(restoredMemory[i].skillId).toBe(origMemory[i].skillId);
      expect(restoredMemory[i].stability).toBe(origMemory[i].stability);
      expect(restoredMemory[i].difficulty).toBe(origMemory[i].difficulty);
      expect(restoredMemory[i].nextReview).toBe(origMemory[i].nextReview);
      expect(restoredMemory[i].state).toBe(origMemory[i].state);
    }

    // Verify transfer results
    const restoredTransfer = engine2.getTransferResults();
    expect(restoredTransfer).toEqual(origTransfer);

    // Verify event log
    const restoredLog = engine2.getEventLog();
    expect(restoredLog.length).toBe(origLog.length);
    expect(restoredLog).toEqual(origLog);

    // Verify the imported engine produces the same next action
    const restoredAction = engine2.getNextAction('learner1', {
      ...DEFAULT_SESSION_CONFIG,
      enforceSpacedRetrieval: false,
    });
    expect(restoredAction.type).toBe(origNextAction.type);
    expect(restoredAction.skillId).toBe(origNextAction.skillId);
    expect(restoredAction.priority).toBe(origNextAction.priority);
  });
});

describe('Critical Path: replayEvents produces identical state to sequential processEvent', () => {
  // WHY THIS MATTERS: replayEvents() is the foundation for deterministic replay
  // and state reconstruction. If it diverges from sequential processing, learner
  // state can't be reliably reconstructed from event logs — breaking persistence
  // and audit trails. The existing test only compares two replays against each
  // other, never against sequential processing.
  it('should match sequential processEvent for mixed event types', () => {
    const graph = createSkillGraph(createTestSkills());

    const events: NoesisEvent[] = [
      {
        id: 'diag1',
        type: 'diagnostic' as const,
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 1000,
        skillsAssessed: ['arithmetic', 'algebra'],
        results: [
          { skillId: 'arithmetic', score: 0.6, itemsAttempted: 3, itemsCorrect: 2 },
          { skillId: 'algebra', score: 0.3, itemsAttempted: 3, itemsCorrect: 1 },
        ],
      },
      {
        id: 'p1',
        type: 'practice' as const,
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 2000,
        skillId: 'arithmetic',
        itemId: 'item1',
        correct: true,
        responseTimeMs: 4000,
      },
      {
        id: 'p2',
        type: 'practice' as const,
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 3000,
        skillId: 'algebra',
        itemId: 'item4',
        correct: true,
        responseTimeMs: 5000,
      },
      {
        id: 'p3',
        type: 'practice' as const,
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 4000,
        skillId: 'arithmetic',
        itemId: 'item2',
        correct: false,
        responseTimeMs: 7000,
      },
      {
        id: 'tt1',
        type: 'transfer_test' as const,
        learnerId: 'learner1',
        sessionId: 's1',
        timestamp: 5000,
        testId: 'test1',
        skillId: 'arithmetic',
        transferType: 'near' as const,
        score: 0.9,
        passed: true,
      },
    ];

    // Sequential: process events one at a time
    const seqEngine = createDeterministicEngine(graph, {}, 0);
    for (const event of events) {
      seqEngine.processEvent(event);
    }

    // Replay: process all events via replayEvents()
    const replayEngine = createDeterministicEngine(graph, {}, 0);
    replayEngine.replayEvents(events);

    // Compare learner models
    const seqModel = seqEngine.getLearnerModel('learner1')!;
    const repModel = replayEngine.getLearnerModel('learner1')!;
    expect(repModel.totalEvents).toBe(seqModel.totalEvents);
    for (const [skillId, prob] of seqModel.skillProbabilities) {
      expect(repModel.skillProbabilities.get(skillId)!.pMastery).toBe(prob.pMastery);
    }

    // Compare memory states
    const seqMem = seqEngine.getMemoryStates('learner1');
    const repMem = replayEngine.getMemoryStates('learner1');
    expect(repMem.length).toBe(seqMem.length);
    for (let i = 0; i < seqMem.length; i++) {
      expect(repMem[i]).toEqual(seqMem[i]);
    }

    // Compare transfer results
    expect(replayEngine.getTransferResults()).toEqual(seqEngine.getTransferResults());

    // Compare event logs
    expect(replayEngine.getEventLog()).toEqual(seqEngine.getEventLog());
  });
});

describe('Critical Path: FSRS repeated failures do not produce stuck state', () => {
  // WHY THIS MATTERS: If a learner repeatedly fails, FSRS stability bottoms
  // out at 0.1. We need to verify that: (a) the interval doesn't become 0 or
  // negative, (b) the learner can still recover to review state, and (c) the
  // system doesn't get stuck in an infinite relearning loop.
  it('should maintain minimum interval and allow recovery after many failures', () => {
    let currentTime = 0;
    const testClock = () => currentTime;
    const scheduler = createFSRSScheduler({}, testClock);

    let state = scheduler.createState('skill1');

    // Simulate 20 consecutive failures
    for (let i = 0; i < 20; i++) {
      state = scheduler.scheduleReview(state, false, 1);
      currentTime += 1000; // advance 1 second between attempts
    }

    // Stability should be at minimum (0.1) but not zero or negative
    expect(state.stability).toBeGreaterThanOrEqual(0.1);
    expect(state.failureCount).toBe(20);

    // Next review should still be a valid future timestamp (not stuck at 0)
    expect(state.nextReview).toBeGreaterThanOrEqual(currentTime);

    // State should be relearning, not stuck in an invalid state
    expect(['relearning', 'learning']).toContain(state.state);

    // Now simulate recovery: consecutive correct answers should eventually
    // bring the learner back to 'review' state
    for (let i = 0; i < 5; i++) {
      currentTime += 24 * 60 * 60 * 1000; // advance 1 day
      state = scheduler.scheduleReview(state, true, 3);
    }

    // After multiple successes, should be back in review state
    expect(state.state).toBe('review');
    expect(state.successCount).toBe(5);
    // Stability should have grown from the minimum
    expect(state.stability).toBeGreaterThan(0.1);
    // Next review should be in the future
    expect(state.nextReview).toBeGreaterThan(currentTime);
  });
});

describe('Critical Path: Session planner returns rest when all skills mastered', () => {
  // WHY THIS MATTERS: If the planner has no work to suggest (all mastered,
  // no reviews due, no transfer tests), it must return a 'rest' action.
  // If it instead throws or returns undefined, the application breaks.
  // Transfer tests disabled + all mastered is a common pilot scenario.
  it('should return rest action with no transfer tests and all skills mastered', () => {
    const graph = createSkillGraph(createTestSkills());
    const fixedClock = () => 1000000;
    const bktEngine = createBKTEngine({}, fixedClock);
    const sessionPlanner = createSessionPlanner();

    let model = bktEngine.createModel('learner1', graph);

    // Master every skill by applying many correct responses
    const skills = ['arithmetic', 'algebra', 'geometry', 'calculus', 'statistics'];
    for (const skillId of skills) {
      for (let i = 0; i < 20; i++) {
        const event: PracticeEvent = {
          id: `evt-${skillId}-${i}`,
          type: 'practice',
          learnerId: 'learner1',
          sessionId: 's1',
          timestamp: fixedClock(),
          skillId,
          itemId: `item-${skillId}-${i}`,
          correct: true,
          responseTimeMs: 3000,
        };
        model = bktEngine.updateModel(model, event);
      }
    }

    // Verify all skills are above mastery threshold
    for (const skillId of skills) {
      expect(bktEngine.getPMastery(model, skillId)).toBeGreaterThanOrEqual(0.85);
    }

    // No memory states (no reviews due), no transfer tests
    const config = {
      ...DEFAULT_SESSION_CONFIG,
      requireTransferTests: false,
      enforceSpacedRetrieval: false,
    };

    const action = sessionPlanner.getNextAction(model, graph, [], config);

    // Must return 'rest' — not throw, not return undefined
    expect(action).toBeDefined();
    expect(action.type).toBe('rest');
    expect(action.reason).toBeDefined();
  });
});

describe('Critical Path: BKT diagnostic initialization followed by practice', () => {
  // WHY THIS MATTERS: In the real flow, a learner takes a diagnostic test
  // first (which seeds their BKT priors), then starts practicing. If diagnostic
  // initialization doesn't properly set pMastery, or if subsequent practice
  // events overwrite the diagnostic seeds incorrectly, the learner gets wrong
  // recommendations from the start.
  it('should use diagnostic priors and update correctly with practice', () => {
    const graph = createSkillGraph(createTestSkills());
    const engine = createDeterministicEngine(graph, {}, 0);

    // Step 1: Diagnostic sets arithmetic high (0.8) and algebra low (0.2)
    engine.processEvent({
      id: 'diag1',
      type: 'diagnostic' as const,
      learnerId: 'learner1',
      sessionId: 's1',
      timestamp: 1000,
      skillsAssessed: ['arithmetic', 'algebra'],
      results: [
        { skillId: 'arithmetic', score: 0.8, itemsAttempted: 5, itemsCorrect: 4 },
        { skillId: 'algebra', score: 0.2, itemsAttempted: 5, itemsCorrect: 1 },
      ],
    });

    const modelAfterDiag = engine.getLearnerModel('learner1')!;
    const arithmeticAfterDiag = modelAfterDiag.skillProbabilities.get('arithmetic')!.pMastery;
    const algebraAfterDiag = modelAfterDiag.skillProbabilities.get('algebra')!.pMastery;

    // Diagnostic should set priors according to scores
    expect(arithmeticAfterDiag).toBeCloseTo(0.8, 1);
    expect(algebraAfterDiag).toBeCloseTo(0.2, 1);

    // Step 2: Practice arithmetic (correct) — should increase from diagnostic prior
    engine.processEvent({
      id: 'p1',
      type: 'practice' as const,
      learnerId: 'learner1',
      sessionId: 's1',
      timestamp: 2000,
      skillId: 'arithmetic',
      itemId: 'item1',
      correct: true,
      responseTimeMs: 3000,
    });

    const modelAfterPractice = engine.getLearnerModel('learner1')!;
    const arithmeticAfterPractice =
      modelAfterPractice.skillProbabilities.get('arithmetic')!.pMastery;

    // Correct answer on skill with high prior should push it higher
    expect(arithmeticAfterPractice).toBeGreaterThan(arithmeticAfterDiag);

    // Step 3: Practice algebra (incorrect) — should decrease from diagnostic prior
    engine.processEvent({
      id: 'p2',
      type: 'practice' as const,
      learnerId: 'learner1',
      sessionId: 's1',
      timestamp: 3000,
      skillId: 'algebra',
      itemId: 'item4',
      correct: false,
      responseTimeMs: 8000,
    });

    const modelAfterWrong = engine.getLearnerModel('learner1')!;
    const algebraAfterWrong = modelAfterWrong.skillProbabilities.get('algebra')!.pMastery;

    // Even though incorrect, pLearn transition means mastery may not drop below
    // the initial diagnostic value. But it should be close to or below it.
    // The key check: it shouldn't jump to the default 0.3 (ignoring diagnostic).
    // With pInit=0.3 default and diagnostic setting 0.2, after incorrect:
    // The BKT update should use the diagnostic 0.2 as the prior, not default 0.3.
    // If diagnostic was ignored, we'd see mastery around 0.3 (default pInit).
    expect(algebraAfterWrong).toBeLessThan(0.3);

    // Unaffected skills should remain at default (0.3) since diagnostic didn't touch them
    const geometryMastery = modelAfterWrong.skillProbabilities.get('geometry')!.pMastery;
    expect(geometryMastery).toBe(0.3); // default pInit, untouched
  });
});
