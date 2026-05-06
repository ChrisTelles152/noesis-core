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

export {
  BudgetedSessionPlanner,
  createBudgetedSessionPlanner,
  DEFAULT_SESSION_BUDGET_CONFIG,
  type SessionBudgetConfig,
  type ReviewCandidate,
  type ErrorCandidate,
  type NewItemCandidate,
  type SessionPlanInput,
  type SessionPlan,
} from './BudgetedSessionPlanner.js';

export {
  buildPlannerSnapshot,
  planFromSnapshot,
  serializePlannerSnapshot,
  deserializePlannerSnapshot,
  PLANNER_SNAPSHOT_VERSION,
  type PlannerSnapshot,
  type BuildSnapshotArgs,
} from './PlannerSnapshot.js';

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
