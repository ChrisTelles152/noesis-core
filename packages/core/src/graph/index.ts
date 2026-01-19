/**
 * Skill Graph Module
 *
 * Provides the DAG-based skill graph representation with validation,
 * prerequisite logic, and topological sorting.
 */

export type {
  Skill,
  SkillGraph,
  SkillGraphValidationResult,
  SkillGraphError,
} from '../constitution.js';

export { SkillGraphImpl, createSkillGraph } from './SkillGraphImpl.js';

// Graph loader for JSON import/export
export {
  loadSkillGraphFromJSON,
  parseSkillGraph,
  exportSkillGraphToJSON,
  SKILL_GRAPH_SCHEMA_VERSION,
  type SkillGraphJSON,
} from './loader.js';
