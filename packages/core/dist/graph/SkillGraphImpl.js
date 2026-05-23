/**
 * SkillGraph Implementation
 *
 * A directed acyclic graph (DAG) of skills with validation,
 * topological sorting, and prerequisite traversal.
 *
 * Deterministic: all operations produce the same output for the same input.
 */
/**
 * Concrete implementation of SkillGraph
 */
export class SkillGraphImpl {
    skills;
    constructor(skills = []) {
        this.skills = new Map();
        for (const skill of skills) {
            this.skills.set(skill.id, skill);
        }
    }
    /**
     * Add a skill to the graph
     */
    addSkill(skill) {
        this.skills.set(skill.id, skill);
    }
    /**
     * Remove a skill from the graph
     */
    removeSkill(skillId) {
        const deleted = this.skills.delete(skillId);
        if (deleted) {
            // Clean up dangling prerequisite and encompassing references in remaining skills
            for (const [, skill] of this.skills) {
                if (skill.prerequisites.includes(skillId)) {
                    skill.prerequisites = skill.prerequisites.filter((id) => id !== skillId);
                }
                if (skill.encompassedSkills?.includes(skillId)) {
                    skill.encompassedSkills = skill.encompassedSkills.filter((id) => id !== skillId);
                }
            }
        }
        return deleted;
    }
    /**
     * Get a skill by ID
     */
    getSkill(skillId) {
        return this.skills.get(skillId);
    }
    /**
     * Validate graph integrity:
     * - No cycles
     * - All prerequisite references exist
     * - No duplicate skill IDs (handled by Map)
     */
    validate() {
        const errors = [];
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
        // Check for missing encompassed skills
        for (const [skillId, skill] of this.skills) {
            for (const encompassedId of skill.encompassedSkills ?? []) {
                if (!this.skills.has(encompassedId)) {
                    errors.push({
                        type: 'INVALID_ENCOMPASSED_SKILL',
                        message: `Skill "${skillId}" references non-existent encompassed skill "${encompassedId}"`,
                        affectedSkills: [skillId, encompassedId],
                    });
                }
            }
        }
        // Check for cycles in prerequisite graph
        const cycleSkills = this.detectCycles();
        if (cycleSkills.length > 0) {
            errors.push({
                type: 'CYCLE_DETECTED',
                message: `Cycle detected involving skills: ${cycleSkills.join(', ')}`,
                affectedSkills: cycleSkills,
            });
        }
        // Check for cycles in encompassing graph
        const encompassingCycles = this.detectEncompassingCycles();
        if (encompassingCycles.length > 0) {
            errors.push({
                type: 'ENCOMPASSING_CYCLE',
                message: `Encompassing cycle detected involving skills: ${encompassingCycles.join(', ')}`,
                affectedSkills: encompassingCycles,
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
    detectCycles() {
        const WHITE = 0; // Not visited
        const GRAY = 1; // In current DFS path
        const BLACK = 2; // Fully processed
        const color = new Map();
        const cycleNodes = new Set();
        // Initialize all nodes as WHITE
        for (const skillId of this.skills.keys()) {
            color.set(skillId, WHITE);
        }
        const dfs = (skillId, path) => {
            color.set(skillId, GRAY);
            path.push(skillId);
            const skill = this.skills.get(skillId);
            if (skill) {
                for (const prereqId of skill.prerequisites) {
                    if (!this.skills.has(prereqId))
                        continue;
                    const prereqColor = color.get(prereqId);
                    if (prereqColor === GRAY) {
                        // Found a cycle - mark all nodes in the cycle path
                        const cycleStart = path.indexOf(prereqId);
                        for (let i = cycleStart; i < path.length; i++) {
                            cycleNodes.add(path[i]);
                        }
                    }
                    else if (prereqColor === WHITE) {
                        dfs(prereqId, path);
                    }
                }
            }
            path.pop();
            color.set(skillId, BLACK);
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
    getTopologicalOrder() {
        // Calculate in-degree for each skill
        const inDegree = new Map();
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
        const zeroDegreeSkills = [];
        for (const [skillId, degree] of inDegree) {
            if (degree === 0) {
                zeroDegreeSkills.push(skillId);
            }
        }
        // Sort once for determinism
        zeroDegreeSkills.sort();
        const result = [];
        const processed = new Set();
        // Use a sorted approach: process skills in sorted order at each level
        // Instead of sorting the queue every iteration (O(n² log n)),
        // we collect all newly-available skills per level and sort once
        let currentLevel = zeroDegreeSkills;
        while (currentLevel.length > 0) {
            const nextLevel = [];
            for (const skillId of currentLevel) {
                if (processed.has(skillId))
                    continue;
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
    getAllPrerequisites(skillId) {
        const visited = new Set();
        const result = [];
        const dfs = (id) => {
            const skill = this.skills.get(id);
            if (!skill)
                return;
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
    getDependents(skillId) {
        const visited = new Set();
        const result = [];
        const dfs = (id) => {
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
    isPrerequisiteOf(skillA, skillB) {
        const prereqs = this.getAllPrerequisites(skillB);
        return prereqs.includes(skillA);
    }
    /**
     * Get directly encompassed skills for a skill.
     * These are skills implicitly practiced when this skill is practiced.
     */
    getEncompassedSkills(skillId) {
        const skill = this.skills.get(skillId);
        return skill?.encompassedSkills ?? [];
    }
    /**
     * Get all encompassed skills (transitive closure).
     * If A encompasses B and B encompasses C, then getAllEncompassedSkills(A) returns [B, C].
     * Returns in DFS post-order (deepest first), sorted for determinism.
     */
    getAllEncompassedSkills(skillId) {
        const visited = new Set();
        const result = [];
        const dfs = (id) => {
            const skill = this.skills.get(id);
            if (!skill)
                return;
            for (const encompassedId of skill.encompassedSkills ?? []) {
                if (!visited.has(encompassedId) && this.skills.has(encompassedId)) {
                    visited.add(encompassedId);
                    dfs(encompassedId);
                    result.push(encompassedId);
                }
            }
        };
        dfs(skillId);
        return result;
    }
    /**
     * Detect cycles in the encompassing graph using DFS (3-color algorithm).
     * Separate from prerequisite cycle detection since they are independent graphs.
     */
    detectEncompassingCycles() {
        const WHITE = 0;
        const GRAY = 1;
        const BLACK = 2;
        const color = new Map();
        const cycleNodes = new Set();
        for (const skillId of this.skills.keys()) {
            color.set(skillId, WHITE);
        }
        const dfs = (skillId, path) => {
            color.set(skillId, GRAY);
            path.push(skillId);
            const skill = this.skills.get(skillId);
            if (skill) {
                for (const encompassedId of skill.encompassedSkills ?? []) {
                    if (!this.skills.has(encompassedId))
                        continue;
                    const c = color.get(encompassedId);
                    if (c === GRAY) {
                        const cycleStart = path.indexOf(encompassedId);
                        for (let i = cycleStart; i < path.length; i++) {
                            cycleNodes.add(path[i]);
                        }
                    }
                    else if (c === WHITE) {
                        dfs(encompassedId, path);
                    }
                }
            }
            path.pop();
            color.set(skillId, BLACK);
        };
        for (const skillId of this.skills.keys()) {
            if (color.get(skillId) === WHITE) {
                dfs(skillId, []);
            }
        }
        return Array.from(cycleNodes).sort();
    }
    /**
     * Get the number of skills in the graph
     */
    get size() {
        return this.skills.size;
    }
    /**
     * Get all skill IDs
     */
    getSkillIds() {
        return Array.from(this.skills.keys()).sort();
    }
}
/**
 * Factory function to create a SkillGraph
 */
export function createSkillGraph(skills = []) {
    return new SkillGraphImpl(skills);
}
//# sourceMappingURL=SkillGraphImpl.js.map