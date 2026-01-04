/**
 * Memory Scheduler Module
 *
 * Provides FSRS-style spaced repetition scheduling.
 */

export type {
  MemoryState,
  MemoryScheduler,
} from '../constitution';

export {
  FSRSScheduler,
  createFSRSScheduler,
  DEFAULT_FSRS_PARAMS,
  type FSRSParams,
  type MemoryStatistics,
} from './FSRSScheduler';

export type { ClockFn } from '../events';

/**
 * Calculate retention probability using FSRS formula
 * This is a pure function that can be used independently
 *
 * R(t) = (1 + t/(9*S))^(-1)
 */
export function calculateRetention(
  stability: number,
  elapsedDays: number
): number {
  if (elapsedDays <= 0) return 1.0;
  if (stability <= 0) return 0.0;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

/**
 * Calculate next interval using FSRS formula
 *
 * interval = S * 9 * (1/R - 1)
 */
export function calculateNextInterval(
  stability: number,
  requestedRetention: number = 0.9
): number {
  if (requestedRetention <= 0 || requestedRetention >= 1) {
    return stability;
  }
  return stability * 9 * (1 / requestedRetention - 1);
}
