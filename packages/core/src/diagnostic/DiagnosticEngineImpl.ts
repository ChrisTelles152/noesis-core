/**
 * Diagnostic Engine Implementation
 *
 * Provides diagnostic assessment for cold-start learner placement.
 * Uses adaptive item selection to efficiently estimate skill mastery.
 *
 * Key responsibilities:
 * - Generate diagnostic tests targeting key skills
 * - Analyze responses to estimate initial mastery levels
 * - Prioritize skills based on prerequisite structure
 *
 * DETERMINISM: All operations are pure and produce the same output
 * for the same input. No randomness.
 */

import type {
  SkillGraph,
  DiagnosticEngine,
  ItemSkillMapping,
} from '../constitution.js';

/**
 * Diagnostic Engine configuration
 */
export interface DiagnosticConfig {
  /** Minimum items per skill for reliable estimation */
  minItemsPerSkill: number;
  /** Maximum items per skill to avoid fatigue */
  maxItemsPerSkill: number;
  /** Threshold for considering a skill mastered (0-1) */
  masteryThreshold: number;
  /** Weight for difficulty in item selection */
  difficultyWeight: number;
  /**
   * Prerequisite boost factor (0-1).
   * When a skill is mastered, its prerequisites are boosted by this factor.
   * For example, if a learner masters skill B with estimate 0.8, and
   * prerequisiteBoostFactor is 0.9, then prerequisite skill A gets
   * boosted to max(currentEstimate, 0.8 * 0.9) = max(currentEstimate, 0.72).
   * Default: 0.9
   */
  prerequisiteBoostFactor: number;
}

/**
 * Default diagnostic configuration
 */
export const DEFAULT_DIAGNOSTIC_CONFIG: DiagnosticConfig = {
  minItemsPerSkill: 2,
  maxItemsPerSkill: 5,
  masteryThreshold: 0.7,
  difficultyWeight: 0.3,
  prerequisiteBoostFactor: 0.9,
};

/**
 * Internal result structure for analysis
 */
interface SkillResult {
  skillId: string;
  itemsAttempted: number;
  itemsCorrect: number;
  totalDifficulty: number;
}

/**
 * Diagnostic Engine Implementation
 */
export class DiagnosticEngineImpl implements DiagnosticEngine {
  private readonly config: DiagnosticConfig;

  constructor(config: Partial<DiagnosticConfig> = {}) {
    this.config = { ...DEFAULT_DIAGNOSTIC_CONFIG, ...config };
  }

  /**
   * Generate a diagnostic test for a skill graph
   *
   * Algorithm:
   * 1. Get skills in topological order (prerequisites first)
   * 2. For each skill, select items with appropriate difficulty spread
   * 3. Return item IDs in order
   *
   * @param skillGraph - The skill graph to assess
   * @param itemMappings - Available items with skill mappings
   * @param maxItems - Maximum total items to include
   * @returns Array of item IDs in recommended order
   */
  generateDiagnostic(
    skillGraph: SkillGraph,
    itemMappings: ItemSkillMapping[],
    maxItems: number
  ): string[] {
    const selectedItems: string[] = [];
    const skillOrder = skillGraph.getTopologicalOrder();

    // Group items by primary skill
    const itemsBySkill = new Map<string, ItemSkillMapping[]>();
    for (const mapping of itemMappings) {
      const items = itemsBySkill.get(mapping.primarySkillId) || [];
      items.push(mapping);
      itemsBySkill.set(mapping.primarySkillId, items);
    }

    // Calculate target items per skill
    const totalSkills = skillOrder.length;
    const baseItemsPerSkill = Math.max(
      this.config.minItemsPerSkill,
      Math.min(
        this.config.maxItemsPerSkill,
        Math.floor(maxItems / Math.max(1, totalSkills))
      )
    );

    // Select items for each skill in topological order
    for (const skillId of skillOrder) {
      if (selectedItems.length >= maxItems) break;

      const skillItems = itemsBySkill.get(skillId) || [];
      if (skillItems.length === 0) continue;

      // Sort items by difficulty for deterministic selection
      const sortedItems = [...skillItems].sort((a, b) => {
        if (a.difficulty !== b.difficulty) {
          return a.difficulty - b.difficulty;
        }
        return a.itemId.localeCompare(b.itemId);
      });

      // Select items with difficulty spread
      const targetCount = Math.min(
        baseItemsPerSkill,
        maxItems - selectedItems.length,
        sortedItems.length
      );

      // Select evenly spaced items by difficulty
      const indices = this.selectSpacedIndices(sortedItems.length, targetCount);
      for (const idx of indices) {
        const item = sortedItems[idx];
        if (!selectedItems.includes(item.itemId)) {
          selectedItems.push(item.itemId);
        }
      }
    }

    return selectedItems;
  }

