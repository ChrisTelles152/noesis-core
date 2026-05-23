/**
 * Skill Graph Loader
 *
 * Provides functions to load skill graphs from JSON format.
 * Validates the graph after loading and throws on invalid graphs.
 */
import { SkillGraphImpl } from './SkillGraphImpl.js';
/**
 * Current schema version
 */
export const SKILL_GRAPH_SCHEMA_VERSION = '1.0.0';
/**
 * Load a skill graph from a parsed JSON object.
 * Validates the graph and throws if invalid.
 *
 * @param json - Parsed JSON object conforming to SkillGraphJSON
 * @returns Validated SkillGraph instance
 * @throws Error if graph is invalid (cycles, missing prerequisites)
 */
export function loadSkillGraphFromJSON(json) {
    // Convert JSON skills to Skill objects
    const skills = json.skills.map((s) => ({
        id: s.id,
        name: s.name,
        prerequisites: s.prerequisites,
        encompassedSkills: s.encompassedSkills,
        description: s.description,
        category: s.category,
        difficulty: s.difficulty,
    }));
    // Create graph
    const graph = new SkillGraphImpl(skills);
    // Validate
    const result = graph.validate();
    if (!result.valid) {
        const messages = result.errors.map((e) => e.message).join('; ');
        throw new Error(`Invalid skill graph: ${messages}`);
    }
    return graph;
}
/**
 * Parse a JSON string and load it as a skill graph.
 * Validates the graph and throws if invalid.
 *
 * @param jsonString - JSON string conforming to SkillGraphJSON
 * @returns Validated SkillGraph instance
 * @throws Error if JSON is malformed or graph is invalid
 */
export function parseSkillGraph(jsonString) {
    const json = JSON.parse(jsonString);
    return loadSkillGraphFromJSON(json);
}
/**
 * Export a skill graph to JSON format.
 * Useful for serializing graphs for storage or transfer.
 *
 * @param graph - SkillGraph to export
 * @returns JSON object conforming to SkillGraphJSON
 */
export function exportSkillGraphToJSON(graph) {
    const skills = Array.from(graph.skills.values()).map((s) => ({
        id: s.id,
        name: s.name,
        prerequisites: s.prerequisites,
        encompassedSkills: s.encompassedSkills,
        description: s.description,
        category: s.category,
        difficulty: s.difficulty,
    }));
    return {
        version: SKILL_GRAPH_SCHEMA_VERSION,
        skills,
    };
}
//# sourceMappingURL=loader.js.map