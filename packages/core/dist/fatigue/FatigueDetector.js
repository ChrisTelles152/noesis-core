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
import { requireClock } from '../events/index.js';
export const DEFAULT_FATIGUE_CONFIG = {
    windowSize: 10,
    latencyIncreaseThreshold: 0.2,
    accuracyDecreaseThreshold: 0.1,
    sessionCapMs: 15 * 60 * 1000,
    minSamplesForDetection: 6,
};
/**
 * Stateful fatigue detector. One instance per learner session.
 *
 * Determinism: all wall-clock reads route through the injected clock. Reset()
 * re-anchors session start to the current clock value.
 */
export class FatigueDetector {
    config;
    clock;
    attempts = [];
    sessionStartTime;
    constructor(config = {}, clock) {
        this.config = { ...DEFAULT_FATIGUE_CONFIG, ...config };
        this.clock = requireClock(clock);
        this.sessionStartTime = this.clock();
    }
    /**
     * Record an attempt and check for fatigue. Returns the current signal.
     */
    recordAttempt(responseTimeMs, correct) {
        this.attempts.push({
            responseTimeMs,
            correct,
            timestamp: this.clock(),
        });
        return this.check();
    }
    /**
     * Compute the current fatigue signal without recording a new attempt.
     *
     * Hard session cap is checked first — once tripped it persists for the
     * remainder of the session (caller should call reset() after a break).
     */
    check() {
        const elapsed = this.clock() - this.sessionStartTime;
        if (elapsed >= this.config.sessionCapMs) {
            return 'session_cap_reached';
        }
        if (this.attempts.length < this.config.minSamplesForDetection) {
            return 'none';
        }
        // Use the smaller of (configured window, half the recorded attempts) so
        // baseline and recent windows don't overlap when we're early in a session.
        const windowSize = Math.min(this.config.windowSize, Math.floor(this.attempts.length / 2));
        const recent = this.attempts.slice(-windowSize);
        const baseline = this.attempts.slice(0, windowSize);
        if (baseline.length < 3)
            return 'none';
        const baselineLatency = average(baseline.map((a) => a.responseTimeMs));
        const baselineAccuracy = baseline.filter((a) => a.correct).length / baseline.length;
        const recentLatency = average(recent.map((a) => a.responseTimeMs));
        const recentAccuracy = recent.filter((a) => a.correct).length / recent.length;
        // Guard against zero baseline latency (would NaN the fractional increase)
        if (baselineLatency === 0)
            return 'none';
        const latencyIncrease = (recentLatency - baselineLatency) / baselineLatency;
        const accuracyDecrease = baselineAccuracy - recentAccuracy;
        if (latencyIncrease >= this.config.latencyIncreaseThreshold &&
            accuracyDecrease >= this.config.accuracyDecreaseThreshold) {
            return 'break_suggested';
        }
        return 'none';
    }
    /**
     * Wall-clock duration since session start.
     */
    getSessionDuration() {
        return this.clock() - this.sessionStartTime;
    }
    /** Number of attempts recorded so far. */
    getAttemptCount() {
        return this.attempts.length;
    }
    /**
     * Re-anchor session start to the current clock and clear all attempts.
     * Call after the learner takes a break.
     */
    reset() {
        this.attempts = [];
        this.sessionStartTime = this.clock();
    }
    /**
     * Snapshot of current attempt records (defensive copy) — used by
     * PlannerSnapshot / event sourcing for replay.
     */
    getAttemptRecords() {
        return [...this.attempts];
    }
}
/**
 * Factory function. Clock is required — no Date.now() default.
 */
export function createFatigueDetector(config = {}, clock) {
    return new FatigueDetector(config, clock);
}
function average(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
//# sourceMappingURL=FatigueDetector.js.map