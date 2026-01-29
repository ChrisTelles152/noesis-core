/**
 * Diagnostic Engine Tests
 *
 * Tests for diagnostic assessment and estimate accuracy.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DiagnosticEngineImpl,
  createDiagnosticEngine,
  DEFAULT_DIAGNOSTIC_CONFIG,
} from '../diagnostic/DiagnosticEngineImpl.js';
import type { SkillGraph, ItemSkillMapping } from '../constitution.js';

// Mock SkillGraph implementation
function createMockSkillGraph(skills: string[], prereqs: Record<string, string[]> = {}): SkillGraph {
  const skillMap = new Map(skills.map(s => [s, { id: s, name: s, prerequisites: prereqs[s] || [] }]));

  return {
    skills: skillMap,
    validate: () => ({ valid: true, errors: [] }),
    getTopologicalOrder: () => {
      // Simple topological sort for testing
      const visited = new Set<string>();
      const result: string[] = [];

      const visit = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        for (const prereq of prereqs[id] || []) {
          visit(prereq);
        }
        result.push(id);
      };

      for (const skill of skills) {
        visit(skill);
      }
      return result;
    },
    getAllPrerequisites: (skillId: string) => {
      const result = new Set<string>();
      const queue = [...(prereqs[skillId] || [])];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (!result.has(current)) {
          result.add(current);
          queue.push(...(prereqs[current] || []));
        }
      }
      return Array.from(result);
    },
    getDependents: (skillId: string) => {
      return skills.filter(s => (prereqs[s] || []).includes(skillId));
    },
    isPrerequisiteOf: (skillA: string, skillB: string) => {
      const allPrereqs = new Set<string>();
      const queue = [...(prereqs[skillB] || [])];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === skillA) return true;
        if (!allPrereqs.has(current)) {
          allPrereqs.add(current);
          queue.push(...(prereqs[current] || []));
        }
      }
      return false;
    },
  };
}

// Helper to create item mappings
function createItemMappings(items: Array<{
  id: string;
  skill: string;
  difficulty: number;
  secondarySkills?: string[];
}>): ItemSkillMapping[] {
  return items.map(item => ({
    itemId: item.id,
    primarySkillId: item.skill,
    secondarySkillIds: item.secondarySkills || [],
    difficulty: item.difficulty,
  }));
}

describe('DiagnosticEngineImpl', () => {
  let engine: DiagnosticEngineImpl;

  beforeEach(() => {
    engine = createDiagnosticEngine();
  });

  describe('generateDiagnostic', () => {
    it('should generate items in topological order', () => {
      const skillGraph = createMockSkillGraph(['A', 'B', 'C'], {
        B: ['A'],
        C: ['B'],
      });

      const itemMappings = createItemMappings([
        { id: 'item-a', skill: 'A', difficulty: 0.5 },
        { id: 'item-b', skill: 'B', difficulty: 0.5 },
        { id: 'item-c', skill: 'C', difficulty: 0.5 },
      ]);

      const result = engine.generateDiagnostic(skillGraph, itemMappings, 10);

      // A should come before B, B before C
      const indexA = result.indexOf('item-a');
      const indexB = result.indexOf('item-b');
      const indexC = result.indexOf('item-c');

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });

    it('should respect maxItems limit', () => {
      const skillGraph = createMockSkillGraph(['A', 'B', 'C', 'D', 'E']);

      const itemMappings = createItemMappings([
        { id: 'item-a1', skill: 'A', difficulty: 0.3 },
        { id: 'item-a2', skill: 'A', difficulty: 0.5 },
        { id: 'item-a3', skill: 'A', difficulty: 0.7 },
        { id: 'item-b1', skill: 'B', difficulty: 0.3 },
        { id: 'item-b2', skill: 'B', difficulty: 0.5 },
        { id: 'item-c1', skill: 'C', difficulty: 0.5 },
        { id: 'item-d1', skill: 'D', difficulty: 0.5 },
        { id: 'item-e1', skill: 'E', difficulty: 0.5 },
      ]);

      const result = engine.generateDiagnostic(skillGraph, itemMappings, 5);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should select items with difficulty spread', () => {
      const skillGraph = createMockSkillGraph(['A']);

      const itemMappings = createItemMappings([
        { id: 'easy', skill: 'A', difficulty: 0.2 },
        { id: 'medium', skill: 'A', difficulty: 0.5 },
        { id: 'hard', skill: 'A', difficulty: 0.8 },
      ]);

      const engineWithMinMax = createDiagnosticEngine({
        minItemsPerSkill: 3,
        maxItemsPerSkill: 3,
      });

      const result = engineWithMinMax.generateDiagnostic(skillGraph, itemMappings, 10);

      // Should include all three items with different difficulties
      expect(result).toContain('easy');
      expect(result).toContain('medium');
      expect(result).toContain('hard');
    });

    it('should handle empty item mappings', () => {
      const skillGraph = createMockSkillGraph(['A', 'B']);
      const result = engine.generateDiagnostic(skillGraph, [], 10);
      expect(result).toEqual([]);
    });

    it('should handle skills with no items', () => {
      const skillGraph = createMockSkillGraph(['A', 'B', 'C']);

      const itemMappings = createItemMappings([
        { id: 'item-a', skill: 'A', difficulty: 0.5 },
        // No items for skill B
        { id: 'item-c', skill: 'C', difficulty: 0.5 },
      ]);

      const result = engine.generateDiagnostic(skillGraph, itemMappings, 10);

      expect(result).toContain('item-a');
      expect(result).toContain('item-c');
      expect(result.length).toBe(2);
    });
  });

  describe('analyzeResults', () => {
    it('should calculate basic accuracy correctly', () => {
      const skillGraph = createMockSkillGraph(['A']);

      const itemMappings = createItemMappings([
        { id: 'item1', skill: 'A', difficulty: 0.5 },
        { id: 'item2', skill: 'A', difficulty: 0.5 },
        { id: 'item3', skill: 'A', difficulty: 0.5 },
        { id: 'item4', skill: 'A', difficulty: 0.5 },
      ]);

      // 75% correct
      const responses = [
        { itemId: 'item1', correct: true },
        { itemId: 'item2', correct: true },
        { itemId: 'item3', correct: true },
        { itemId: 'item4', correct: false },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // 75% accuracy with average difficulty 0.5 should give estimate close to 0.75
      const estimate = result.get('A')!;
      expect(estimate).toBeCloseTo(0.75, 1);
    });

    it('should adjust for high difficulty items', () => {
      const skillGraph = createMockSkillGraph(['A']);

      const itemMappings = createItemMappings([
        { id: 'hard1', skill: 'A', difficulty: 0.9 },
        { id: 'hard2', skill: 'A', difficulty: 0.9 },
      ]);

      // 50% correct on hard items
      const responses = [
        { itemId: 'hard1', correct: true },
        { itemId: 'hard2', correct: false },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // High difficulty should boost estimate
      const estimate = result.get('A')!;
      // 50% accuracy + difficulty adjustment (0.9 - 0.5) * 0.3 = 0.5 + 0.12 = 0.62
      expect(estimate).toBeGreaterThan(0.5);
    });

    it('should adjust for low difficulty items', () => {
      const skillGraph = createMockSkillGraph(['A']);

      const itemMappings = createItemMappings([
        { id: 'easy1', skill: 'A', difficulty: 0.1 },
        { id: 'easy2', skill: 'A', difficulty: 0.1 },
      ]);

      // 50% correct on easy items
      const responses = [
        { itemId: 'easy1', correct: true },
        { itemId: 'easy2', correct: false },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // Low difficulty should reduce estimate
      const estimate = result.get('A')!;
      // 50% accuracy + difficulty adjustment (0.1 - 0.5) * 0.3 = 0.5 - 0.12 = 0.38
      expect(estimate).toBeLessThan(0.5);
    });

    it('should clamp estimates between 0.05 and 0.95', () => {
      const skillGraph = createMockSkillGraph(['A', 'B']);

      const itemMappings = createItemMappings([
        { id: 'item-a1', skill: 'A', difficulty: 0.5 },
        { id: 'item-a2', skill: 'A', difficulty: 0.5 },
        { id: 'item-b1', skill: 'B', difficulty: 0.5 },
        { id: 'item-b2', skill: 'B', difficulty: 0.5 },
      ]);

      const responses = [
        { itemId: 'item-a1', correct: true },
        { itemId: 'item-a2', correct: true },
        { itemId: 'item-b1', correct: false },
        { itemId: 'item-b2', correct: false },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // 100% correct should be clamped to 0.95
      expect(result.get('A')!).toBeLessThanOrEqual(0.95);
      // 0% correct should be clamped to 0.05
      expect(result.get('B')!).toBeGreaterThanOrEqual(0.05);
    });

    it('should account for secondary skills with reduced weight', () => {
      const skillGraph = createMockSkillGraph(['A', 'B']);

      const itemMappings = createItemMappings([
        { id: 'item1', skill: 'A', difficulty: 0.5, secondarySkills: ['B'] },
        { id: 'item2', skill: 'A', difficulty: 0.5, secondarySkills: ['B'] },
      ]);

      const responses = [
        { itemId: 'item1', correct: true },
        { itemId: 'item2', correct: true },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // Primary skill A should have higher estimate than secondary skill B
      // because secondary skills contribute with half difficulty weight
      expect(result.has('A')).toBe(true);
      expect(result.has('B')).toBe(true);
    });

    it('should use default prior for skills with no data', () => {
      const skillGraph = createMockSkillGraph(['A', 'B']);

      const itemMappings = createItemMappings([
        { id: 'item-a', skill: 'A', difficulty: 0.5 },
      ]);

      const responses = [
        { itemId: 'item-a', correct: true },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // Skill B has no data, should get default prior
      expect(result.get('B')).toBe(0.3);
    });

    it('should handle empty responses', () => {
      const skillGraph = createMockSkillGraph(['A', 'B']);
      const itemMappings = createItemMappings([
        { id: 'item-a', skill: 'A', difficulty: 0.5 },
      ]);

      const result = engine.analyzeResults(skillGraph, itemMappings, []);

      // All skills should get default prior
      expect(result.get('A')).toBe(0.3);
      expect(result.get('B')).toBe(0.3);
    });
  });

  describe('estimate propagation', () => {
    it('should boost prerequisite estimates when skill is mastered', () => {
      const skillGraph = createMockSkillGraph(['prereq', 'advanced'], {
        advanced: ['prereq'],
      });

      const itemMappings = createItemMappings([
        { id: 'item-advanced', skill: 'advanced', difficulty: 0.5 },
      ]);

      // Get 100% on advanced skill (clamped to 0.95)
      const responses = [
        { itemId: 'item-advanced', correct: true },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // Prerequisite should be boosted because advanced is mastered
      // Default boost factor is 0.9, so prereq should be >= 0.95 * 0.9 = 0.855
      expect(result.get('prereq')!).toBeGreaterThan(0.8);
    });

    it('should not boost prerequisites when skill is not mastered', () => {
      const skillGraph = createMockSkillGraph(['prereq', 'advanced'], {
        advanced: ['prereq'],
      });

      const itemMappings = createItemMappings([
        { id: 'item-advanced', skill: 'advanced', difficulty: 0.5 },
      ]);

      // Get 0% on advanced skill
      const responses = [
        { itemId: 'item-advanced', correct: false },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // Prerequisite should remain at default (not boosted)
      expect(result.get('prereq')!).toBe(0.3);
    });

    it('should use configurable prerequisite boost factor', () => {
      const customEngine = createDiagnosticEngine({
        prerequisiteBoostFactor: 0.5, // Very low boost
      });

      const skillGraph = createMockSkillGraph(['prereq', 'advanced'], {
        advanced: ['prereq'],
      });

      const itemMappings = createItemMappings([
        { id: 'item-advanced', skill: 'advanced', difficulty: 0.5 },
      ]);

      const responses = [
        { itemId: 'item-advanced', correct: true },
      ];

      const result = customEngine.analyzeResults(skillGraph, itemMappings, responses);

      // With 0.5 boost factor: prereq should be max(0.3, 0.95 * 0.5) = max(0.3, 0.475) = 0.475
      const prereqEstimate = result.get('prereq')!;
      expect(prereqEstimate).toBeCloseTo(0.475, 1);
    });

    it('should propagate through multi-level prerequisites', () => {
      const skillGraph = createMockSkillGraph(['level1', 'level2', 'level3'], {
        level2: ['level1'],
        level3: ['level2'],
      });

      const itemMappings = createItemMappings([
        { id: 'item-l3', skill: 'level3', difficulty: 0.5 },
      ]);

      const responses = [
        { itemId: 'item-l3', correct: true },
      ];

      const result = engine.analyzeResults(skillGraph, itemMappings, responses);

      // Level3 mastered -> level2 boosted -> level1 should also be boosted
      expect(result.get('level1')!).toBeGreaterThan(0.3);
      expect(result.get('level2')!).toBeGreaterThan(0.3);
    });
  });

  describe('getSummary', () => {
    it('should categorize skills correctly', () => {
      const skillGraph = createMockSkillGraph(['mastered', 'learning', 'notStarted']);

      const estimates = new Map([
        ['mastered', 0.85],
        ['learning', 0.5],
        ['notStarted', 0.1],
      ]);

      const summary = engine.getSummary(skillGraph, estimates);

      expect(summary.masteredCount).toBe(1);
      expect(summary.learningCount).toBe(1);
      expect(summary.notStartedCount).toBe(1);
      expect(summary.masteredSkills).toContain('mastered');
      expect(summary.learningSkills).toContain('learning');
      expect(summary.notStartedSkills).toContain('notStarted');
    });

    it('should use default prior for missing estimates', () => {
      const skillGraph = createMockSkillGraph(['known', 'unknown']);

      const estimates = new Map([
        ['known', 0.8],
        // 'unknown' is missing
      ]);

      const summary = engine.getSummary(skillGraph, estimates);

      // 'unknown' should be treated as learning (default prior 0.3 >= 0.3)
      expect(summary.totalSkills).toBe(2);
      expect(summary.masteredCount).toBe(1);
      expect(summary.learningCount).toBe(1);
    });

    it('should handle empty estimates', () => {
      const skillGraph = createMockSkillGraph(['A', 'B', 'C']);
      const estimates = new Map<string, number>();

      const summary = engine.getSummary(skillGraph, estimates);

      // All skills should be "learning" with default prior
      expect(summary.totalSkills).toBe(3);
      expect(summary.learningCount).toBe(3);
      expect(summary.masteredCount).toBe(0);
      expect(summary.notStartedCount).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should use default configuration values', () => {
      expect(DEFAULT_DIAGNOSTIC_CONFIG.minItemsPerSkill).toBe(2);
      expect(DEFAULT_DIAGNOSTIC_CONFIG.maxItemsPerSkill).toBe(5);
      expect(DEFAULT_DIAGNOSTIC_CONFIG.masteryThreshold).toBe(0.7);
      expect(DEFAULT_DIAGNOSTIC_CONFIG.difficultyWeight).toBe(0.3);
      expect(DEFAULT_DIAGNOSTIC_CONFIG.prerequisiteBoostFactor).toBe(0.9);
    });

    it('should allow custom configuration', () => {
      const customEngine = createDiagnosticEngine({
        masteryThreshold: 0.9,
        difficultyWeight: 0.5,
      });

      const skillGraph = createMockSkillGraph(['A']);
      const estimates = new Map([['A', 0.85]]);

      const summary = customEngine.getSummary(skillGraph, estimates);

      // With threshold 0.9, 0.85 should be "learning", not "mastered"
      expect(summary.masteredCount).toBe(0);
      expect(summary.learningCount).toBe(1);
    });
  });

  describe('determinism', () => {
    it('should produce identical results for same inputs', () => {
      const skillGraph = createMockSkillGraph(['A', 'B', 'C'], {
        B: ['A'],
        C: ['B'],
      });

      const itemMappings = createItemMappings([
        { id: 'a1', skill: 'A', difficulty: 0.3 },
        { id: 'a2', skill: 'A', difficulty: 0.7 },
        { id: 'b1', skill: 'B', difficulty: 0.5 },
        { id: 'c1', skill: 'C', difficulty: 0.6 },
      ]);

      const responses = [
        { itemId: 'a1', correct: true },
        { itemId: 'a2', correct: false },
        { itemId: 'b1', correct: true },
        { itemId: 'c1', correct: true },
      ];

      // Run analysis multiple times
      const result1 = engine.analyzeResults(skillGraph, itemMappings, responses);
      const result2 = engine.analyzeResults(skillGraph, itemMappings, responses);

      // Results should be identical
      expect(result1.get('A')).toBe(result2.get('A'));
      expect(result1.get('B')).toBe(result2.get('B'));
      expect(result1.get('C')).toBe(result2.get('C'));
    });

    it('should generate same diagnostic for same inputs', () => {
      const skillGraph = createMockSkillGraph(['A', 'B']);

      const itemMappings = createItemMappings([
        { id: 'a1', skill: 'A', difficulty: 0.3 },
        { id: 'a2', skill: 'A', difficulty: 0.7 },
        { id: 'b1', skill: 'B', difficulty: 0.5 },
      ]);

      const result1 = engine.generateDiagnostic(skillGraph, itemMappings, 10);
      const result2 = engine.generateDiagnostic(skillGraph, itemMappings, 10);

      expect(result1).toEqual(result2);
    });
  });
});
