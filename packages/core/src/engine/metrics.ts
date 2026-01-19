/**
 * Learner Metrics Module
 *
 * Provides human-readable, sellable metrics for learner progress.
 * Uses only public engine methods to extract proof of learning.
 */

import type { NoesisCoreEngineImpl } from './NoesisCoreEngineImpl.js';
import { calculateRetention } from '../memory/index.js';

/**
 * Milliseconds per day for time calculations
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Default mastery threshold for "mastered" classification
 */
const DEFAULT_MASTERY_THRESHOLD = 0.85;

/**
 * Default BKT pLearn for estimation (from DEFAULT_BKT_PARAMS)
 */
const DEFAULT_P_LEARN = 0.1;

/**
 * Comprehensive learner metrics for proof extraction.
 * All values are computed from engine state without exposing internals.
 */
export interface LearnerMetrics {
  /** Learner identifier */
  learnerId: string;

  /** Timestamp when metrics were computed (ms since epoch) */
  timestamp: number;

  /** Mastery probability per skill (0-1), from BKT model */
  masteryBySkill: Record<string, number>;

  /** Retention probability per skill (0-1), computed at timestamp via FSRS */
  retentionBySkill: Record<string, number>;

  /** Skills due for review, sorted by most overdue first */
  nextReviews: Array<{
    skillId: string;
    /** When the review is/was due (ms since epoch) */
    dueAt: number;
    /** Days overdue (negative if not yet due) */
    overdueDays: number;
  }>;

  /** Average mastery across all skills with data */
  averageMastery: number;

  /** Average retention across all skills with memory state */
  averageRetention: number;

  /** Count of skills at or above mastery threshold */
  skillsMastered: number;

  /** Count of skills currently due for review */
  skillsDue: number;

  /** Total practice events processed for this learner */
  totalPracticeEvents: number;

  /**
   * Estimated practice events needed to reach full mastery.
   *
   * PROXY: This is a rough estimate based on:
   * - Number of unmastered skills
   * - Average events needed per skill (using BKT pLearn)
   *
   * Formula: unmasteredSkills * ceil(log(1-threshold) / log(1-pLearn))
   * This estimates how many correct events are needed to reach threshold.
   *
   * NOT a guarantee - actual learning varies by individual.
   */
  estimatedEventsToFullMastery: number;
}

/**
 * Extract comprehensive metrics for a learner.
 *
 * Uses only public engine methods:
 * - getLearnerModel()
 * - getMemoryStates()
 * - getEventLog()
 * - getCurrentTime()
 * - graph (public property)
 *
 * @param engine - The NoesisCoreEngine instance
 * @param learnerId - The learner to extract metrics for
 * @param atTime - Optional timestamp for retention calculation (defaults to engine.getCurrentTime())
 * @returns LearnerMetrics with all computed values
 */
export function getLearnerMetrics(
  engine: NoesisCoreEngineImpl,
  learnerId: string,
  atTime?: number
): LearnerMetrics {
  const timestamp = atTime ?? engine.getCurrentTime();
  const model = engine.getLearnerModel(learnerId);
  const memoryStates = engine.getMemoryStates(learnerId);

  // Initialize result containers
  const masteryBySkill: Record<string, number> = {};
  const retentionBySkill: Record<string, number> = {};
  const nextReviews: LearnerMetrics['nextReviews'] = [];

  let totalMastery = 0;
  let masteryCount = 0;
  let totalRetention = 0;
  let retentionCount = 0;
  let skillsMastered = 0;
  let skillsDue = 0;

  // Extract mastery from BKT model
  if (model) {
    for (const [skillId, prob] of model.skillProbabilities) {
      const pMastery = prob.pMastery;
      masteryBySkill[skillId] = pMastery;
      totalMastery += pMastery;
      masteryCount++;

      if (pMastery >= DEFAULT_MASTERY_THRESHOLD) {
        skillsMastered++;
      }
    }
  }

  // Extract retention and due reviews from memory states
  for (const state of memoryStates) {
    const elapsedMs = timestamp - state.lastReview;
    const elapsedDays = Math.max(0, elapsedMs / MS_PER_DAY);

    // Compute retention using FSRS formula
    const retention = calculateRetention(state.stability, elapsedDays);
    retentionBySkill[state.skillId] = retention;
    totalRetention += retention;
    retentionCount++;

    // Compute overdue status
    const overdueDays = (timestamp - state.nextReview) / MS_PER_DAY;

    nextReviews.push({
      skillId: state.skillId,
      dueAt: state.nextReview,
      overdueDays: overdueDays,
    });

    if (timestamp >= state.nextReview) {
      skillsDue++;
    }
  }

  // Sort by most overdue first
  nextReviews.sort((a, b) => b.overdueDays - a.overdueDays);

  // Compute averages
  const averageMastery = masteryCount > 0 ? totalMastery / masteryCount : 0;
  const averageRetention = retentionCount > 0 ? totalRetention / retentionCount : 0;

  // Count practice events from event log
  const eventLog = engine.getEventLog();
  const totalPracticeEvents = eventLog.filter(
    e => e.type === 'practice' && e.learnerId === learnerId
  ).length;

  // Estimate events to full mastery (PROXY calculation)
  // Using BKT model: events needed ≈ log(1-threshold) / log(1-pLearn)
  // This gives expected events for one skill to reach threshold from 0
  const eventsPerSkill = Math.ceil(
    Math.log(1 - DEFAULT_MASTERY_THRESHOLD) / Math.log(1 - DEFAULT_P_LEARN)
  );
  const unmasteredSkills = Math.max(0, masteryCount - skillsMastered);
  const estimatedEventsToFullMastery = unmasteredSkills * eventsPerSkill;

  return {
    learnerId,
    timestamp,
    masteryBySkill,
    retentionBySkill,
    nextReviews,
    averageMastery,
    averageRetention,
    skillsMastered,
    skillsDue,
    totalPracticeEvents,
    estimatedEventsToFullMastery,
  };
}
