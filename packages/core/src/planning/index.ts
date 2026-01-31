/**
 * Session Planning Module
 *
 * Provides deterministic session planning with gap targeting.
 */

export type { SessionAction, SessionConfig, SessionPlanner } from '../constitution.js';

export {
  SessionPlannerImpl,
  createSessionPlanner,
  DEFAULT_SESSION_PLANNER_CONFIG,
  type SessionPlannerConfig,
  type PlannerState,
  type SessionStats,
} from './SessionPlannerImpl.js';

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: import('../constitution.js').SessionConfig = {
  maxDurationMinutes: 30,
  targetItems: 20,
  masteryThreshold: 0.85,
  enforceSpacedRetrieval: true,
  requireTransferTests: true,
};
