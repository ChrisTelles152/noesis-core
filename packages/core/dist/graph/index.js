/**
 * Skill Graph Module
 *
 * Provides the DAG-based skill graph representation with validation,
 * prerequisite logic, and topological sorting.
 */
export { SkillGraphImpl, createSkillGraph } from './SkillGraphImpl.js';
// Graph loader for JSON import/export
export { loadSkillGraphFromJSON, parseSkillGraph, exportSkillGraphToJSON, SKILL_GRAPH_SCHEMA_VERSION, } from './loader.js';
//# sourceMappingURL=index.js.map