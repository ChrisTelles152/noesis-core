/**
 * Memory Scheduler Module
 *
 * Provides FSRS-style spaced repetition scheduling.
 */
export type { MemoryState, MemoryScheduler, } from '../constitution';
export { FSRSScheduler, createFSRSScheduler, DEFAULT_FSRS_PARAMS, type FSRSParams, type MemoryStatistics, } from './FSRSScheduler';
export type { ClockFn } from '../events';
/**
 * Calculate retention probability using FSRS formula
 * This is a pure function that can be used independently
 *
 * R(t) = (1 + t/(9*S))^(-1)
 */
export declare function calculateRetention(stability: number, elapsedDays: number): number;
/**
 * Calculate next interval using FSRS formula
 *
 * interval = S * 9 * (1/R - 1)
 */
export declare function calculateNextInterval(stability: number, requestedRetention?: number): number;
//# sourceMappingURL=index.d.ts.map