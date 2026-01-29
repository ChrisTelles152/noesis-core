/**
 * Learner Model Module
 *
 * Provides BKT-style learner modeling with inspectable probability estimates.
 */

export type {
  SkillProbability,
  LearnerModel,
  LearnerModelEngine,
} from '../constitution.js';

export {
  BKTEngine,
  createBKTEngine,
  DEFAULT_BKT_PARAMS,
  validateBKTParams,
  type BKTParams,
} from './BKTEngine.js';

export type { ClockFn } from '../events/index.js';
