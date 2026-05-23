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
import { validateBKTParams } from '../learner/BKTEngine.js';
/**
 * Validate an EngineConfigOverrides object.
 *
 * Returns a list of errors (empty if valid). Does NOT throw — caller decides
 * whether to throw, log, or surface the errors to the user.
 */
export function validateEngineConfigOverrides(overrides) {
    const errors = [];
    if (overrides.bktDefaults) {
        const merged = mergeBKTDefaults(overrides.bktDefaults);
        try {
            validateBKTParams(merged);
        }
        catch (e) {
            errors.push({
                path: 'bktDefaults',
                message: e.message,
            });
        }
    }
    if (overrides.bktChannels) {
        for (const [channelId, channelParams] of Object.entries(overrides.bktChannels)) {
            const merged = mergeBKTDefaults(channelParams);
            try {
                validateBKTParams(merged);
            }
            catch (e) {
                errors.push({
                    path: `bktChannels.${channelId}`,
                    message: e.message,
                });
            }
        }
    }
    if (overrides.fsrs) {
        if (overrides.fsrs.requestedRetention !== undefined &&
            (overrides.fsrs.requestedRetention <= 0 || overrides.fsrs.requestedRetention >= 1)) {
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
        if (overrides.fsrs.initialDifficulty !== undefined &&
            (overrides.fsrs.initialDifficulty < 0 || overrides.fsrs.initialDifficulty > 1)) {
            errors.push({
                path: 'fsrs.initialDifficulty',
                message: `must be between 0 and 1, got ${overrides.fsrs.initialDifficulty}`,
            });
        }
    }
    if (overrides.session) {
        if (overrides.session.masteryThreshold !== undefined &&
            (overrides.session.masteryThreshold < 0 || overrides.session.masteryThreshold > 1)) {
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
        if (overrides.session.maxDurationMinutes !== undefined &&
            overrides.session.maxDurationMinutes <= 0) {
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
    if (overrides.layeredMastery) {
        const lm = overrides.layeredMastery;
        if (lm.learned?.pMasteryThreshold !== undefined) {
            const v = lm.learned.pMasteryThreshold;
            if (v < 0 || v > 1) {
                errors.push({
                    path: 'layeredMastery.learned.pMasteryThreshold',
                    message: `must be between 0 and 1, got ${v}`,
                });
            }
        }
        if (lm.learned?.minAttempts !== undefined && lm.learned.minAttempts < 0) {
            errors.push({
                path: 'layeredMastery.learned.minAttempts',
                message: `must be >= 0, got ${lm.learned.minAttempts}`,
            });
        }
        if (lm.mastered?.pMasteryThreshold !== undefined) {
            const v = lm.mastered.pMasteryThreshold;
            if (v < 0 || v > 1) {
                errors.push({
                    path: 'layeredMastery.mastered.pMasteryThreshold',
                    message: `must be between 0 and 1, got ${v}`,
                });
            }
        }
        if (lm.mastered?.coolingOffHours !== undefined && lm.mastered.coolingOffHours < 0) {
            errors.push({
                path: 'layeredMastery.mastered.coolingOffHours',
                message: `must be >= 0, got ${lm.mastered.coolingOffHours}`,
            });
        }
    }
    if (overrides.budgetedPlanner) {
        const bp = overrides.budgetedPlanner;
        if (bp.defaultBudget !== undefined && bp.defaultBudget <= 0) {
            errors.push({
                path: 'budgetedPlanner.defaultBudget',
                message: `must be positive, got ${bp.defaultBudget}`,
            });
        }
        if (bp.minBudget !== undefined && bp.maxBudget !== undefined && bp.minBudget > bp.maxBudget) {
            errors.push({
                path: 'budgetedPlanner',
                message: `minBudget (${bp.minBudget}) must be <= maxBudget (${bp.maxBudget})`,
            });
        }
    }
    if (overrides.fatigue) {
        const f = overrides.fatigue;
        if (f.windowSize !== undefined && f.windowSize <= 0) {
            errors.push({
                path: 'fatigue.windowSize',
                message: `must be positive, got ${f.windowSize}`,
            });
        }
        if (f.sessionCapMs !== undefined && f.sessionCapMs <= 0) {
            errors.push({
                path: 'fatigue.sessionCapMs',
                message: `must be positive, got ${f.sessionCapMs}`,
            });
        }
    }
    if (overrides.calibrator) {
        const c = overrides.calibrator;
        if (c.minRating !== undefined && c.maxRating !== undefined && c.minRating > c.maxRating) {
            errors.push({
                path: 'calibrator',
                message: `minRating (${c.minRating}) must be <= maxRating (${c.maxRating})`,
            });
        }
        if (c.kLearner !== undefined && c.kLearner < 0) {
            errors.push({
                path: 'calibrator.kLearner',
                message: `must be >= 0, got ${c.kLearner}`,
            });
        }
    }
    if (overrides.drillingDiscount) {
        const d = overrides.drillingDiscount;
        if (d.attemptsBeforeDiscount < 0) {
            errors.push({
                path: 'drillingDiscount.attemptsBeforeDiscount',
                message: `must be >= 0, got ${d.attemptsBeforeDiscount}`,
            });
        }
        if (d.multiplier < 0 || d.multiplier > 1) {
            errors.push({
                path: 'drillingDiscount.multiplier',
                message: `must be between 0 and 1, got ${d.multiplier}`,
            });
        }
    }
    return errors;
}
/**
 * Throwing variant of validateEngineConfigOverrides — convenient for pack
 * loaders that prefer fail-fast behavior.
 */
export function assertValidEngineConfigOverrides(overrides) {
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
function mergeBKTDefaults(partial) {
    return {
        pInit: partial.pInit ?? 0.3,
        pLearn: partial.pLearn ?? 0.1,
        pSlip: partial.pSlip ?? 0.1,
        pGuess: partial.pGuess ?? 0.2,
    };
}
//# sourceMappingURL=EngineConfigOverrides.js.map