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
import type { SkillGraph, DiagnosticEngine, ItemSkillMapping } from '../constitution.js';
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
export declare const DEFAULT_DIAGNOSTIC_CONFIG: DiagnosticConfig;
/**
 * Diagnostic Engine Implementation
 */
export declare class DiagnosticEngineImpl implements DiagnosticEngine {
    private readonly config;
    constructor(config?: Partial<DiagnosticConfig>);
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
    generateDiagnostic(skillGraph: SkillGraph, itemMappings: ItemSkillMapping[], maxItems: number): string[];
    /**
     * Analyze diagnostic results to initialize learner model
     *
     * @param skillGraph - The skill graph
     * @param itemMappings - Item-to-skill mappings
     * @param responses - Learner responses (itemId, correct)
     * @returns Map of skillId to estimated mastery probability
     */
    analyzeResults(skillGraph: SkillGraph, itemMappings: ItemSkillMapping[], responses: Array<{
        itemId: string;
        correct: boolean;
    }>): Map<string, number>;
    /**
     * Update skill result with a response
     * @param weight - How much this response counts (1.0 for primary, 0.5 for secondary skills)
     */
    private updateSkillResult;
    /**
     * Select evenly spaced indices for difficulty spread
     */
    private selectSpacedIndices;
    /**
     * Propagate mastery estimates through prerequisite structure
     *
     * If a skill is mastered, its prerequisites should also be considered mastered
     * (they were necessary to learn the dependent skill)
     */
    private propagateEstimates;
    /**
     * Get diagnostic summary for a set of results
     */
    getSummary(skillGraph: SkillGraph, estimates: Map<string, number>): DiagnosticSummary;
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
export declare function createDiagnosticEngine(config?: Partial<DiagnosticConfig>): DiagnosticEngineImpl;
//# sourceMappingURL=DiagnosticEngineImpl.d.ts.map