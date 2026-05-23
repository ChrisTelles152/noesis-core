/**
 * FSRS Memory Scheduler Implementation
 *
 * Implements the Free Spaced Repetition Scheduler (FSRS) algorithm
 * for optimal memory retention scheduling.
 *
 * FSRS is a modern spaced repetition algorithm that uses:
 * - Stability (S): Expected number of days until retention drops to 90%
 * - Difficulty (D): How hard the item is to remember (0-10 scale, stored as 0-1)
 * - Retrievability (R): Current probability of successful recall
 *
 * Rating scale:
 * - 1 (Again): Complete failure, restart learning
 * - 2 (Hard): Significant difficulty, reduce interval
 * - 3 (Good): Correct with some effort, normal interval
 * - 4 (Easy): Effortless recall, increase interval
 *
 * DETERMINISM: All operations are pure and produce the same output
 * for the same input. Clock is injected for testability.
 */
import type { MemoryState, MemoryScheduler } from '../constitution.js';
import { type ClockFn } from '../events/index.js';
/**
 * FSRS algorithm parameters
 */
export interface FSRSParams {
    /** Initial stability values for ratings [Again, Hard, Good, Easy] */
    initialStability: [number, number, number, number];
    /** Decay factor for difficulty adjustment */
    difficultyDecay: number;
    /** Stability decay exponent */
    stabilityDecay: number;
    /** Factor for stability increase on successful recall */
    stabilityMultiplier: number;
    /** Target retention probability (default 0.9 = 90%) */
    requestedRetention: number;
    /** Maximum interval in days */
    maxInterval: number;
    /** Initial difficulty (0-1 scale) */
    initialDifficulty: number;
}
/**
 * Default FSRS parameters based on research
 */
export declare const DEFAULT_FSRS_PARAMS: FSRSParams;
/**
 * FSRS Memory Scheduler Implementation
 */
export declare class FSRSScheduler implements MemoryScheduler {
    private readonly params;
    private readonly clock;
    /**
     * @param params - Partial FSRS parameters; merged into {@link DEFAULT_FSRS_PARAMS}.
     * @param clock - Wall-clock function. **Required**: must be injected by the caller
     *               so replay determinism is preserved. Throws if not a function.
     */
    constructor(params: Partial<FSRSParams> | undefined, clock: ClockFn);
    /**
     * Create initial memory state for a skill
     */
    createState(skillId: string): MemoryState;
    /**
     * Schedule next review based on recall result
     *
     * @param state - Current memory state
     * @param recalled - Whether the item was recalled successfully
     * @param rating - Quality of recall (1=Again, 2=Hard, 3=Good, 4=Easy)
     * @returns Updated memory state with new scheduling
     */
    scheduleReview(state: MemoryState, recalled: boolean, rating: 1 | 2 | 3 | 4, learningSpeed?: number): MemoryState;
    /**
     * Get skills due for review at a given time
     *
     * @param states - All memory states
     * @param atTime - Time to check (defaults to now)
     * @returns Memory states that are due, sorted by overdue amount (most overdue first)
     */
    getDueSkills(states: MemoryState[], atTime: number): MemoryState[];
    /**
     * Calculate retention probability at a given time
     *
     * Uses the FSRS retention formula:
     * R(t) = (1 + t/(9*S))^(-1)
     *
     * Where:
     * - t = elapsed time in days since last review
     * - S = stability (days until 90% retention)
     */
    getRetention(state: MemoryState, atTime: number): number;
    /**
     * Calculate retention probability using FSRS formula
     *
     * R(t) = (1 + t/(9*S))^(-1)
     */
    private calculateRetention;
    /**
     * Calculate next interval using FSRS formula
     *
     * Given target retention R and stability S:
     * interval = S * 9 * (1/R - 1)
     *
     * Edge cases:
     * - R >= 1.0: Perfect retention requested, review immediately (interval = 0)
     * - R <= 0: Invalid, use stability as fallback
     */
    private calculateInterval;
    /**
     * Update difficulty based on rating
     *
     * Difficulty adjusts slowly based on performance:
     * - Hard (2) increases difficulty
     * - Easy (4) decreases difficulty
     * - Good (3) maintains difficulty
     * - Again (1) significantly increases difficulty
     */
    private updateDifficulty;
    /**
     * Update stability using FSRS formula
     *
     * For successful recalls:
     * S' = S * (1 + e^(w) * (11-D) * S^(-w) * (e^(w*(1-R)) - 1))
     *
     * Where:
     * - S = current stability
     * - D = difficulty (scaled 0-10)
     * - R = retrievability at review time
     * - w = stabilityDecay parameter
     */
    private updateStability;
    /**
     * Get rating modifier for stability calculation
     */
    private getRatingModifier;
    /**
     * Calculate days elapsed between two timestamps
     */
    private daysSince;
    /**
     * Serialize memory states for persistence
     */
    serializeStates(states: MemoryState[]): string;
    /**
     * Deserialize memory states from persistence
     */
    deserializeStates(data: string): MemoryState[];
    /**
     * Get statistics for a collection of memory states
     */
    getStatistics(states: MemoryState[], atTime: number): MemoryStatistics;
}
/**
 * Statistics about memory states
 */
export interface MemoryStatistics {
    totalItems: number;
    dueItems: number;
    averageRetention: number;
    itemsByState: {
        new: number;
        learning: number;
        review: number;
        relearning: number;
    };
}
/**
 * Factory function to create an FSRSScheduler.
 *
 * `clock` is required — see {@link requireClock} for the rationale.
 */
export declare function createFSRSScheduler(params: Partial<FSRSParams> | undefined, clock: ClockFn): FSRSScheduler;
//# sourceMappingURL=FSRSScheduler.d.ts.map