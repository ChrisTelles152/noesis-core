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
/**
 * Elo configuration knobs. Defaults match noesis-math.
 */
export interface EloCalibratorConfig {
    /** Starting rating for unseen learners and items (default: 1200) */
    defaultRating: number;
    /** K-factor for learner rating updates (default: 32, standard chess) */
    kLearner: number;
    /** K-factor for item rating updates (default: 16 — items adjust slower) */
    kItem: number;
    /** Floor (default: 100) */
    minRating: number;
    /** Ceiling (default: 3000) */
    maxRating: number;
}
export declare const DEFAULT_ELO_CONFIG: EloCalibratorConfig;
/**
 * Outcome of recording an answer — both updated ratings plus the prior
 * expectation (useful for telemetry / replay-equivalence checks).
 */
export interface EloUpdateResult {
    learnerRating: number;
    itemRating: number;
    /** Prior P(correct) before the update, in [0, 1] */
    expectedP: number;
}
/**
 * Pure Elo expected-probability calculation.
 *
 *   P(correct) = 1 / (1 + 10^((itemRating - learnerRating) / 400))
 *
 * Standard chess Elo formula. The 400 constant means a 400-point gap
 * corresponds to a 10x odds advantage.
 */
export declare function expectedProbability(learnerRating: number, itemRating: number): number;
/**
 * Pure rating-update function. Caller passes current ratings; receives new ones
 * clamped to [min, max].
 */
export declare function updateRatings(learnerRating: number, itemRating: number, correct: boolean, config?: EloCalibratorConfig): {
    learnerRating: number;
    itemRating: number;
};
/**
 * Stateful calibrator. One instance per learner; tracks ratings across all
 * skills and items the learner has interacted with.
 */
export declare class EloDifficultyCalibrator {
    private readonly config;
    private readonly learnerRatings;
    private readonly itemRatings;
    constructor(config?: Partial<EloCalibratorConfig>);
    /** Get a learner's rating for a skill (returns default if unseen). */
    getLearnerRating(skillId: string): number;
    /** Get an item's difficulty rating (returns default if unseen). */
    getItemRating(itemId: string): number;
    /**
     * Record an answer. Updates both learner-skill and item ratings; returns
     * new ratings + prior expected probability.
     */
    recordAnswer(skillId: string, itemId: string, correct: boolean): EloUpdateResult;
    /**
     * Pick the item closest to learner ability (~50% expected success rate)
     * from a candidate list.
     *
     * Determinism: ties are broken by lexicographic item ID, so identical
     * inputs always yield identical outputs across runs.
     *
     * @returns the chosen item ID, or null if `candidateItemIds` is empty.
     */
    selectBestItem(skillId: string, candidateItemIds: readonly string[]): string | null;
    /**
     * Snapshot of all (skill, rating) pairs for a learner — defensive copy.
     */
    getAllLearnerRatings(): Map<string, number>;
    /**
     * Snapshot of all (itemId, rating) pairs — defensive copy.
     */
    getAllItemRatings(): Map<string, number>;
    /**
     * Serialize state for persistence / replay.
     */
    serialize(): string;
    /**
     * Restore state from a serialize() output. Throws on malformed input.
     */
    static deserialize(data: string): EloDifficultyCalibrator;
}
/** Factory function. */
export declare function createEloDifficultyCalibrator(config?: Partial<EloCalibratorConfig>): EloDifficultyCalibrator;
//# sourceMappingURL=EloDifficultyCalibrator.d.ts.map