/**
 * BKT Engine Tests
 *
 * Tests for Bayesian Knowledge Tracing learner model.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BKTEngine,
  createBKTEngine,
  DEFAULT_BKT_PARAMS,
  validateBKTParams,
  type _BKTParams,
} from '../learner/BKTEngine.js';
import type { SkillGraph, PracticeEvent } from '../constitution.js';

// Mock SkillGraph
function createMockSkillGraph(skillIds: string[]): SkillGraph {
  const skills = new Map(skillIds.map((id) => [id, { id, name: id, prerequisites: [] }]));
  return {
    skills,
    validate: () => ({ valid: true, errors: [] }),
    getTopologicalOrder: () => skillIds,
    getAllPrerequisites: () => [],
    getDependents: () => [],
    isPrerequisiteOf: () => false,
  };
}

// Helper to create practice events
function createPracticeEvent(
  skillId: string,
  correct: boolean,
  timestamp: number = Date.now()
): PracticeEvent {
  return {
    type: 'practice',
    learnerId: 'learner-1',
    skillId,
    itemId: `item-${skillId}`,
    correct,
    timestamp,
    sessionId: 'session-1',
  };
}

describe('BKTEngine', () => {
  let engine: BKTEngine;
  let mockClock: () => number;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000;
    mockClock = () => currentTime;
    engine = createBKTEngine({}, mockClock);
  });

  describe('validateBKTParams', () => {
    it('should accept valid default parameters', () => {
      expect(() => validateBKTParams(DEFAULT_BKT_PARAMS)).not.toThrow();
    });

    it('should reject pInit outside [0, 1]', () => {
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pInit: -0.1 })).toThrow(
        'pInit must be between 0 and 1'
      );
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pInit: 1.1 })).toThrow(
        'pInit must be between 0 and 1'
      );
    });

    it('should reject pLearn outside [0, 1]', () => {
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pLearn: -0.1 })).toThrow(
        'pLearn must be between 0 and 1'
      );
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pLearn: 1.1 })).toThrow(
        'pLearn must be between 0 and 1'
      );
    });

    it('should reject pSlip at boundaries (prevents division by zero)', () => {
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pSlip: 0 })).toThrow(
        'pSlip must be strictly between 0 and 1'
      );
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pSlip: 1 })).toThrow(
        'pSlip must be strictly between 0 and 1'
      );
    });

    it('should reject pGuess at boundaries (prevents division by zero)', () => {
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pGuess: 0 })).toThrow(
        'pGuess must be strictly between 0 and 1'
      );
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pGuess: 1 })).toThrow(
        'pGuess must be strictly between 0 and 1'
      );
    });

    it('should reject pSlip + pGuess >= 1 (model identifiability)', () => {
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pSlip: 0.5, pGuess: 0.5 })).toThrow(
        'pSlip + pGuess must be less than 1'
      );
      expect(() => validateBKTParams({ ...DEFAULT_BKT_PARAMS, pSlip: 0.6, pGuess: 0.5 })).toThrow(
        'pSlip + pGuess must be less than 1'
      );
    });

    it('should accept edge-valid parameters', () => {
      expect(() =>
        validateBKTParams({
          pInit: 0,
          pLearn: 0,
          pSlip: 0.01,
          pGuess: 0.01,
        })
      ).not.toThrow();

      expect(() =>
        validateBKTParams({
          pInit: 1,
          pLearn: 1,
          pSlip: 0.49,
          pGuess: 0.49,
        })
      ).not.toThrow();
    });
  });

  describe('createModel', () => {
    it('should create a model with all skills initialized', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b', 'skill-c']);
      const model = engine.createModel('learner-1', skillGraph);

      expect(model.learnerId).toBe('learner-1');
      expect(model.skillProbabilities.size).toBe(3);
      expect(model.totalEvents).toBe(0);
      expect(model.createdAt).toBe(currentTime);
    });

    it('should initialize skills with default pMastery', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const model = engine.createModel('learner-1', skillGraph);

      const skillProb = model.skillProbabilities.get('skill-a');
      expect(skillProb?.pMastery).toBe(DEFAULT_BKT_PARAMS.pInit);
      expect(skillProb?.pSlip).toBe(DEFAULT_BKT_PARAMS.pSlip);
      expect(skillProb?.pGuess).toBe(DEFAULT_BKT_PARAMS.pGuess);
      expect(skillProb?.pLearn).toBe(DEFAULT_BKT_PARAMS.pLearn);
    });

    it('should use custom parameters if provided', () => {
      const customEngine = createBKTEngine({ pInit: 0.5, pLearn: 0.2 }, mockClock);
      const skillGraph = createMockSkillGraph(['skill-a']);
      const model = customEngine.createModel('learner-1', skillGraph);

      const skillProb = model.skillProbabilities.get('skill-a');
      expect(skillProb?.pMastery).toBe(0.5);
      expect(skillProb?.pLearn).toBe(0.2);
    });
  });

  describe('updateModel', () => {
    it('should increase pMastery on correct response', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);
      const initialPMastery = model.skillProbabilities.get('skill-a')!.pMastery;

      model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime));

      const newPMastery = model.skillProbabilities.get('skill-a')!.pMastery;
      expect(newPMastery).toBeGreaterThan(initialPMastery);
    });

    it('should decrease pMastery on incorrect response', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);
      const initialPMastery = model.skillProbabilities.get('skill-a')!.pMastery;

      model = engine.updateModel(model, createPracticeEvent('skill-a', false, currentTime));

      const newPMastery = model.skillProbabilities.get('skill-a')!.pMastery;
      expect(newPMastery).toBeLessThan(initialPMastery);
    });

    it('should increment totalEvents on each update', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      expect(model.totalEvents).toBe(0);

      model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime));
      expect(model.totalEvents).toBe(1);

      model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime + 1000));
      expect(model.totalEvents).toBe(2);
    });

    it('should update lastUpdated timestamp', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      currentTime = 2000000;
      model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime));

      expect(model.lastUpdated).toBe(currentTime);
      expect(model.skillProbabilities.get('skill-a')!.lastUpdated).toBe(currentTime);
    });

    it('should handle new skills not in initial model', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      // Update with a skill not in the original model
      model = engine.updateModel(model, createPracticeEvent('skill-b', true, currentTime));

      expect(model.skillProbabilities.has('skill-b')).toBe(true);
      expect(model.skillProbabilities.get('skill-b')!.pMastery).toBeGreaterThan(
        DEFAULT_BKT_PARAMS.pInit
      );
    });

    it('should clamp pMastery between 0 and 1', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      // Many correct responses should approach but not exceed 1
      for (let i = 0; i < 100; i++) {
        model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime + i));
      }

      const pMastery = model.skillProbabilities.get('skill-a')!.pMastery;
      expect(pMastery).toBeLessThanOrEqual(1);
      expect(pMastery).toBeGreaterThan(0.9); // Should be high but not exactly 1
    });

    it('should be deterministic - same inputs produce same outputs', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const model1 = engine.createModel('learner-1', skillGraph);
      const model2 = engine.createModel('learner-1', skillGraph);

      const event = createPracticeEvent('skill-a', true, currentTime);

      const result1 = engine.updateModel(model1, event);
      const result2 = engine.updateModel(model2, event);

      expect(result1.skillProbabilities.get('skill-a')!.pMastery).toBe(
        result2.skillProbabilities.get('skill-a')!.pMastery
      );
    });
  });

  describe('getPMastery', () => {
    it('should return pMastery for existing skill', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const model = engine.createModel('learner-1', skillGraph);

      expect(engine.getPMastery(model, 'skill-a')).toBe(DEFAULT_BKT_PARAMS.pInit);
    });

    it('should return default pInit for unknown skill', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const model = engine.createModel('learner-1', skillGraph);

      expect(engine.getPMastery(model, 'unknown-skill')).toBe(DEFAULT_BKT_PARAMS.pInit);
    });
  });

  describe('getUnmasteredSkills', () => {
    it('should return all skills below threshold', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b', 'skill-c']);
      let model = engine.createModel('learner-1', skillGraph);

      // Master skill-a by repeated correct responses
      for (let i = 0; i < 20; i++) {
        model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime + i));
      }

      const unmastered = engine.getUnmasteredSkills(model, 0.7);

      expect(unmastered).toContain('skill-b');
      expect(unmastered).toContain('skill-c');
      expect(unmastered).not.toContain('skill-a');
    });

    it('should return empty array when all skills mastered', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      // Master the skill
      for (let i = 0; i < 20; i++) {
        model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime + i));
      }

      const unmastered = engine.getUnmasteredSkills(model, 0.7);
      expect(unmastered).toHaveLength(0);
    });

    it('should return skills sorted alphabetically for determinism', () => {
      const skillGraph = createMockSkillGraph(['zebra', 'apple', 'mango']);
      const model = engine.createModel('learner-1', skillGraph);

      const unmastered = engine.getUnmasteredSkills(model, 0.7);

      expect(unmastered).toEqual(['apple', 'mango', 'zebra']);
    });
  });

  describe('serialize/deserialize', () => {
    it('should round-trip a model correctly', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      let model = engine.createModel('learner-1', skillGraph);

      // Make some updates
      model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime));
      model = engine.updateModel(model, createPracticeEvent('skill-b', false, currentTime + 1000));

      const serialized = engine.serialize(model);
      const deserialized = engine.deserialize(serialized);

      expect(deserialized.learnerId).toBe(model.learnerId);
      expect(deserialized.totalEvents).toBe(model.totalEvents);
      expect(deserialized.createdAt).toBe(model.createdAt);
      expect(deserialized.lastUpdated).toBe(model.lastUpdated);

      expect(deserialized.skillProbabilities.get('skill-a')!.pMastery).toBe(
        model.skillProbabilities.get('skill-a')!.pMastery
      );
      expect(deserialized.skillProbabilities.get('skill-b')!.pMastery).toBe(
        model.skillProbabilities.get('skill-b')!.pMastery
      );
    });

    it('should serialize to valid JSON', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      const model = engine.createModel('learner-1', skillGraph);

      const serialized = engine.serialize(model);

      expect(() => JSON.parse(serialized)).not.toThrow();
    });
  });

  describe('initializeFromDiagnostic', () => {
    it('should set pMastery from diagnostic results', () => {
      const skillGraph = createMockSkillGraph(['skill-a', 'skill-b']);
      let model = engine.createModel('learner-1', skillGraph);

      const diagnosticResults = new Map([
        ['skill-a', 0.8],
        ['skill-b', 0.4],
      ]);

      model = engine.initializeFromDiagnostic(model, diagnosticResults, currentTime);

      expect(model.skillProbabilities.get('skill-a')!.pMastery).toBe(0.8);
      expect(model.skillProbabilities.get('skill-b')!.pMastery).toBe(0.4);
    });

    it('should create new skill entries for skills not in model', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      const diagnosticResults = new Map([
        ['skill-a', 0.7],
        ['skill-new', 0.5],
      ]);

      model = engine.initializeFromDiagnostic(model, diagnosticResults, currentTime);

      expect(model.skillProbabilities.has('skill-new')).toBe(true);
      expect(model.skillProbabilities.get('skill-new')!.pMastery).toBe(0.5);
    });

    it('should update lastUpdated timestamp', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      const newTime = currentTime + 5000;
      const diagnosticResults = new Map([['skill-a', 0.6]]);

      model = engine.initializeFromDiagnostic(model, diagnosticResults, newTime);

      expect(model.lastUpdated).toBe(newTime);
      expect(model.skillProbabilities.get('skill-a')!.lastUpdated).toBe(newTime);
    });
  });

  describe('BKT mathematical correctness', () => {
    it('should converge to high mastery with repeated correct responses', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      // 50 correct responses
      for (let i = 0; i < 50; i++) {
        model = engine.updateModel(model, createPracticeEvent('skill-a', true, currentTime + i));
      }

      const pMastery = model.skillProbabilities.get('skill-a')!.pMastery;
      expect(pMastery).toBeGreaterThan(0.95);
    });

    it('should converge to low mastery with repeated incorrect responses', () => {
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = engine.createModel('learner-1', skillGraph);

      // 50 incorrect responses
      for (let i = 0; i < 50; i++) {
        model = engine.updateModel(model, createPracticeEvent('skill-a', false, currentTime + i));
      }

      const pMastery = model.skillProbabilities.get('skill-a')!.pMastery;
      expect(pMastery).toBeLessThan(0.2);
    });

    it('should increase mastery even with mixed responses (learning effect)', () => {
      // The pLearn parameter means mastery can increase even with some errors
      const highLearnEngine = createBKTEngine({ pLearn: 0.3 }, mockClock);
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = highLearnEngine.createModel('learner-1', skillGraph);
      const initialMastery = model.skillProbabilities.get('skill-a')!.pMastery;

      // Mix of correct and incorrect (more correct than wrong)
      for (let i = 0; i < 10; i++) {
        model = highLearnEngine.updateModel(
          model,
          createPracticeEvent('skill-a', i % 3 !== 0, currentTime + i)
        );
      }

      const finalMastery = model.skillProbabilities.get('skill-a')!.pMastery;
      expect(finalMastery).toBeGreaterThan(initialMastery);
    });
  });

  describe('edge cases', () => {
    it('should handle empty skill graph', () => {
      const skillGraph = createMockSkillGraph([]);
      const model = engine.createModel('learner-1', skillGraph);

      expect(model.skillProbabilities.size).toBe(0);
      expect(model.totalEvents).toBe(0);
    });

    it('should handle very small pLearn (slow learner)', () => {
      const slowEngine = createBKTEngine({ pLearn: 0.01 }, mockClock);
      const skillGraph = createMockSkillGraph(['skill-a']);
      let model = slowEngine.createModel('learner-1', skillGraph);
      const initial = model.skillProbabilities.get('skill-a')!.pMastery;

      model = slowEngine.updateModel(model, createPracticeEvent('skill-a', true, currentTime));

      const after = model.skillProbabilities.get('skill-a')!.pMastery;
      // Should increase but not by much (pLearn affects cumulative learning over time)
      expect(after).toBeGreaterThan(initial);
      expect(after - initial).toBeLessThan(0.5);
    });

    it('should handle high pInit (prior knowledge)', () => {
      const priorEngine = createBKTEngine({ pInit: 0.8 }, mockClock);
      const skillGraph = createMockSkillGraph(['skill-a']);
      const model = priorEngine.createModel('learner-1', skillGraph);

      expect(model.skillProbabilities.get('skill-a')!.pMastery).toBe(0.8);
    });
  });
});
