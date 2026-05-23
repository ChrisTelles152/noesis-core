/**
 * EloDifficultyCalibrator — pure Elo-based item-difficulty + learner-ability
 * estimation
 *
 * Each (learner, skill) pair carries an Elo rating that goes up on correct
 * answers and down on incorrect ones. Each item carries a difficulty rating
 * that moves in the opposite direction (item gets "easier" when learners
 * keep getting it right; "harder" when they slip).
 *
 * Used by the planner to select items at the optimal difficulty: closest to
 * learner ability gives ~50% expected success, which is the empirical sweet
 * spot for learning velocity.
 *
 * Ported from noesis-math/managua/src/lib/noesis/difficultyCalibrator.ts.
 *
 * KEY DIFFERENCES FROM SOURCE:
 *   - Defaults exposed via DEFAULT_ELO_CONFIG and overridable via
 *     EloCalibratorConfig (the math source hardcoded the constants).
 *   - serialize() / deserialize() for replay + persistence (math source
 *     was in-memory only).
 *   - selectBestItem() handles ties deterministically by item ID (math
 *     source returned the first occurrence, which depends on iteration
 *     order — not deterministic across array sources).
 */
export const DEFAULT_ELO_CONFIG = {
    defaultRating: 1200,
    kLearner: 32,
    kItem: 16,
    minRating: 100,
    maxRating: 3000,
};
/**
 * Pure Elo expected-probability calculation.
 *
 *   P(correct) = 1 / (1 + 10^((itemRating - learnerRating) / 400))
 *
 * Standard chess Elo formula. The 400 constant means a 400-point gap
 * corresponds to a 10x odds advantage.
 */
export function expectedProbability(learnerRating, itemRating) {
    return 1 / (1 + Math.pow(10, (itemRating - learnerRating) / 400));
}
/**
 * Pure rating-update function. Caller passes current ratings; receives new ones
 * clamped to [min, max].
 */
export function updateRatings(learnerRating, itemRating, correct, config = DEFAULT_ELO_CONFIG) {
    const expected = expectedProbability(learnerRating, itemRating);
    const actual = correct ? 1 : 0;
    const newLearnerRating = learnerRating + config.kLearner * (actual - expected);
    const newItemRating = itemRating + config.kItem * (expected - actual);
    return {
        learnerRating: clamp(newLearnerRating, config.minRating, config.maxRating),
        itemRating: clamp(newItemRating, config.minRating, config.maxRating),
    };
}
/**
 * Stateful calibrator. One instance per learner; tracks ratings across all
 * skills and items the learner has interacted with.
 */
export class EloDifficultyCalibrator {
    config;
    learnerRatings = new Map();
    itemRatings = new Map();
    constructor(config = {}) {
        this.config = { ...DEFAULT_ELO_CONFIG, ...config };
    }
    /** Get a learner's rating for a skill (returns default if unseen). */
    getLearnerRating(skillId) {
        return this.learnerRatings.get(skillId) ?? this.config.defaultRating;
    }
    /** Get an item's difficulty rating (returns default if unseen). */
    getItemRating(itemId) {
        return this.itemRatings.get(itemId) ?? this.config.defaultRating;
    }
    /**
     * Record an answer. Updates both learner-skill and item ratings; returns
     * new ratings + prior expected probability.
     */
    recordAnswer(skillId, itemId, correct) {
        const currentLearner = this.getLearnerRating(skillId);
        const currentItem = this.getItemRating(itemId);
        const expectedP = expectedProbability(currentLearner, currentItem);
        const updated = updateRatings(currentLearner, currentItem, correct, this.config);
        this.learnerRatings.set(skillId, updated.learnerRating);
        this.itemRatings.set(itemId, updated.itemRating);
        return { ...updated, expectedP };
    }
    /**
     * Pick the item closest to learner ability (~50% expected success rate)
     * from a candidate list.
     *
     * Determinism: ties are broken by lexicographic item ID, so identical
     * inputs always yield identical outputs across runs.
     *
     * @returns the chosen item ID, or null if `candidateItemIds` is empty.
     */
    selectBestItem(skillId, candidateItemIds) {
        if (candidateItemIds.length === 0)
            return null;
        const learnerRating = this.getLearnerRating(skillId);
        let bestItem = candidateItemIds[0];
        let bestDiff = Math.abs(this.getItemRating(bestItem) - learnerRating);
        for (let i = 1; i < candidateItemIds.length; i++) {
            const itemId = candidateItemIds[i];
            const diff = Math.abs(this.getItemRating(itemId) - learnerRating);
            if (diff < bestDiff || (diff === bestDiff && itemId < bestItem)) {
                bestDiff = diff;
                bestItem = itemId;
            }
        }
        return bestItem;
    }
    /**
     * Snapshot of all (skill, rating) pairs for a learner — defensive copy.
     */
    getAllLearnerRatings() {
        return new Map(this.learnerRatings);
    }
    /**
     * Snapshot of all (itemId, rating) pairs — defensive copy.
     */
    getAllItemRatings() {
        return new Map(this.itemRatings);
    }
    /**
     * Serialize state for persistence / replay.
     */
    serialize() {
        return JSON.stringify({
            config: this.config,
            learnerRatings: Array.from(this.learnerRatings.entries()),
            itemRatings: Array.from(this.itemRatings.entries()),
        });
    }
    /**
     * Restore state from a serialize() output. Throws on malformed input.
     */
    static deserialize(data) {
        const parsed = JSON.parse(data);
        const c = new EloDifficultyCalibrator(parsed.config ?? {});
        for (const [skill, rating] of parsed.learnerRatings) {
            c.learnerRatings.set(skill, rating);
        }
        for (const [item, rating] of parsed.itemRatings) {
            c.itemRatings.set(item, rating);
        }
        return c;
    }
}
/** Factory function. */
export function createEloDifficultyCalibrator(config = {}) {
    return new EloDifficultyCalibrator(config);
}
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
//# sourceMappingURL=EloDifficultyCalibrator.js.map