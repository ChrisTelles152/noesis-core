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

import { requireClock, type ClockFn } from '../events/index.js';

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

export const DEFAULT_FATIGUE_CONFIG: FatigueConfig = {
  windowSize: 10,
  latencyIncreaseThreshold: 0.2,
  accuracyDecreaseThreshold: 0.1,
  sessionCapMs: 15 * 60 * 1000,
  minSamplesForDetection: 6,
};

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
export class FatigueDetector {
  private readonly config: FatigueConfig;
  private readonly clock: ClockFn;
  private attempts: AttemptRecord[] = [];
  private sessionStartTime: number;

  constructor(config: Partial<FatigueConfig> = {}, clock: ClockFn) {
    this.config = { ...DEFAULT_FATIGUE_CONFIG, ...config };
    this.clock = requireClock(clock);
    this.sessionStartTime = this.clock();
  }

  /**
   * Record an attempt and check for fatigue. Returns the current signal.
   */
  recordAttempt(responseTimeMs: number, correct: boolean): FatigueSignal {
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
  check(): FatigueSignal {
    const elapsed = this.clock() - this.sessionStartTime;
    if (elapsed >= this.config.sessionCapMs) {
      return 'session_cap_reached';
    }

    if (this.attempts.length < this.config.minSamplesForDetection) {
      return 'none';
    }

    // Use the smaller of (configured window, half the recorded attempts) so
    // baseline and recent windows don't overlap when we're early in a session.
    const windowSize = Math.min(
      this.config.windowSize,
      Math.floor(this.attempts.length / 2)
    );
    const recent = this.attempts.slice(-windowSize);
    const baseline = this.attempts.slice(0, windowSize);

    if (baseline.length < 3) return 'none';

    const baselineLatency = average(baseline.map((a) => a.responseTimeMs));
    const baselineAccuracy =
      baseline.filter((a) => a.correct).length / baseline.length;
    const recentLatency = average(recent.map((a) => a.responseTimeMs));
    const recentAccuracy =
      recent.filter((a) => a.correct).length / recent.length;

    // Guard against zero baseline latency (would NaN the fractional increase)
    if (baselineLatency === 0) return 'none';

    const latencyIncrease = (recentLatency - baselineLatency) / baselineLatency;
    const accuracyDecrease = baselineAccuracy - recentAccuracy;

    if (
      latencyIncrease >= this.config.latencyIncreaseThreshold &&
      accuracyDecrease >= this.config.accuracyDecreaseThreshold
    ) {
      return 'break_suggested';
    }

    return 'none';
  }

  /**
   * Wall-clock duration since session start.
   */
  getSessionDuration(): number {
    return this.clock() - this.sessionStartTime;
  }

  /** Number of attempts recorded so far. */
  getAttemptCount(): number {
    return this.attempts.length;
  }

  /**
   * Re-anchor session start to the current clock and clear all attempts.
   * Call after the learner takes a break.
   */
  reset(): void {
    this.attempts = [];
    this.sessionStartTime = this.clock();
  }

  /**
   * Snapshot of current attempt records (defensive copy) — used by
   * PlannerSnapshot / event sourcing for replay.
   */
  getAttemptRecords(): readonly AttemptRecord[] {
    return [...this.attempts];
  }
}

/**
 * Factory function. Clock is required — no Date.now() default.
 */
export function createFatigueDetector(
  config: Partial<FatigueConfig> = {},
  clock: ClockFn
): FatigueDetector {
  return new FatigueDetector(config, clock);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
