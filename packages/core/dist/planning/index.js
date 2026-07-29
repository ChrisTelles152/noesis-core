/**
 * Session Planning Module
 *
 * Provides deterministic session planning with gap targeting.
 */
export { SessionPlannerImpl, createSessionPlanner, DEFAULT_SESSION_PLANNER_CONFIG, } from './SessionPlannerImpl.js';
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