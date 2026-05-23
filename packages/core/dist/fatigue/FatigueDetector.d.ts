/**
 * FatigueDetector — break detection for learning sessions
 *
 * Monitors response latency and accuracy in a rolling window to detect when
 * a learner is losing focus. Two trigger paths:
 *   1. Dual-threshold: recent-window latency rise AND accuracy drop vs baseline.
 *   2. Hard session cap (configurable; defaults to 15 minutes wall clock).
 *
 * Ported from noesis-math/athens/src/lib/noesis/fatigueDetector.ts.
 *
 * KEY DIFFERENCE FROM SOURCE: clock is injected (no direct Date.now()), so
 * fatigue decisions are replayable. This makes the detector deterministic
 * for replay — same event log + same clock → same fatigue signal sequence.
 */
import { type ClockFn } from '../events/index.js';
/**
 * Tunable parameters. Defaults match the converged values used by
 * noesis-math today.
 */
export interface FatigueConfig {
    /** Rolling window size for recent / baseline comparison (default: 10) */
    windowSize: number;
    /** Fractional latency increase to trigger (default: 0.20 = +20%) */
    latencyIncreaseThreshold: number;
    /** Fractional accuracy decrease to trigger (default: 0.10 = -10%) */
    accuracyDecreaseThreshold: number;
    /** Hard session cap, milliseconds (default: 15 * 60 * 1000 = 15 min) */
    sessionCapMs: number;
    /** Min items recorded before dual-threshold detection runs (default: 6) */
    minSamplesForDetection: number;
}
export declare const DEFAULT_FATIGUE_CONFIG: FatigueConfig;
/**
 * Output signal.
 */
export type FatigueSignal = 'none' | 'break_suggested' | 'session_cap_reached';
interface AttemptRecord {
    responseTimeMs: number;
    correct: boolean;
    timestamp: number;
}
/**
 * Stateful fatigue detector. One instance per learner session.
 *
 * Determinism: all wall-clock reads route through the injected clock. Reset()
 * re-anchors session start to the current clock value.
 */
export declare class FatigueDetector {
    private readonly config;
    private readonly clock;
    private attempts;
    private sessionStartTime;
    constructor(config: Partial<FatigueConfig> | undefined, clock: ClockFn);
    /**
     * Record an attempt and check for fatigue. Returns the current signal.
     */
    recordAttempt(responseTimeMs: number, correct: boolean): FatigueSignal;
    /**
     * Compute the current fatigue signal without recording a new attempt.
     *
     * Hard session cap is checked first — once tripped it persists for the
     * remainder of the session (caller should call reset() after a break).
     */
    check(): FatigueSignal;
    /**
     * Wall-clock duration since session start.
     */
    getSessionDuration(): number;
    /** Number of attempts recorded so far. */
    getAttemptCount(): number;
    /**
     * Re-anchor session start to the current clock and clear all attempts.
     * Call after the learner takes a break.
     */
    reset(): void;
    /**
     * Snapshot of current attempt records (defensive copy) — used by
     * PlannerSnapshot / event sourcing for replay.
     */
    getAttemptRecords(): readonly AttemptRecord[];
}
/**
 * Factory function. Clock is required — no Date.now() default.
 */
export declare function createFatigueDetector(config: Partial<FatigueConfig> | undefined, clock: ClockFn): FatigueDetector;
export {};
//# sourceMappingURL=FatigueDetector.d.ts.map