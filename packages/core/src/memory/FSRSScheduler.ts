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
import type { ClockFn } from '../events/index.js';

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
export const DEFAULT_FSRS_PARAMS: FSRSParams = {
  initialStability: [0.4, 0.9, 2.3, 5.7],
  difficultyDecay: 0.7,
  stabilityDecay: 0.2,
  stabilityMultiplier: 1.9,
  requestedRetention: 0.9,
  maxInterval: 365,
  initialDifficulty: 0.5,
};

/**
 * Milliseconds per day for time calculations
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * FSRS Memory Scheduler Implementation
 */
export class FSRSScheduler implements MemoryScheduler {
  private readonly params: FSRSParams;
  private readonly clock: ClockFn;

  constructor(params: Partial<FSRSParams> = {}, clock: ClockFn = () => Date.now()) {
    this.params = { ...DEFAULT_FSRS_PARAMS, ...params };
    this.clock = clock;
  }

  /**
   * Create initial memory state for a skill
   */
  createState(skillId: string): MemoryState {
    const now = this.clock();
    return {
      skillId,
      stability: this.params.initialStability[2], // Good rating default
      difficulty: this.params.initialDifficulty,
      lastReview: now,
      nextReview: now, // Due immediately for new items
      successCount: 0,
      failureCount: 0,
      state: 'new',
    };
  }

  /**
   * Schedule next review based on recall result
   *
   * @param state - Current memory state
   * @param recalled - Whether the item was recalled successfully
   * @param rating - Quality of recall (1=Again, 2=Hard, 3=Good, 4=Easy)
   * @returns Updated memory state with new scheduling
   */
  scheduleReview(state: MemoryState, recalled: boolean, rating: 1 | 2 | 3 | 4): MemoryState {
    const now = this.clock();
    const elapsedDays = this.daysSince(state.lastReview, now);

    // Calculate new difficulty based on rating
    const newDifficulty = this.updateDifficulty(state.difficulty, rating);

    // Calculate new stability based on rating and current state
    let newStability: number;
    let newState: MemoryState['state'];

    if (rating === 1) {
      // Failed recall - enter relearning state
      newStability = this.params.initialStability[0];
      newState = state.state === 'new' ? 'learning' : 'relearning';
    } else if (state.state === 'new' || state.state === 'learning') {
      // First successful recall - use initial stability based on rating
      newStability = this.params.initialStability[rating - 1];
      newState = rating >= 3 ? 'review' : 'learning';
    } else {
      // Review mode - update stability based on FSRS formula
      // Note: rating cannot be 1 here since that case was handled above
      newStability = this.updateStability(state.stability, state.difficulty, elapsedDays, rating);
      newState = 'review';
    }

    // Calculate next review interval
    const intervalDays = this.calculateInterval(newStability, this.params.requestedRetention);

    // Clamp interval to maximum
    const clampedInterval = Math.min(intervalDays, this.params.maxInterval);

    // Calculate next review timestamp
    const nextReview = now + clampedInterval * MS_PER_DAY;

    return {
      skillId: state.skillId,
      stability: newStability,
      difficulty: newDifficulty,
      lastReview: now,
      nextReview,
      successCount: recalled ? state.successCount + 1 : state.successCount,
      failureCount: recalled ? state.failureCount : state.failureCount + 1,
      state: newState,
    };
  }

  /**
   * Get skills due for review at a given time
   *
   * @param states - All memory states
   * @param atTime - Time to check (defaults to now)
   * @returns Memory states that are due, sorted by overdue amount (most overdue first)
   */
  getDueSkills(states: MemoryState[], atTime: number): MemoryState[] {
    const due = states.filter((state) => state.nextReview <= atTime);

    // Sort by how overdue they are (most overdue first) for determinism
    return due.sort((a, b) => {
      const overdueA = atTime - a.nextReview;
      const overdueB = atTime - b.nextReview;
      if (overdueA !== overdueB) {
        return overdueB - overdueA;
      }
      // Tie-breaker: alphabetical by skillId for determinism
      return a.skillId.localeCompare(b.skillId);
    });
  }

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
  getRetention(state: MemoryState, atTime: number): number {
    const elapsedDays = this.daysSince(state.lastReview, atTime);
    return this.calculateRetention(state.stability, elapsedDays);
  }

