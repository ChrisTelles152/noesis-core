/**
 * Session Planning Module
 *
 * Provides deterministic session planning with gap targeting.
 */
export { SessionPlannerImpl, createSessionPlanner, DEFAULT_SESSION_PLANNER_CONFIG, } from './SessionPlannerImpl.js';
export { BudgetedSessionPlanner, createBudgetedSessionPlanner, DEFAULT_SESSION_BUDGET_CONFIG, } from './BudgetedSessionPlanner.js';
export { buildPlannerSnapshot, planFromSnapshot, serializePlannerSnapshot, deserializePlannerSnapshot, PLANNER_SNAPSHOT_VERSION, } from './PlannerSnapshot.js';
/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG = {
    maxDurationMinutes: 30,
    targetItems: 20,
    masteryThreshold: 0.85,
    enforceSpacedRetrieval: true,
    requireTransferTests: true,
};
//# sourceMappingURL=index.js.map