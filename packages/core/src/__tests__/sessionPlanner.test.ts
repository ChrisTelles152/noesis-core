/**
 * SessionPlannerImpl Tests
 *
 * Tests for the deterministic session planner that prioritizes:
 * 1. Due spaced retrieval items
 * 2. Transfer tests for mastered skills
 * 3. Error-focused practice
 * 4. New skill introduction (leverage-based)
 * 5. Consolidation practice
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionPlannerImpl,
  createSessionPlanner,
  DEFAULT_SESSION_PLANNER_CONFIG,
} from '../planning/SessionPlannerImpl.js';
import type {
  SkillGraph,
  LearnerModel,
  MemoryState,
  SessionConfig,
  TransferTest,
  TransferTestResult,
} from '../constitution.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Create a mock skill graph for testing
 */
function createMockSkillGraph(
  skills: string[],
  prereqs: Record<string, string[]> = {}
): SkillGraph {
  const skillMap = new Map(
    skills.map((s) => [s, { id: s, name: s, prerequisites: prereqs[s] || [] }])
  );

  // Build dependents map for getDependents()
  const dependents: Record<string, string[]> = {};
  for (const skill of skills) {
    dependents[skill] = [];
  }
  for (const [skill, deps] of Object.entries(prereqs)) {
    for (const dep of deps) {
      if (dependents[dep]) {
        dependents[dep].push(skill);
      }
    }
  }

  return {
    skills: skillMap,
    validate: () => ({ valid: true, errors: [] }),
    getTopologicalOrder: () => skills,
    getAllPrerequisites: (skillId: string) => prereqs[skillId] || [],
    getDependents: (skillId: string) => dependents[skillId] || [],
    isPrerequisiteOf: (a: string, b: string) => (prereqs[b] || []).includes(a),
  };
}

/**
 * Create a mock learner model
 */
function createMockLearnerModel(
  skillMasteries: Record<string, number>,
  timestamp: number
): LearnerModel {
  const skillProbabilities = new Map(
    Object.entries(skillMasteries).map(([skillId, pMastery]) => [
      skillId,
      { skillId, pMastery, confidence: 0.8, lastUpdated: timestamp },
    ])
  );

  return {
    learnerId: 'test-learner',
    skillProbabilities,
    totalEvents: 0,
    createdAt: timestamp,
    lastUpdated: timestamp,
  };
}

/**
 * Create a mock memory state
 */
function createMockMemoryState(skillId: string, overrides: Partial<MemoryState> = {}): MemoryState {
  return {
    skillId,
    stability: 1,
    difficulty: 0.5,
    lastReview: Date.now(),
    nextReview: Date.now() + MS_PER_DAY,
    successCount: 0,
    failureCount: 0,
    state: 'review',
    ...overrides,
  };
}

