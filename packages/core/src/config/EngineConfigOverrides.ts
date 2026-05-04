/**
 * EngineConfigOverrides
 *
 * Per-pack tuning surface for the Noesis Core engine. Subject content packs
 * (e.g., @noesis-content/math-br, @noesis-content/eng) supply this object
 * to override engine defaults without touching engine code.
 *
 * Three categories of override:
 *   1. Global parameter overrides (BKT defaults, FSRS, session)
 *   2. Per-channel parameter overrides (BKT priors per assessment channel,
 *      response-time thresholds per channel)
 *   3. Behavioral toggles (consumed by upcoming layered mastery, budgeted
 *      planner, fatigue, calibrator modules — fields are stubbed here and
 *      filled in as those modules land in 0.3.0)
 *
 * DETERMINISM: this is a pure data type. All fields are optional. Callers
 * supply only the values they want to override; everything else falls back
 * to engine defaults.
 *
 * VALIDATION: use validateEngineConfigOverrides() to surface bad values
 * eagerly at pack-load time rather than at first practice event.
 */

import type { BKTParams } from '../learner/BKTEngine.js';
import type { FSRSParams } from '../memory/FSRSScheduler.js';
import type { SessionConfig } from '../constitution.js';
import { validateBKTParams } from '../learner/BKTEngine.js';

/**
 * Channel identifier — a string ID for an assessment channel
 * (e.g., "recog_mc", "cloze", "prod_typed", "typed_answer", "multiple_choice").
 *
 * Core does NOT enforce a fixed channel set. Packs declare their own channels
 * and the engine treats them as opaque keys.
 */
export type Channel = string;

/**
 * Per-channel BKT configuration.
 * Keyed by channel ID; each value is a full or partial BKTParams override.
 */
export type ChannelBKTOverrides = Record<Channel, Partial<BKTParams>>;

/**
 * Per-channel response-time threshold (milliseconds).
 * Used by FSRS rating heuristics to discount slow-but-correct answers.
 */
export type ChannelResponseTimeOverrides = Record<Channel, number>;

/**
 * Pack-supplied engine configuration overrides.
 *
 * All fields are optional. Unspecified values fall back to engine defaults
 * (DEFAULT_BKT_PARAMS, DEFAULT_FSRS_PARAMS, DEFAULT_SESSION_CONFIG).
 */
export interface EngineConfigOverrides {
  /**
   * Global BKT parameter overrides (applied as the default channel's params
   * when no per-channel override is supplied).
   */
  bktDefaults?: Partial<BKTParams>;

  /**
   * Per-channel BKT parameter overrides. Channel IDs are pack-defined.
   *
   * Example (English vertical):
   *   { recog_mc: { pInit: 0.12, pGuess: 0.25 },
   *     cloze:    { pInit: 0.10, pGuess: 0.15 },
   *     prod_typed: { pInit: 0.08, pGuess: 0.08 } }
   */
  bktChannels?: ChannelBKTOverrides;

  /**
   * FSRS parameter overrides (applied globally).
   */
  fsrs?: Partial<FSRSParams>;

  /**
   * Session configuration overrides.
   *
   * Example: target 18 items per session for the English pack;
   * 20 for the math pack.
   */
  session?: Partial<SessionConfig>;

  /**
   * Per-channel response-time thresholds in milliseconds.
   * Used to compute the "easy" FSRS rating bonus and to flag slow answers.
   *
   * Example (English vertical):
   *   { recog_mc: 4500, cloze: 7000, prod_typed: 9000 }
   */
  responseTimeThresholdsMs?: ChannelResponseTimeOverrides;

  /**
   * Reserved for upcoming H-1 modules. These fields are declared but unused
   * until the corresponding modules land:
   *   - layeredMastery: tunable Learned/Mastered thresholds (H-1.C.2)
   *   - budgetedPlanner: review/error/new allocation, backlog control,
   *     skill-introduction caps (H-1.D.1)
   *   - fatigue: window size, latency/accuracy thresholds, session cap (H-1.B.1)
   *   - calibrator: Elo K-factors, default rating, bounds (H-1.B.2)
   *
   * Adding them here as `unknown` lets pack manifests carry forward-compatible
   * overrides today; the modules will type-narrow them on consumption.
   */
  layeredMastery?: unknown;
  budgetedPlanner?: unknown;
  fatigue?: unknown;
  calibrator?: unknown;
}

/**
 * Validation error from validateEngineConfigOverrides().
 */
