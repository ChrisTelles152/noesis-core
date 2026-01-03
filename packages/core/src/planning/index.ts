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

// TODO: Implement SessionPlanner
// export { createSessionPlanner } from './SessionPlannerImpl';

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

/**
 * Placeholder: Create a session planner
 */
export function createSessionPlanner(): import('../constitution').SessionPlanner {
  throw new Error('Not implemented: createSessionPlanner - see packages/core/src/planning for TODOs');
}
