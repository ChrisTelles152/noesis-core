/**
 * Learner Metrics Module
 *
 * Provides human-readable, sellable metrics for learner progress.
 * Uses only public engine methods to extract proof of learning.
 */
import type { NoesisCoreEngineImpl } from './NoesisCoreEngineImpl.js';
import type { LayeredMasteryModel, MasteryLayer, PackMasterySummary } from '../mastery/index.js';
import type { ChannelSkillProbability } from '../learner/MultiChannelBKTEngine.js';
import type { FatigueDetector, FatigueSignal } from '../fatigue/index.js';
import type { EloDifficultyCalibrator } from '../calibration/index.js';
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
    /**
     * Layered mastery classification (Unstarted/Learning/Learned/Mastered) per
     * skill. Present only when LearnerMetricsOptions.layeredMastery is supplied.
     * Added in 0.3.0.
     */
    layeredMastery?: Record<string, MasteryLayer>;
    /**
     * Per-pack mastery summary (skillsLearned/skillsMastered/etc.). Present only
     * when LearnerMetricsOptions.layeredMastery is supplied. Added in 0.3.0.
     */
    layeredMasterySummary?: PackMasterySummary;
    /**
     * Fatigue signal at metrics-computation time. Present only when
     * LearnerMetricsOptions.fatigue is supplied. Added in 0.3.0.
     */
    fatigue?: {
        signal: FatigueSignal;
        sessionDurationMs: number;
        attemptCount: number;
    };
    /**
     * Difficulty calibration ratings. Present only when
     * LearnerMetricsOptions.difficulty is supplied. Added in 0.3.0.
     */
    difficulty?: {
        learnerRatings: Record<string, number>;
        itemRatings: Record<string, number>;
    };
}
/**
 * Optional helpers for expanding LearnerMetrics with the 0.3.0 fields.
 *
 * All fields are optional; supplying any one of them adds the corresponding
 * section to the returned LearnerMetrics. Missing helpers leave the
 * corresponding output fields undefined.
 */
export interface LearnerMetricsOptions {
    /**
     * Wire layered mastery: pass the model + the per-skill ChannelSkillProbability
     * arrays (typically produced by walking MultiChannelBKTEngine.getAllStates()).
     */
    layeredMastery?: {
        model: LayeredMasteryModel;
        states: Map<string, ChannelSkillProbability[]>;
    };
    /** Wire fatigue signal: pass the per-session FatigueDetector. */
    fatigue?: FatigueDetector;
    /** Wire difficulty ratings: pass the per-learner EloDifficultyCalibrator. */
    difficulty?: EloDifficultyCalibrator;
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
export declare function getLearnerMetrics(engine: NoesisCoreEngineImpl, learnerId: string, atTime?: number, options?: LearnerMetricsOptions): LearnerMetrics;
//# sourceMappingURL=metrics.d.ts.map