  /**
   * Calculate retention probability using FSRS formula
   *
   * R(t) = (1 + t/(9*S))^(-1)
   */
  private calculateRetention(stability: number, elapsedDays: number): number {
    if (elapsedDays <= 0) return 1.0;
    if (stability <= 0) return 0.0;
    return Math.pow(1 + elapsedDays / (9 * stability), -1);
  }

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
  private calculateInterval(stability: number, requestedRetention: number): number {
    // Perfect retention (100%) means review immediately
    if (requestedRetention >= 1) {
      return 0;
    }
    // Invalid retention value, use stability as fallback
    if (requestedRetention <= 0) {
      return stability;
    }
    return stability * 9 * (1 / requestedRetention - 1);
  }

  /**
   * Update difficulty based on rating
   *
   * Difficulty adjusts slowly based on performance:
   * - Hard (2) increases difficulty
   * - Easy (4) decreases difficulty
   * - Good (3) maintains difficulty
   * - Again (1) significantly increases difficulty
   */
  private updateDifficulty(currentDifficulty: number, rating: 1 | 2 | 3 | 4): number {
    // Rating factor: 1=-2, 2=-1, 3=0, 4=1
    const ratingFactor = rating - 3;

    // Adjust difficulty (negative ratingFactor increases difficulty)
    const adjustment = -ratingFactor * 0.1 * this.params.difficultyDecay;
    const newDifficulty = currentDifficulty + adjustment;

    // Clamp to valid range
    return Math.max(0.1, Math.min(0.9, newDifficulty));
  }

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
  private updateStability(
    stability: number,
    difficulty: number,
    elapsedDays: number,
    rating: 1 | 2 | 3 | 4
  ): number {
    const retrievability = this.calculateRetention(stability, elapsedDays);
    const w = this.params.stabilityDecay;

    // Convert difficulty from 0-1 to 0-10 scale for formula
    const d = difficulty * 10;

    // Base stability increase factor
    const exp_w = Math.exp(w);
    const stabilityFactor = Math.pow(stability, -w);
    const retrievabilityFactor = Math.exp(w * (1 - retrievability)) - 1;

    // Calculate new stability
    let newStability = stability * (1 + exp_w * (11 - d) * stabilityFactor * retrievabilityFactor);

    // Apply rating modifier
    const ratingModifier = this.getRatingModifier(rating);
    newStability *= ratingModifier;

    // Ensure stability doesn't decrease below a minimum
    return Math.max(0.1, newStability);
  }

  /**
   * Get rating modifier for stability calculation
   */
  private getRatingModifier(rating: 1 | 2 | 3 | 4): number {
    switch (rating) {
      case 1:
        return 0.0; // Should not be called for rating 1
      case 2:
        return 0.8;
      case 3:
        return 1.0;
      case 4:
        return 1.3;
    }
  }

  /**
   * Calculate days elapsed between two timestamps
   */
  private daysSince(fromTime: number, toTime: number): number {
    return Math.max(0, (toTime - fromTime) / MS_PER_DAY);
  }

  /**
   * Serialize memory states for persistence
   */
  serializeStates(states: MemoryState[]): string {
    return JSON.stringify(states);
  }

  /**
   * Deserialize memory states from persistence
   */
  deserializeStates(data: string): MemoryState[] {
    return JSON.parse(data) as MemoryState[];
  }

  /**
   * Get statistics for a collection of memory states
   */
  getStatistics(states: MemoryState[], atTime: number): MemoryStatistics {
    const due = this.getDueSkills(states, atTime);
    const avgRetention =
      states.length > 0
        ? states.reduce((sum, s) => sum + this.getRetention(s, atTime), 0) / states.length
        : 0;

    const byState = {
      new: states.filter((s) => s.state === 'new').length,
      learning: states.filter((s) => s.state === 'learning').length,
      review: states.filter((s) => s.state === 'review').length,
      relearning: states.filter((s) => s.state === 'relearning').length,
    };

    return {
      totalItems: states.length,
      dueItems: due.length,
      averageRetention: avgRetention,
      itemsByState: byState,
    };
  }
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
 * Factory function to create an FSRSScheduler
 */
export function createFSRSScheduler(
  params: Partial<FSRSParams> = {},
  clock: ClockFn = () => Date.now()
): FSRSScheduler {
  return new FSRSScheduler(params, clock);
}
