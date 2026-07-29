/**
 * SkillGraph Implementation
 *
 * A directed acyclic graph (DAG) of skills with validation,
 * topological sorting, and prerequisite traversal.
 *
 * Deterministic: all operations produce the same output for the same input.
 */
import type { Skill, SkillGraph, SkillGraphValidationResult } from '../constitution';
/**
 * Concrete implementation of SkillGraph
 */
export declare class SkillGraphImpl implements SkillGraph {
    readonly skills: Map<string, Skill>;
    constructor(skills?: Skill[]);
    /**
     * Add a skill to the graph
     */
    addSkill(skill: Skill): void;
    /**
     * Remove a skill from the graph
     */
    removeSkill(skillId: string): boolean;
    /**
     * Get a skill by ID
     */
    getSkill(skillId: string): Skill | undefined;
    /**
     * Validate graph integrity:
     * - No cycles
     * - All prerequisite references exist
     * - No duplicate skill IDs (handled by Map)
     */
    validate(): SkillGraphValidationResult;
    /**
     * Detect cycles in the graph using DFS
     * Returns list of skill IDs involved in cycles
     */
    private detectCycles;
    /**
     * Get skills in topological order (prerequisites before dependents)
     * Uses Kahn's algorithm for deterministic ordering
     */
    getTopologicalOrder(): string[];
    /**
     * Get all prerequisites (transitive) for a skill
     * Returns in topological order (deepest prerequisites first)
     */
    getAllPrerequisites(skillId: string): string[];
    /**
     * Get skills that directly or indirectly depend on this skill
     */
    getDependents(skillId: string): string[];
    /**
     * Check if skillA is a prerequisite (direct or transitive) of skillB
     */
    isPrerequisiteOf(skillA: string, skillB: string): boolean;
    /**
     * Get the number of skills in the graph
     */
    get size(): number;
    /**
     * Get all skill IDs
     */
    getSkillIds(): string[];
}
/**
 * Factory function to create a SkillGraph
 */
export declare function createSkillGraph(skills?: Skill[]): SkillGraphImpl;
//# sourceMappingURL=SkillGraphImpl.d.ts.map