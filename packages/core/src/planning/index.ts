/**
 * Session Planning Module
 *
 * Provides deterministic session planning with gap targeting.
 */

export type {
  SessionAction,
  SessionConfig,
  SessionPlanner,
} from '../constitution';

export {
  SessionPlannerImpl,
  createSessionPlanner,
  DEFAULT_SESSION_PLANNER_CONFIG,
  type SessionPlannerConfig,
  type PlannerState,
  type SessionStats,
} from './SessionPlannerImpl';

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: import('../constitution').SessionConfig = {
  maxDurationMinutes: 30,
  targetItems: 20,
  masteryThreshold: 0.85,
  enforceSpacedRetrieval: true,
  requireTransferTests: true,
};
