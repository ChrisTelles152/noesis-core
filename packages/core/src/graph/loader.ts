/**
 * Skill Graph Loader
 *
 * Provides functions to load skill graphs from JSON format.
 * Validates the graph after loading and throws on invalid graphs.
 */

import type { Skill, SkillGraph } from '../constitution.js';
import { SkillGraphImpl } from './SkillGraphImpl.js';

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
export const SKILL_GRAPH_SCHEMA_VERSION = '1.0.0';

/**
 * Load a skill graph from a parsed JSON object.
 * Validates the graph and throws if invalid.
 *
 * @param json - Parsed JSON object conforming to SkillGraphJSON
 * @returns Validated SkillGraph instance
 * @throws Error if graph is invalid (cycles, missing prerequisites)
 */
export function loadSkillGraphFromJSON(json: SkillGraphJSON): SkillGraph {
  // Convert JSON skills to Skill objects
  const skills: Skill[] = json.skills.map(s => ({
    id: s.id,
    name: s.name,
    prerequisites: s.prerequisites,
    description: s.description,
    category: s.category,
    difficulty: s.difficulty,
  }));

  // Create graph
  const graph = new SkillGraphImpl(skills);

  // Validate
  const result = graph.validate();
  if (!result.valid) {
    const messages = result.errors.map(e => e.message).join('; ');
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
export function parseSkillGraph(jsonString: string): SkillGraph {
  const json = JSON.parse(jsonString) as SkillGraphJSON;
  return loadSkillGraphFromJSON(json);
}

/**
 * Export a skill graph to JSON format.
 * Useful for serializing graphs for storage or transfer.
 *
 * @param graph - SkillGraph to export
 * @returns JSON object conforming to SkillGraphJSON
 */
export function exportSkillGraphToJSON(graph: SkillGraph): SkillGraphJSON {
  const skills = Array.from(graph.skills.values()).map(s => ({
    id: s.id,
    name: s.name,
    prerequisites: s.prerequisites,
    description: s.description,
    category: s.category,
    difficulty: s.difficulty,
  }));

  return {
    version: SKILL_GRAPH_SCHEMA_VERSION,
    skills,
  };
}
