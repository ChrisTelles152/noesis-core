/**
 * Learner Model Module
 *
 * Provides BKT-style learner modeling with inspectable probability estimates.
 */
export type { SkillProbability, LearnerModel, LearnerModelEngine } from '../constitution.js';
export { BKTEngine, createBKTEngine, DEFAULT_BKT_PARAMS, validateBKTParams, type BKTParams, } from './BKTEngine.js';
export { MultiChannelBKTEngine, createMultiChannelBKTEngine, calculateBKTUpdate, applyCategoryModifier, utcDateString, DEFAULT_DRILLING_DISCOUNT, type ChannelId, type ChannelBKTConfig, type SkillCategoryModifier, type DrillingDiscountConfig, type MultiChannelBKTConfig, type ChannelSkillProbability, type BKTAttemptResult, type BKTComputeResult, } from './MultiChannelBKTEngine.js';
export type { ClockFn } from '../events/index.js';
//# sourceMappingURL=index.d.ts.map