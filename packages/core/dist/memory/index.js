/**
 * Memory Scheduler Module
 *
 * Provides FSRS-style spaced repetition scheduling.
 */
export { FSRSScheduler, createFSRSScheduler, DEFAULT_FSRS_PARAMS, } from './FSRSScheduler.js';
/**
 * Calculate retention probability using FSRS formula
 * This is a pure function that can be used independently
 *
 * R(t) = (1 + t/(9*S))^(-1)
 */
export function calculateRetention(stability, elapsedDays) {
    if (elapsedDays <= 0)
        return 1.0;
    if (stability <= 0)
        return 0.0;
    return Math.pow(1 + elapsedDays / (9 * stability), -1);
}
/**
 * Calculate next interval using FSRS formula
 *
 * interval = S * 9 * (1/R - 1)
 */
export function calculateNextInterval(stability, requestedRetention = 0.9) {
    if (requestedRetention <= 0 || requestedRetention >= 1) {
        return stability;
    }
    return stability * 9 * (1 / requestedRetention - 1);
}
//# sourceMappingURL=index.js.map