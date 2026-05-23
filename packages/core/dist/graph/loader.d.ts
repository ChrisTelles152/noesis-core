/**
 * Skill Graph Loader
 *
 * Provides functions to load skill graphs from JSON format.
 * Validates the graph after loading and throws on invalid graphs.
 */
import type { SkillGraph } from '../constitution.js';
/**
 * JSON format for skill graph serialization
 */
export interface SkillGraphJSON {
    /** Schema version for forward compatibility */
    version: string;
    /** Array of skills */
    skills: Array<{
        /** Unique skill identifier */
        id: string;
        /** Human-readable name */
        name: string;
        /** IDs of prerequisite skills */
        prerequisites: string[];
        /** IDs of skills implicitly practiced when this skill is practiced */
        encompassedSkills?: string[];
        /** Optional description */
        description?: string;
        /** Optional category for grouping */
        category?: string;
        /** Optional difficulty (0-1) */
        difficulty?: number;
    }>;
}
/**
 * Current schema version
 */
export declare const SKILL_GRAPH_SCHEMA_VERSION = "1.0.0";
/**
 * Load a skill graph from a parsed JSON object.
 * Validates the graph and throws if invalid.
 *
 * @param json - Parsed JSON object conforming to SkillGraphJSON
 * @returns Validated SkillGraph instance
 * @throws Error if graph is invalid (cycles, missing prerequisites)
 */
export declare function loadSkillGraphFromJSON(json: SkillGraphJSON): SkillGraph;
/**
 * Parse a JSON string and load it as a skill graph.
 * Validates the graph and throws if invalid.
 *
 * @param jsonString - JSON string conforming to SkillGraphJSON
 * @returns Validated SkillGraph instance
 * @throws Error if JSON is malformed or graph is invalid
 */
export declare function parseSkillGraph(jsonString: string): SkillGraph;
/**
 * Export a skill graph to JSON format.
 * Useful for serializing graphs for storage or transfer.
 *
 * @param graph - SkillGraph to export
 * @returns JSON object conforming to SkillGraphJSON
 */
export declare function exportSkillGraphToJSON(graph: SkillGraph): SkillGraphJSON;
//# sourceMappingURL=loader.d.ts.map