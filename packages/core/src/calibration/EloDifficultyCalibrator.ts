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

export const DEFAULT_ELO_CONFIG: EloCalibratorConfig = {
  defaultRating: 1200,
  kLearner: 32,
  kItem: 16,
  minRating: 100,
  maxRating: 3000,
};

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
export function expectedProbability(learnerRating: number, itemRating: number): number {
  return 1 / (1 + Math.pow(10, (itemRating - learnerRating) / 400));
}

/**
 * Pure rating-update function. Caller passes current ratings; receives new ones
 * clamped to [min, max].
 */
export function updateRatings(
  learnerRating: number,
  itemRating: number,
  correct: boolean,
  config: EloCalibratorConfig = DEFAULT_ELO_CONFIG
): { learnerRating: number; itemRating: number } {
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
  private readonly config: EloCalibratorConfig;
  private readonly learnerRatings: Map<string, number> = new Map();
  private readonly itemRatings: Map<string, number> = new Map();

  constructor(config: Partial<EloCalibratorConfig> = {}) {
    this.config = { ...DEFAULT_ELO_CONFIG, ...config };
  }

  /** Get a learner's rating for a skill (returns default if unseen). */
  getLearnerRating(skillId: string): number {
    return this.learnerRatings.get(skillId) ?? this.config.defaultRating;
  }

  /** Get an item's difficulty rating (returns default if unseen). */
  getItemRating(itemId: string): number {
    return this.itemRatings.get(itemId) ?? this.config.defaultRating;
  }

  /**
   * Record an answer. Updates both learner-skill and item ratings; returns
   * new ratings + prior expected probability.
   */
  recordAnswer(skillId: string, itemId: string, correct: boolean): EloUpdateResult {
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
  selectBestItem(skillId: string, candidateItemIds: readonly string[]): string | null {
    if (candidateItemIds.length === 0) return null;

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
  getAllLearnerRatings(): Map<string, number> {
    return new Map(this.learnerRatings);
  }

  /**
   * Snapshot of all (itemId, rating) pairs — defensive copy.
   */
  getAllItemRatings(): Map<string, number> {
    return new Map(this.itemRatings);
  }

  /**
   * Serialize state for persistence / replay.
   */
  serialize(): string {
    return JSON.stringify({
      config: this.config,
      learnerRatings: Array.from(this.learnerRatings.entries()),
      itemRatings: Array.from(this.itemRatings.entries()),
    });
  }

  /**
   * Restore state from a serialize() output. Throws on malformed input.
   */
  static deserialize(data: string): EloDifficultyCalibrator {
    const parsed = JSON.parse(data) as {
      config?: Partial<EloCalibratorConfig>;
      learnerRatings: [string, number][];
      itemRatings: [string, number][];
    };
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
export function createEloDifficultyCalibrator(
  config: Partial<EloCalibratorConfig> = {}
): EloDifficultyCalibrator {
  return new EloDifficultyCalibrator(config);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
