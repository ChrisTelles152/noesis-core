/**
 * SkillGraph Implementation
 *
 * A directed acyclic graph (DAG) of skills with validation,
 * topological sorting, and prerequisite traversal.
 *
 * Deterministic: all operations produce the same output for the same input.
 */

import type {
  Skill,
  SkillGraph,
  SkillGraphValidationResult,
  SkillGraphError,
} from '../constitution.js';

/**
 * Concrete implementation of SkillGraph
 */
export class SkillGraphImpl implements SkillGraph {
  readonly skills: Map<string, Skill>;

  constructor(skills: Skill[] = []) {
    this.skills = new Map();
    for (const skill of skills) {
      this.skills.set(skill.id, skill);
    }
  }

  /**
   * Add a skill to the graph
   */
  addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * Remove a skill from the graph
   */
  removeSkill(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Validate graph integrity:
   * - No cycles
   * - All prerequisite references exist
   * - No duplicate skill IDs (handled by Map)
   */
  validate(): SkillGraphValidationResult {
    const errors: SkillGraphError[] = [];

    // Check for missing prerequisites
    for (const [skillId, skill] of this.skills) {
      for (const prereqId of skill.prerequisites) {
        if (!this.skills.has(prereqId)) {
          errors.push({
            type: 'MISSING_PREREQUISITE',
            message: `Skill "${skillId}" references non-existent prerequisite "${prereqId}"`,
            affectedSkills: [skillId, prereqId],
          });
        }
      }
    }

    // Check for cycles using DFS
    const cycleSkills = this.detectCycles();
    if (cycleSkills.length > 0) {
      errors.push({
        type: 'CYCLE_DETECTED',
        message: `Cycle detected involving skills: ${cycleSkills.join(', ')}`,
        affectedSkills: cycleSkills,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Detect cycles in the graph using DFS
   * Returns list of skill IDs involved in cycles
   */
  private detectCycles(): string[] {
    const WHITE = 0; // Not visited
    const GRAY = 1;  // In current DFS path
    const BLACK = 2; // Fully processed

    const color = new Map<string, number>();
    const cycleNodes: Set<string> = new Set();

    // Initialize all nodes as WHITE
    for (const skillId of this.skills.keys()) {
      color.set(skillId, WHITE);
    }

    const dfs = (skillId: string, path: string[]): boolean => {
      color.set(skillId, GRAY);
      path.push(skillId);

      const skill = this.skills.get(skillId);
      if (skill) {
        for (const prereqId of skill.prerequisites) {
          if (!this.skills.has(prereqId)) continue;

          const prereqColor = color.get(prereqId);
          if (prereqColor === GRAY) {
            // Found a cycle - mark all nodes in path from prereqId
            const cycleStart = path.indexOf(prereqId);
            for (let i = cycleStart; i < path.length; i++) {
              cycleNodes.add(path[i]);
            }
            return true;
          } else if (prereqColor === WHITE) {
            if (dfs(prereqId, path)) {
              return true;
            }
          }
        }
      }

      path.pop();
      color.set(skillId, BLACK);
      return false;
    };

    // Run DFS from each unvisited node
    for (const skillId of this.skills.keys()) {
      if (color.get(skillId) === WHITE) {
        dfs(skillId, []);
      }
    }

    // Return sorted for determinism
    return Array.from(cycleNodes).sort();
  }

  /**
   * Get skills in topological order (prerequisites before dependents)
   * Uses Kahn's algorithm for deterministic ordering
   */
  getTopologicalOrder(): string[] {
    // Calculate in-degree for each skill
    const inDegree = new Map<string, number>();
    for (const skillId of this.skills.keys()) {
      inDegree.set(skillId, 0);
    }

    for (const [skillId, skill] of this.skills) {
      for (const prereqId of skill.prerequisites) {
        if (this.skills.has(prereqId)) {
          // prereqId -> skillId edge, so skillId has higher in-degree
          inDegree.set(skillId, (inDegree.get(skillId) || 0) + 1);
        }
      }
    }

    // Start with skills that have no prerequisites (in-degree 0)
    // Collect all zero-degree skills first
    const zeroDegreeSkilss: string[] = [];
    for (const [skillId, degree] of inDegree) {
      if (degree === 0) {
        zeroDegreeSkilss.push(skillId);
      }
    }
    // Sort once for determinism
    zeroDegreeSkilss.sort();

    const result: string[] = [];
    const processed = new Set<string>();

    // Use a sorted approach: process skills in sorted order at each level
    // Instead of sorting the queue every iteration (O(n² log n)),
    // we collect all newly-available skills per level and sort once
    let currentLevel = zeroDegreeSkilss;

    while (currentLevel.length > 0) {
      const nextLevel: string[] = [];

      for (const skillId of currentLevel) {
        if (processed.has(skillId)) continue;
        processed.add(skillId);
        result.push(skillId);

        // Find skills that depend on this one and decrement their in-degree
        for (const [dependentId, dependent] of this.skills) {
          if (dependent.prerequisites.includes(skillId)) {
            const newDegree = (inDegree.get(dependentId) || 0) - 1;
            inDegree.set(dependentId, newDegree);
            if (newDegree === 0 && !processed.has(dependentId)) {
              nextLevel.push(dependentId);
            }
          }
        }
      }

      // Sort once per level for determinism (O(k log k) where k is level size)
      nextLevel.sort();
      currentLevel = nextLevel;
    }

    return result;
  }

  /**
   * Get all prerequisites (transitive) for a skill
   * Returns in topological order (deepest prerequisites first)
   */
  getAllPrerequisites(skillId: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const dfs = (id: string): void => {
      const skill = this.skills.get(id);
      if (!skill) return;

      for (const prereqId of skill.prerequisites) {
        if (!visited.has(prereqId) && this.skills.has(prereqId)) {
          visited.add(prereqId);
          dfs(prereqId);
          result.push(prereqId);
        }
      }
    };

    dfs(skillId);

    // Return in order: deepest prerequisites first
    return result;
  }

  /**
   * Get skills that directly or indirectly depend on this skill
   */
  getDependents(skillId: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const dfs = (id: string): void => {
      for (const [dependentId, dependent] of this.skills) {
        if (dependent.prerequisites.includes(id) && !visited.has(dependentId)) {
          visited.add(dependentId);
          result.push(dependentId);
          dfs(dependentId);
        }
      }
    };

    dfs(skillId);

    // Sort for determinism
    return result.sort();
  }

  /**
   * Check if skillA is a prerequisite (direct or transitive) of skillB
   */
  isPrerequisiteOf(skillA: string, skillB: string): boolean {
    const prereqs = this.getAllPrerequisites(skillB);
    return prereqs.includes(skillA);
  }

  /**
   * Get the number of skills in the graph
   */
  get size(): number {
    return this.skills.size;
  }

  /**
   * Get all skill IDs
   */
  getSkillIds(): string[] {
    return Array.from(this.skills.keys()).sort();
  }
}

/**
 * Factory function to create a SkillGraph
 */
export function createSkillGraph(skills: Skill[] = []): SkillGraphImpl {
  return new SkillGraphImpl(skills);
}