export interface EngineConfigValidationError {
  /** Dot-path to the invalid field (e.g., "bktChannels.cloze.pSlip") */
  path: string;
  /** Human-readable explanation */
  message: string;
}

/**
 * Validate an EngineConfigOverrides object.
 *
 * Returns a list of errors (empty if valid). Does NOT throw — caller decides
 * whether to throw, log, or surface the errors to the user.
 */
export function validateEngineConfigOverrides(
  overrides: EngineConfigOverrides
): EngineConfigValidationError[] {
  const errors: EngineConfigValidationError[] = [];

  if (overrides.bktDefaults) {
    const merged = mergeBKTDefaults(overrides.bktDefaults);
    try {
      validateBKTParams(merged);
    } catch (e) {
      errors.push({
        path: 'bktDefaults',
        message: (e as Error).message,
      });
    }
  }

  if (overrides.bktChannels) {
    for (const [channelId, channelParams] of Object.entries(overrides.bktChannels)) {
      const merged = mergeBKTDefaults(channelParams);
      try {
        validateBKTParams(merged);
      } catch (e) {
        errors.push({
          path: `bktChannels.${channelId}`,
          message: (e as Error).message,
        });
      }
    }
  }

  if (overrides.fsrs) {
    if (
      overrides.fsrs.requestedRetention !== undefined &&
      (overrides.fsrs.requestedRetention <= 0 || overrides.fsrs.requestedRetention >= 1)
    ) {
      errors.push({
        path: 'fsrs.requestedRetention',
        message: `must be strictly between 0 and 1, got ${overrides.fsrs.requestedRetention}`,
      });
    }
    if (overrides.fsrs.maxInterval !== undefined && overrides.fsrs.maxInterval <= 0) {
      errors.push({
        path: 'fsrs.maxInterval',
        message: `must be positive, got ${overrides.fsrs.maxInterval}`,
      });
    }
    if (
      overrides.fsrs.initialDifficulty !== undefined &&
      (overrides.fsrs.initialDifficulty < 0 || overrides.fsrs.initialDifficulty > 1)
    ) {
      errors.push({
        path: 'fsrs.initialDifficulty',
        message: `must be between 0 and 1, got ${overrides.fsrs.initialDifficulty}`,
      });
    }
  }

  if (overrides.session) {
    if (
      overrides.session.masteryThreshold !== undefined &&
      (overrides.session.masteryThreshold < 0 || overrides.session.masteryThreshold > 1)
    ) {
      errors.push({
        path: 'session.masteryThreshold',
        message: `must be between 0 and 1, got ${overrides.session.masteryThreshold}`,
      });
    }
    if (overrides.session.targetItems !== undefined && overrides.session.targetItems <= 0) {
      errors.push({
        path: 'session.targetItems',
        message: `must be positive, got ${overrides.session.targetItems}`,
      });
    }
    if (
      overrides.session.maxDurationMinutes !== undefined &&
      overrides.session.maxDurationMinutes <= 0
    ) {
      errors.push({
        path: 'session.maxDurationMinutes',
        message: `must be positive, got ${overrides.session.maxDurationMinutes}`,
      });
    }
  }

  if (overrides.responseTimeThresholdsMs) {
    for (const [channelId, ms] of Object.entries(overrides.responseTimeThresholdsMs)) {
      if (!Number.isFinite(ms) || ms <= 0) {
        errors.push({
          path: `responseTimeThresholdsMs.${channelId}`,
          message: `must be a positive finite number, got ${ms}`,
        });
      }
    }
  }

  return errors;
}

/**
 * Throwing variant of validateEngineConfigOverrides — convenient for pack
 * loaders that prefer fail-fast behavior.
 */
export function assertValidEngineConfigOverrides(overrides: EngineConfigOverrides): void {
  const errors = validateEngineConfigOverrides(overrides);
  if (errors.length > 0) {
    const summary = errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
    throw new Error(`EngineConfigOverrides validation failed:\n${summary}`);
  }
}

/**
 * Merge a partial BKTParams over a synthetic baseline that satisfies
 * validateBKTParams() — used internally to validate partial overrides
 * without requiring the caller to supply all four params.
 */
function mergeBKTDefaults(partial: Partial<BKTParams>): BKTParams {
  return {
    pInit: partial.pInit ?? 0.3,
    pLearn: partial.pLearn ?? 0.1,
    pSlip: partial.pSlip ?? 0.1,
    pGuess: partial.pGuess ?? 0.2,
  };
}
