/**
 * Memory Scheduler Module
 *
 * Provides FSRS-style spaced repetition scheduling.
 */

export type {
  MemoryState,
  MemoryScheduler,
} from '../constitution';

// TODO: Implement MemoryScheduler (FSRS algorithm)
// export { createMemoryScheduler } from './FSRSScheduler';

/**
 * Default FSRS parameters
 * These are based on the FSRS-4.5 research defaults
 */
export const DEFAULT_FSRS_PARAMS = {
  /** Initial stability for new cards */
  initialStability: [0.4, 0.6, 2.4, 5.8],
  /** Difficulty weight */
  difficultyWeight: 0.9,
  /** Stability decay */
  stabilityDecay: 0.2,
  /** Stability increase factor */
  stabilityIncrease: 1.0,
  /** Requested retention (target recall probability) */
  requestedRetention: 0.9,
};

/**
 * Calculate retention probability using FSRS formula
 * This is a pure function that can be used independently
 */
export function calculateRetention(
  stability: number,
  elapsedDays: number
): number {
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

/**
 * Calculate next interval using FSRS formula
 */
export function calculateNextInterval(
  stability: number,
  requestedRetention: number = 0.9
): number {
  return stability * 9 * (1 / requestedRetention - 1);
}

/**
 * Placeholder: Create a memory scheduler
 */
export function createMemoryScheduler(): import('../constitution').MemoryScheduler {
  throw new Error('Not implemented: createMemoryScheduler - see packages/core/src/memory for TODOs');
}