  /**
   * Analyze diagnostic results to initialize learner model
   *
   * @param skillGraph - The skill graph
   * @param itemMappings - Item-to-skill mappings
   * @param responses - Learner responses (itemId, correct)
   * @returns Map of skillId to estimated mastery probability
   */
  analyzeResults(
    skillGraph: SkillGraph,
    itemMappings: ItemSkillMapping[],
    responses: Array<{ itemId: string; correct: boolean }>
  ): Map<string, number> {
    // Create item lookup
    const itemLookup = new Map<string, ItemSkillMapping>();
    for (const mapping of itemMappings) {
      itemLookup.set(mapping.itemId, mapping);
    }

    // Aggregate results by skill
    const skillResults = new Map<string, SkillResult>();

    for (const response of responses) {
      const mapping = itemLookup.get(response.itemId);
      if (!mapping) continue;

      // Update primary skill
      this.updateSkillResult(skillResults, mapping.primarySkillId, response.correct, mapping.difficulty);

      // Update secondary skills (with reduced weight)
      for (const secondaryId of mapping.secondarySkillIds) {
        this.updateSkillResult(skillResults, secondaryId, response.correct, mapping.difficulty * 0.5);
      }
    }

    // Calculate mastery estimates
    const masteryEstimates = new Map<string, number>();

    for (const [skillId, result] of skillResults) {
      if (result.itemsAttempted === 0) {
        // No data - use prior (0.3 default)
        masteryEstimates.set(skillId, 0.3);
        continue;
      }

      // Base accuracy
      const accuracy = result.itemsCorrect / result.itemsAttempted;

      // Adjust for difficulty
      const avgDifficulty = result.totalDifficulty / result.itemsAttempted;
      const difficultyAdjustment = (avgDifficulty - 0.5) * this.config.difficultyWeight;

      // Final estimate with clamping
      const estimate = Math.max(0.05, Math.min(0.95, accuracy + difficultyAdjustment));
      masteryEstimates.set(skillId, estimate);
    }

    // Propagate estimates to prerequisite skills using graph structure
    return this.propagateEstimates(skillGraph, masteryEstimates);
  }

  /**
   * Update skill result with a response
   */
  private updateSkillResult(
    results: Map<string, SkillResult>,
    skillId: string,
    correct: boolean,
    difficulty: number
  ): void {
    const existing = results.get(skillId) || {
      skillId,
      itemsAttempted: 0,
      itemsCorrect: 0,
      totalDifficulty: 0,
    };

    results.set(skillId, {
      skillId,
      itemsAttempted: existing.itemsAttempted + 1,
      itemsCorrect: existing.itemsCorrect + (correct ? 1 : 0),
      totalDifficulty: existing.totalDifficulty + difficulty,
    });
  }

  /**
   * Select evenly spaced indices for difficulty spread
   */
  private selectSpacedIndices(total: number, count: number): number[] {
    if (count >= total) {
      return Array.from({ length: total }, (_, i) => i);
    }
    if (count <= 0) {
      return [];
    }

    const indices: number[] = [];
    const step = (total - 1) / (count - 1 || 1);

    for (let i = 0; i < count; i++) {
      indices.push(Math.round(i * step));
    }

    return indices;
  }

  /**
   * Propagate mastery estimates through prerequisite structure
   *
   * If a skill is mastered, its prerequisites should also be considered mastered
   * (they were necessary to learn the dependent skill)
   */
  private propagateEstimates(
    skillGraph: SkillGraph,
    estimates: Map<string, number>
  ): Map<string, number> {
    const result = new Map(estimates);
    const skillOrder = skillGraph.getTopologicalOrder();

    // Process in reverse topological order (dependents before prerequisites)
    for (let i = skillOrder.length - 1; i >= 0; i--) {
      const skillId = skillOrder[i];
      const estimate = result.get(skillId);
      if (estimate === undefined) continue;

      // If skill is mastered, boost prerequisite estimates
      if (estimate >= this.config.masteryThreshold) {
        const prereqs = skillGraph.getAllPrerequisites(skillId);
        for (const prereqId of prereqs) {
          const prereqEstimate = result.get(prereqId) || 0.3;
          // Boost prerequisite estimate (learner must have learned it)
          // Use configurable boost factor instead of hardcoded 0.9
          result.set(prereqId, Math.max(prereqEstimate, estimate * this.config.prerequisiteBoostFactor));
        }
      }
    }

    // Initialize any skills without estimates
    for (const skillId of skillOrder) {
      if (!result.has(skillId)) {
        result.set(skillId, 0.3); // Default prior
      }
    }

    return result;
  }

  /**
   * Get diagnostic summary for a set of results
   */
  getSummary(
    skillGraph: SkillGraph,
    estimates: Map<string, number>
  ): DiagnosticSummary {
    const skillOrder = skillGraph.getTopologicalOrder();
    const mastered: string[] = [];
    const learning: string[] = [];
    const notStarted: string[] = [];

    for (const skillId of skillOrder) {
      const estimate = estimates.get(skillId) || 0.3;
      if (estimate >= this.config.masteryThreshold) {
        mastered.push(skillId);
      } else if (estimate >= 0.3) {
        learning.push(skillId);
      } else {
        notStarted.push(skillId);
      }
    }

    return {
      totalSkills: skillOrder.length,
      masteredCount: mastered.length,
      learningCount: learning.length,
      notStartedCount: notStarted.length,
      masteredSkills: mastered,
      learningSkills: learning,
      notStartedSkills: notStarted,
    };
  }
}

/**
 * Summary of diagnostic assessment
 */
export interface DiagnosticSummary {
  totalSkills: number;
  masteredCount: number;
  learningCount: number;
  notStartedCount: number;
  masteredSkills: string[];
  learningSkills: string[];
  notStartedSkills: string[];
}

/**
 * Factory function to create a DiagnosticEngine
 */
export function createDiagnosticEngine(
  config: Partial<DiagnosticConfig> = {}
): DiagnosticEngineImpl {
  return new DiagnosticEngineImpl(config);
}
