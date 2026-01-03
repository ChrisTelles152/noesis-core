/**
 * Learner Model Module
 *
 * Provides BKT-style learner modeling with inspectable probability estimates.
 */

export type {
  SkillProbability,
  LearnerModel,
  LearnerModelEngine,
} from '../constitution';

// TODO: Implement LearnerModelEngine
// export { createLearnerModelEngine } from './BKTEngine';

/**
 * Default BKT parameters (research-based starting points)
 */
export const DEFAULT_BKT_PARAMS = {
  /** Initial probability of mastery */
  pInit: 0.3,
  /** Probability of learning (transition to mastery) */
  pLearn: 0.1,
  /** Probability of slip (mastered but incorrect) */
  pSlip: 0.1,
  /** Probability of guess (not mastered but correct) */
  pGuess: 0.2,
};

/**
 * Placeholder: Create a learner model engine
 */
export function createLearnerModelEngine(): import('../constitution').LearnerModelEngine {
  throw new Error('Not implemented: createLearnerModelEngine - see packages/core/src/learner for TODOs');
}