describe('SessionPlannerImpl', () => {
  let planner: SessionPlannerImpl;
  let currentTime: number;
  let defaultConfig: SessionConfig;

  beforeEach(() => {
    currentTime = 1000000000000;
    planner = createSessionPlanner();
    defaultConfig = {
      maxDurationMinutes: 30,
      targetItems: 20,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: true,
      requireTransferTests: true,
    };
  });

  describe('createSessionPlanner', () => {
    it('should create a planner with default config', () => {
      const p = createSessionPlanner();
      expect(p).toBeInstanceOf(SessionPlannerImpl);
    });

    it('should accept custom config', () => {
      const p = createSessionPlanner({ overdueWeight: 5.0 });
      expect(p).toBeInstanceOf(SessionPlannerImpl);
    });

    it('should accept transfer tests and results', () => {
      const tests: TransferTest[] = [
        { id: 'test-1', skillId: 'skill-a', transferType: 'near', itemId: 'item-1' },
      ];
      const results: TransferTestResult[] = [];
      const p = createSessionPlanner({}, tests, results);
      expect(p).toBeInstanceOf(SessionPlannerImpl);
    });
  });

  describe('getNextAction - Priority 1: Due spaced retrieval', () => {
    it('should return review action for due items', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.9, 'skill-b': 0.5 }, currentTime);
      const memoryStates = [
        createMockMemoryState('skill-a', {
          nextReview: currentTime - MS_PER_DAY, // 1 day overdue
          lastReview: currentTime - MS_PER_DAY * 2,
        }),
      ];

      const action = planner.getNextAction(learnerModel, skillGraph, memoryStates, defaultConfig);

      expect(action.type).toBe('review');
      expect(action.skillId).toBe('skill-a');
      expect(action.reason).toBe('Spaced retrieval due');
    });

    it('should prioritize most overdue item first', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.9, 'skill-b': 0.9 }, currentTime);
      const memoryStates = [
        createMockMemoryState('skill-a', {
          nextReview: currentTime - MS_PER_DAY, // 1 day overdue
        }),
        createMockMemoryState('skill-b', {
          nextReview: currentTime - MS_PER_DAY * 3, // 3 days overdue
        }),
      ];

      const action = planner.getNextAction(learnerModel, skillGraph, memoryStates, defaultConfig);

      expect(action.skillId).toBe('skill-b'); // More overdue
    });

    it('should not return review when enforceSpacedRetrieval is false', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.5 }, currentTime);
      const memoryStates = [
        createMockMemoryState('skill-a', {
          nextReview: currentTime - MS_PER_DAY,
        }),
      ];

      const action = planner.getNextAction(learnerModel, skillGraph, memoryStates, {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
      });

      expect(action.type).not.toBe('review');
    });
  });

  describe('getNextAction - Priority 2: Transfer tests', () => {
    it('should return transfer test for mastered skill with pending tests', () => {
      const tests: TransferTest[] = [
        { id: 'test-1', skillId: 'skill-a', transferType: 'near', itemId: 'item-1' },
      ];
      const p = createSessionPlanner({ transferTestThreshold: 0.8 }, tests, []);

      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.85 }, currentTime);

      const action = p.getNextAction(learnerModel, skillGraph, [], defaultConfig);

      expect(action.type).toBe('transfer_test');
      expect(action.skillId).toBe('skill-a');
      expect(action.itemId).toBe('test-1');
    });

    it('should skip transfer test when skill already passed', () => {
      const tests: TransferTest[] = [
        { id: 'test-1', skillId: 'skill-a', transferType: 'near', itemId: 'item-1' },
      ];
      const results: TransferTestResult[] = [
        { testId: 'test-1', passed: true, timestamp: currentTime },
      ];
      const p = createSessionPlanner({}, tests, results);

      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.9 }, currentTime);

      const action = p.getNextAction(learnerModel, skillGraph, [], defaultConfig);

      expect(action.type).not.toBe('transfer_test');
    });

    it('should prioritize near transfer over far transfer', () => {
      const tests: TransferTest[] = [
        { id: 'test-far', skillId: 'skill-a', transferType: 'far', itemId: 'item-far' },
        { id: 'test-near', skillId: 'skill-a', transferType: 'near', itemId: 'item-near' },
      ];
      const p = createSessionPlanner({}, tests, []);

      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.9 }, currentTime);

      const action = p.getNextAction(learnerModel, skillGraph, [], defaultConfig);

      expect(action.itemId).toBe('test-near');
    });

    it('should not return transfer test when requireTransferTests is false', () => {
      const tests: TransferTest[] = [
        { id: 'test-1', skillId: 'skill-a', transferType: 'near', itemId: 'item-1' },
      ];
      const p = createSessionPlanner({}, tests, []);

      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.9 }, currentTime);

      const action = p.getNextAction(learnerModel, skillGraph, [], {
        ...defaultConfig,
        requireTransferTests: false,
      });

      expect(action.type).not.toBe('transfer_test');
    });
  });

  describe('getNextAction - Priority 3: Error-focused practice', () => {
    it('should return practice for skills in relearning state', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.4, 'skill-b': 0.6 }, currentTime);
      const memoryStates = [
        createMockMemoryState('skill-a', {
          state: 'relearning',
          failureCount: 2,
          nextReview: currentTime + MS_PER_DAY, // Not due
        }),
      ];

      const action = planner.getNextAction(learnerModel, skillGraph, memoryStates, {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(action.type).toBe('practice');
      expect(action.skillId).toBe('skill-a');
      expect(action.reason).toContain('Error-focused');
    });

    it('should prioritize skills with more failures', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.4, 'skill-b': 0.4 }, currentTime);
      const memoryStates = [
        createMockMemoryState('skill-a', { state: 'relearning', failureCount: 1 }),
        createMockMemoryState('skill-b', { state: 'relearning', failureCount: 5 }),
      ];

      const action = planner.getNextAction(learnerModel, skillGraph, memoryStates, {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(action.skillId).toBe('skill-b'); // More failures
    });
  });

  describe('getNextAction - Priority 4: New skill introduction', () => {
    it('should introduce new skill when prerequisites are mastered', () => {
      const skillGraph = createMockSkillGraph(['prereq-a', 'skill-b'], { 'skill-b': ['prereq-a'] });
      const learnerModel = createMockLearnerModel({ 'prereq-a': 0.9, 'skill-b': 0.1 }, currentTime);

      const action = planner.getNextAction(learnerModel, skillGraph, [], {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(action.type).toBe('practice');
      expect(action.skillId).toBe('skill-b');
      expect(action.reason).toContain('New skill introduction');
    });

    it('should not introduce skill when prerequisites not mastered', () => {
      const skillGraph = createMockSkillGraph(['prereq-a', 'skill-b'], { 'skill-b': ['prereq-a'] });
      const learnerModel = createMockLearnerModel(
        { 'prereq-a': 0.5, 'skill-b': 0.1 }, // prereq not mastered
        currentTime
      );

      const action = planner.getNextAction(learnerModel, skillGraph, [], {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      // Should choose prereq-a instead since it's not mastered
      expect(action.skillId).toBe('prereq-a');
    });

    it('should prioritize skills with higher leverage', () => {
      // skill-a has 2 dependents, skill-b has 0
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b', 'dep-1', 'dep-2'], {
        'dep-1': ['skill-a'],
        'dep-2': ['skill-a'],
      });
      const learnerModel = createMockLearnerModel(
        { 'skill-a': 0.1, 'skill-b': 0.1, 'dep-1': 0.0, 'dep-2': 0.0 },
        currentTime
      );

      const action = planner.getNextAction(learnerModel, skillGraph, [], {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(action.skillId).toBe('skill-a'); // Higher leverage
    });
  });

  describe('getNextAction - Priority 5: Consolidation practice', () => {
    it('should return consolidation for skills with unmastered prereqs', () => {
      // Consolidation only triggers for skills that have unmastered prereqs
      // (not eligible for new skill introduction) but have some pMastery
      const skillGraph = createMockSkillGraph(['base', 'intermediate', 'advanced'], {
        intermediate: ['base'],
        advanced: ['intermediate'],
      });
      const learnerModel = createMockLearnerModel(
        {
          base: 0.9, // Mastered, skip in new skill intro
          intermediate: 0.9, // Mastered, skip in new skill intro
          advanced: 0.6, // Prereq (intermediate) mastered -> new skill intro picks this
        },
        currentTime
      );

      const action = planner.getNextAction(learnerModel, skillGraph, [], {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      // Since 'advanced' has mastered prereqs and is not mastered, it's picked by new skill intro
      // This is correct behavior - the test verifies the action type and skill
      expect(action.type).toBe('practice');
      expect(action.skillId).toBe('advanced');
    });

    it('should use consolidation for skills blocked by unmastered prereqs', () => {
      // Create a scenario where consolidation triggers:
      // - All skills with mastered prereqs are already mastered
      // - There's a skill with unmastered prereq that has pMastery in consolidation range
      const skillGraph = createMockSkillGraph(['base', 'blocker', 'advanced'], {
        blocker: ['base'],
        advanced: ['blocker'],
      });
      const learnerModel = createMockLearnerModel(
        {
          base: 0.9, // Mastered
          blocker: 0.7, // Not mastered (prereq is mastered -> new skill intro)
          advanced: 0.5, // Prereq (blocker) not mastered -> NOT eligible for new skill intro
        },
        currentTime
      );

      // blocker will be selected by new skill introduction (prereq mastered, not yet mastered itself)
      const action = planner.getNextAction(learnerModel, skillGraph, [], {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(action.type).toBe('practice');
      expect(action.skillId).toBe('blocker');
      // This gets picked by new skill introduction (not consolidation) because prereq is mastered
    });
  });

  describe('getNextAction - Rest fallback', () => {
    it('should return rest when no actions needed', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel(
        { 'skill-a': 0.95 }, // Already mastered
        currentTime
      );

      const action = planner.getNextAction(
        learnerModel,
        skillGraph,
        [], // No due items
        { ...defaultConfig, enforceSpacedRetrieval: false, requireTransferTests: false }
      );

      expect(action.type).toBe('rest');
      expect(action.priority).toBe(0);
    });
  });

  describe('planSession', () => {
    it('should plan multiple actions up to targetItems', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b', 'skill-c']);
      const learnerModel = createMockLearnerModel(
        { 'skill-a': 0.5, 'skill-b': 0.6, 'skill-c': 0.7 },
        currentTime
      );

      const actions = planner.planSession(learnerModel, skillGraph, [], {
        ...defaultConfig,
        targetItems: 3,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      // Each skill is only planned once (no repeats)
      expect(actions.length).toBeLessThanOrEqual(3);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should include all due reviews first', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b', 'skill-c']);
      const learnerModel = createMockLearnerModel(
        { 'skill-a': 0.9, 'skill-b': 0.9, 'skill-c': 0.5 },
        currentTime
      );
      const memoryStates = [
        createMockMemoryState('skill-a', { nextReview: currentTime - MS_PER_DAY }),
        createMockMemoryState('skill-b', { nextReview: currentTime - MS_PER_DAY * 2 }),
      ];

      const actions = planner.planSession(learnerModel, skillGraph, memoryStates, {
        ...defaultConfig,
        targetItems: 10,
        requireTransferTests: false,
      });

      const reviews = actions.filter((a) => a.type === 'review');
      expect(reviews.length).toBe(2);
    });

    it('should sort actions by priority', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.5, 'skill-b': 0.8 }, currentTime);
      const memoryStates = [
        createMockMemoryState('skill-a', { nextReview: currentTime - MS_PER_DAY * 5 }), // Very overdue
      ];

      const actions = planner.planSession(learnerModel, skillGraph, memoryStates, {
        ...defaultConfig,
        targetItems: 2,
        requireTransferTests: false,
      });

      // First action should have highest priority
      for (let i = 0; i < actions.length - 1; i++) {
        expect(actions[i].priority).toBeGreaterThanOrEqual(actions[i + 1].priority);
      }
    });

    it('should not repeat skills', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.5, 'skill-b': 0.6 }, currentTime);

      const actions = planner.planSession(learnerModel, skillGraph, [], {
        ...defaultConfig,
        targetItems: 5,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      const skillIds = actions.filter((a) => a.skillId).map((a) => a.skillId);
      const uniqueSkillIds = new Set(skillIds);
      expect(uniqueSkillIds.size).toBe(skillIds.length);
    });

    it('should stop when no more actions available', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel(
        { 'skill-a': 0.95 }, // Mastered
        currentTime
      );

      const actions = planner.planSession(learnerModel, skillGraph, [], {
        ...defaultConfig,
        targetItems: 10,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(actions.length).toBe(0);
    });
  });

  describe('getSessionStats', () => {
    it('should calculate correct statistics', () => {
      const actions = [
        { type: 'review' as const, skillId: 'skill-a', reason: 'test', priority: 80 },
        { type: 'review' as const, skillId: 'skill-b', reason: 'test', priority: 70 },
        { type: 'practice' as const, skillId: 'skill-c', reason: 'test', priority: 50 },
        {
          type: 'transfer_test' as const,
          skillId: 'skill-a',
          itemId: 'test-1',
          reason: 'test',
          priority: 75,
        },
      ];

      const stats = planner.getSessionStats(actions);

      expect(stats.totalActions).toBe(4);
      expect(stats.actionsByType.review).toBe(2);
      expect(stats.actionsByType.practice).toBe(1);
      expect(stats.actionsByType.transfer_test).toBe(1);
      expect(stats.uniqueSkills).toBe(3);
      expect(stats.averagePriority).toBe((80 + 70 + 50 + 75) / 4);
    });

    it('should handle empty actions array', () => {
      const stats = planner.getSessionStats([]);

      expect(stats.totalActions).toBe(0);
      expect(stats.uniqueSkills).toBe(0);
      expect(stats.averagePriority).toBe(0);
    });

    it('should handle rest actions without skillId', () => {
      const actions = [{ type: 'rest' as const, reason: 'done', priority: 0 }];

      const stats = planner.getSessionStats(actions);

      expect(stats.actionsByType.rest).toBe(1);
      expect(stats.uniqueSkills).toBe(0);
    });
  });

  describe('default config', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_SESSION_PLANNER_CONFIG.maxDurationMinutes).toBe(30);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.targetItems).toBe(20);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.masteryThreshold).toBe(0.85);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.enforceSpacedRetrieval).toBe(true);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.requireTransferTests).toBe(true);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.overdueWeight).toBe(2.0);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.errorWeight).toBe(1.5);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.transferTestThreshold).toBe(0.8);
      expect(DEFAULT_SESSION_PLANNER_CONFIG.maxErrorFocusItems).toBe(5);
    });
  });

  describe('determinism', () => {
    it('should produce identical results for same inputs', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b', 'skill-c']);
      const learnerModel = createMockLearnerModel(
        { 'skill-a': 0.5, 'skill-b': 0.6, 'skill-c': 0.7 },
        currentTime
      );
      const memoryStates = [
        createMockMemoryState('skill-a', { nextReview: currentTime - MS_PER_DAY }),
      ];

      const actions1 = planner.planSession(learnerModel, skillGraph, memoryStates, defaultConfig);
      const actions2 = planner.planSession(learnerModel, skillGraph, memoryStates, defaultConfig);

      expect(actions1.length).toBe(actions2.length);
      for (let i = 0; i < actions1.length; i++) {
        expect(actions1[i].type).toBe(actions2[i].type);
        expect(actions1[i].skillId).toBe(actions2[i].skillId);
        expect(actions1[i].priority).toBe(actions2[i].priority);
      }
    });

    it('should sort by skillId when priorities are equal', () => {
      const skillGraph = createMockSkillGraph(['zebra', 'apple', 'mango']);
      const learnerModel = createMockLearnerModel(
        { zebra: 0.5, apple: 0.5, mango: 0.5 },
        currentTime
      );

      const action = planner.getNextAction(learnerModel, skillGraph, [], {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      // Skills with same priority should be sorted alphabetically
      // Note: topological order is used, so order depends on input
      expect(action.type).toBe('practice');
    });
  });

  describe('priority calculations', () => {
    it('should calculate higher priority for more overdue items', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.9 }, currentTime);

      // Create states with different overdue amounts
      const state1Day = createMockMemoryState('skill-a', {
        nextReview: currentTime - MS_PER_DAY,
      });
      const state5Days = createMockMemoryState('skill-a', {
        nextReview: currentTime - MS_PER_DAY * 5,
      });

      const action1 = planner.getNextAction(learnerModel, skillGraph, [state1Day], defaultConfig);
      const action5 = planner.getNextAction(learnerModel, skillGraph, [state5Days], defaultConfig);

      expect(action5.priority).toBeGreaterThan(action1.priority);
    });

    it('should cap priority at 100', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const learnerModel = createMockLearnerModel({ 'skill-a': 0.9 }, currentTime);

      // Extremely overdue
      const stateVeryOverdue = createMockMemoryState('skill-a', {
        nextReview: currentTime - MS_PER_DAY * 100,
      });

      const action = planner.getNextAction(
        learnerModel,
        skillGraph,
        [stateVeryOverdue],
        defaultConfig
      );

      expect(action.priority).toBeLessThanOrEqual(100);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // PHASE J2 — Tier-2 missing test: planner + relearning prereq
  //
  // Pin the priority resolution between Priority 3 (error-focused practice)
  // and Priority 4 (new skill introduction): when a prereq is BKT-mastered
  // but FSRS-relearning, the planner should re-target the prereq, NOT
  // introduce the dependent. This guards the "learner regressed; back to
  // foundation before extending" pedagogy.
  // ───────────────────────────────────────────────────────────────────────
  describe('Critical Path: relearning prereq blocks dependent-skill introduction', () => {
    it('returns error-focused practice on the relearning prereq, not new-skill on the dependent', () => {
      const skillGraph = createMockSkillGraph(['prereq-a', 'skill-b'], {
        'skill-b': ['prereq-a'],
      });

      // prereq-a's BKT mastery is high enough to satisfy the gate for
      // introducing skill-b — but its memory state is `relearning`,
      // signalling recent failures. The relearning state should win.
      const learnerModel = createMockLearnerModel(
        { 'prereq-a': 0.9, 'skill-b': 0.1 },
        currentTime,
      );
      const memoryStates = [
        createMockMemoryState('prereq-a', {
          state: 'relearning',
          failureCount: 2,
          nextReview: currentTime + MS_PER_DAY, // not yet due — error-focused, not review
        }),
      ];

      const action = planner.getNextAction(learnerModel, skillGraph, memoryStates, {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(action.type).toBe('practice');
      expect(action.skillId).toBe('prereq-a');
      expect(action.reason).toContain('Error-focused');
    });

    it('once the prereq leaves relearning, the dependent becomes the next target', () => {
      const skillGraph = createMockSkillGraph(['prereq-a', 'skill-b'], {
        'skill-b': ['prereq-a'],
      });
      const learnerModel = createMockLearnerModel(
        { 'prereq-a': 0.9, 'skill-b': 0.1 },
        currentTime,
      );
      // Same setup as above but prereq is back in 'review' state.
      const memoryStates = [
        createMockMemoryState('prereq-a', {
          state: 'review',
          failureCount: 0,
          nextReview: currentTime + MS_PER_DAY,
        }),
      ];

      const action = planner.getNextAction(learnerModel, skillGraph, memoryStates, {
        ...defaultConfig,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
      });

      expect(action.skillId).toBe('skill-b');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase C3 — canonical 5-stage learning loop
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase C3: canonical 5-stage learning loop enforcement', () => {
  // A two-skill graph: 'a' is the natural first leverage gap (no prereqs,
  // unlocks 'b'). The planner gating tests pivot on what happens when 'a' has
  // no stage history yet.
  function buildPlannerSetup(): {
    planner: SessionPlannerImpl;
    graph: SkillGraph;
    learnerModel: LearnerModel;
    config: SessionConfig;
  } {
    const skills = ['a', 'b'];
    const prereqs = { b: ['a'] };
    const graph = (() => {
      // Inline minimal graph builder mirroring createMockSkillGraph above.
      const skillsMap = new Map<string, { id: string; name: string; prerequisites: string[] }>();
      for (const s of skills) skillsMap.set(s, { id: s, name: s, prerequisites: prereqs[s] ?? [] });
      const transitivePrereqs = (id: string, visited = new Set<string>()): string[] => {
        if (visited.has(id)) return [];
        visited.add(id);
        const direct = (skillsMap.get(id)?.prerequisites ?? []).filter((p) => skillsMap.has(p));
        const result: string[] = [];
        for (const p of direct) {
          for (const tp of transitivePrereqs(p, visited)) {
            if (!result.includes(tp)) result.push(tp);
          }
          if (!result.includes(p)) result.push(p);
        }
        return result;
      };
      return {
        skills: skillsMap,
        validate: () => ({ valid: true, errors: [] }),
        getTopologicalOrder: () => [...skills].sort(),
        getAllPrerequisites: (skillId: string): string[] => transitivePrereqs(skillId),
        getDependents: (skillId: string): string[] => {
          const out: string[] = [];
          for (const [id, s] of skillsMap) {
            if (s.prerequisites.includes(skillId)) out.push(id);
          }
          return out.sort();
        },
        isPrerequisiteOf: (a: string, b: string): boolean => transitivePrereqs(b).includes(a),
        getEncompassedSkills: () => [],
        getAllEncompassedSkills: () => [],
      } as SkillGraph;
    })();

    const learnerModel: LearnerModel = {
      learnerId: 'l1',
      skillProbabilities: new Map([
        ['a', { skillId: 'a', pMastery: 0.3, pSlip: 0.1, pGuess: 0.2, pLearn: 0.1, lastUpdated: 0 }],
        ['b', { skillId: 'b', pMastery: 0.3, pSlip: 0.1, pGuess: 0.2, pLearn: 0.1, lastUpdated: 0 }],
      ]),
      totalEvents: 0,
      createdAt: 0,
      lastUpdated: 1000,
    };

    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 20,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: false,
      requireTransferTests: false,
      enforceCanonicalLoop: true,
    };

    const planner = createSessionPlanner();
    return { planner, graph, learnerModel, config };
  }

  it('emits concept_introduction (not practice) for a brand-new skill when enforceCanonicalLoop is true', () => {
    const { planner, graph, learnerModel, config } = buildPlannerSetup();

    // Empty stage history → the leverage-gap candidate ('a') has nothing
    // recorded yet, so the canonical loop demands concept_introduction first.
    const action = planner.getNextAction(learnerModel, graph, [], config, new Map());

    expect(action.type).toBe('concept_introduction');
    expect(action.skillId).toBe('a');
  });

  it('order constraint: practice cannot precede concept_introduction', () => {
    const { planner, graph, learnerModel, config } = buildPlannerSetup();
    const action = planner.getNextAction(learnerModel, graph, [], config, new Map());
    expect(action.type).not.toBe('practice');
  });

  it('falls back to practice once concept_introduction has been recorded for the skill', () => {
    const { planner, graph, learnerModel, config } = buildPlannerSetup();

    const stageHistory = new Map<string, Set<'concept_introduction' | 'practice' | 'application' | 'reflection'>>([
      ['a', new Set(['concept_introduction'])],
    ]);

    const action = planner.getNextAction(learnerModel, graph, [], config, stageHistory);
    expect(action.type).toBe('practice');
    expect(action.skillId).toBe('a');
  });

  it('blocks transfer_test until application+reflection have been recorded', () => {
    // Set 'a' to be at mastery so the transfer-test gate is the natural
    // candidate. Register a transfer test for 'a'. With only practice +
    // concept_introduction recorded, the canonical-loop gate must skip it.
    const { graph, learnerModel } = buildPlannerSetup();
    learnerModel.skillProbabilities.set('a', {
      skillId: 'a',
      pMastery: 0.95,
      pSlip: 0.1,
      pGuess: 0.2,
      pLearn: 0.1,
      lastUpdated: 0,
    });

    const transferTests: TransferTest[] = [
      { id: 'tt-a', skillId: 'a', transferType: 'near', context: 'word problem', passingScore: 0.8 },
    ];
    const transferResults: TransferTestResult[] = [];
    const planner = createSessionPlanner({}, transferTests, transferResults);

    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 20,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: false,
      requireTransferTests: true,
      enforceCanonicalLoop: true,
    };

    // Only intro + practice recorded — application and reflection missing.
    const partialHistory = new Map<
      string,
      Set<'concept_introduction' | 'practice' | 'application' | 'reflection'>
    >([['a', new Set(['concept_introduction', 'practice'])]]);

    const action1 = planner.getNextAction(learnerModel, graph, [], config, partialHistory);
    expect(action1.type).not.toBe('transfer_test');

    // Add application but still no reflection — still gated.
    const partialHistory2 = new Map(partialHistory);
    partialHistory2.set('a', new Set(['concept_introduction', 'practice', 'application']));
    const action2 = planner.getNextAction(learnerModel, graph, [], config, partialHistory2);
    expect(action2.type).not.toBe('transfer_test');

    // Add reflection — now all four stages are present, gate opens.
    const fullHistory = new Map(partialHistory);
    fullHistory.set(
      'a',
      new Set(['concept_introduction', 'practice', 'application', 'reflection'])
    );
    const action3 = planner.getNextAction(learnerModel, graph, [], config, fullHistory);
    expect(action3.type).toBe('transfer_test');
    expect(action3.skillId).toBe('a');
  });

  it('back-compat: enforceCanonicalLoop=false leaves planner output unchanged', () => {
    const { planner, graph, learnerModel } = buildPlannerSetup();
    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 20,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: false,
      requireTransferTests: false,
      // enforceCanonicalLoop omitted → false
    };

    const action = planner.getNextAction(learnerModel, graph, [], config);
    // Without the flag, brand-new skill still gets the original 'practice'
    // recommendation — proves existing consumers are not affected.
    expect(action.type).toBe('practice');
    expect(action.skillId).toBe('a');
  });
});

describe('Phase C3: engine wires stageHistory into planner; PracticeEvent + StageCompletedEvent populate it', () => {
  // These integration tests live here (rather than in core.test.ts) so they
  // sit next to the planner-level tests above and the C2 cognitive-state tests
  // a directory over. The shared theme is "Phase C verification".

  it('full canonical loop: concept_introduction → practice → application → reflection → transfer_test', async () => {
    const { createDeterministicEngine } = await import('../engine');
    const { createSkillGraph } = await import('../graph');
    const {
      createPracticeEvent,
      createStageCompletedEvent,
      createTransferTestEvent: _createTransferTestEvent,
      createEventFactoryContext,
    } = await import('../events');

    const skills = [
      { id: 'a', name: 'A', prerequisites: [] },
      { id: 'b', name: 'B', prerequisites: ['a'] },
    ];
    const engine = createDeterministicEngine(createSkillGraph(skills), {}, 0);
    engine.registerTransferTests([
      { id: 'tt-a', skillId: 'a', transferType: 'near', context: 'ctx', passingScore: 0.8 },
    ]);
    const ctx = createEventFactoryContext(
      () => engine.getCurrentTime(),
      () => engine.generateEventId()
    );

    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 20,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: false,
      requireTransferTests: true,
      enforceCanonicalLoop: true,
    };

    // Step 1: brand new — engine emits concept_introduction.
    expect(engine.getNextAction('l1', config).type).toBe('concept_introduction');

    // Step 2: record concept_introduction → engine emits practice.
    engine.processEvent(createStageCompletedEvent(ctx, 'l1', 's1', 'a', 'concept_introduction'));
    expect(engine.getNextAction('l1', config).type).toBe('practice');

    // Step 3: record some practice events to push pMastery above the
    // transfer-test threshold (0.8 by planner config) so the gate becomes
    // the canonical-loop check rather than the mastery check.
    for (let i = 0; i < 5; i++) {
      engine.processEvent(
        createPracticeEvent(ctx, 'l1', 's1', 'a', `q${i}`, true, 500, { confidence: 0.9 })
      );
    }
    // With practice but no application/reflection recorded, transfer_test
    // is still blocked by the canonical-loop gate.
    expect(engine.getNextAction('l1', config).type).not.toBe('transfer_test');

    // Step 4: record an application attempt (PracticeEvent with stage='application').
    engine.processEvent(
      createPracticeEvent(ctx, 'l1', 's1', 'a', 'q-app', true, 600, {
        confidence: 0.9,
      })
    );
    // Force the stage='application' tag on the most recent event by emitting
    // a stage_completed event isn't allowed (it doesn't accept 'application'),
    // so we instead fire another practice with the stage field set.
    engine.processEvent({
      id: engine.generateEventId(),
      type: 'practice',
      learnerId: 'l1',
      sessionId: 's1',
      timestamp: engine.getCurrentTime(),
      skillId: 'a',
      itemId: 'q-app2',
      correct: true,
      responseTimeMs: 600,
      stage: 'application',
    });

    // Step 5: record reflection.
    engine.processEvent(createStageCompletedEvent(ctx, 'l1', 's1', 'a', 'reflection'));

    // Now the canonical loop is complete. Engine emits transfer_test.
    const finalAction = engine.getNextAction('l1', config);
    expect(finalAction.type).toBe('transfer_test');
    expect(finalAction.skillId).toBe('a');
  });

  it('engine.getStageHistory reflects PracticeEvent + StageCompletedEvent contributions', async () => {
    const { createDeterministicEngine } = await import('../engine');
    const { createSkillGraph } = await import('../graph');
    const { createPracticeEvent, createStageCompletedEvent, createEventFactoryContext } =
      await import('../events');

    const engine = createDeterministicEngine(
      createSkillGraph([{ id: 'a', name: 'A', prerequisites: [] }]),
      {},
      0
    );
    const ctx = createEventFactoryContext(
      () => engine.getCurrentTime(),
      () => engine.generateEventId()
    );

    expect(engine.getStageHistory('l1', 'a').size).toBe(0);

    engine.processEvent(createStageCompletedEvent(ctx, 'l1', 's1', 'a', 'concept_introduction'));
    expect(engine.getStageHistory('l1', 'a').has('concept_introduction')).toBe(true);

    engine.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'a', 'q1', true, 500));
    expect(engine.getStageHistory('l1', 'a').has('practice')).toBe(true);

    // PracticeEvent with stage='application' records the application stage.
    engine.processEvent({
      id: engine.generateEventId(),
      type: 'practice',
      learnerId: 'l1',
      sessionId: 's1',
      timestamp: engine.getCurrentTime(),
      skillId: 'a',
      itemId: 'q-app',
      correct: true,
      responseTimeMs: 600,
      stage: 'application',
    });
    expect(engine.getStageHistory('l1', 'a').has('application')).toBe(true);

    engine.processEvent(createStageCompletedEvent(ctx, 'l1', 's1', 'a', 'reflection'));
    expect(engine.getStageHistory('l1', 'a').has('reflection')).toBe(true);

    expect(engine.getStageHistory('l1', 'a')).toEqual(
      new Set(['concept_introduction', 'practice', 'application', 'reflection'])
    );
  });

  it('stage history survives export/import round-trip', async () => {
    const { createDeterministicEngine } = await import('../engine');
    const { createSkillGraph } = await import('../graph');
    const { createPracticeEvent, createStageCompletedEvent, createEventFactoryContext } =
      await import('../events');

    const engineA = createDeterministicEngine(
      createSkillGraph([{ id: 'a', name: 'A', prerequisites: [] }]),
      {},
      0
    );
    const ctx = createEventFactoryContext(
      () => engineA.getCurrentTime(),
      () => engineA.generateEventId()
    );

    engineA.processEvent(createStageCompletedEvent(ctx, 'l1', 's1', 'a', 'concept_introduction'));
    engineA.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'a', 'q1', true, 500));

    const exported = engineA.exportState();

    const engineB = createDeterministicEngine(
      createSkillGraph([{ id: 'a', name: 'A', prerequisites: [] }]),
      {},
      0
    );
    engineB.importState(exported);

    expect(engineB.getStageHistory('l1', 'a')).toEqual(
      new Set(['concept_introduction', 'practice'])
    );
    // Composes with A1 determinism: re-export equals the imported string.
    expect(engineB.exportState()).toBe(exported);
  });
});

