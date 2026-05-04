/**
 * ItemHistoryAggregator — pure in-memory item-attempt aggregation
 *
 * Per-item rolling counters + accuracy + mastery flag, used by the planner
 * to identify weak items (low accuracy, sufficient samples) and to compute
 * "introduced item" sets for new-skill caps.
 *
 * Ported from noesis-eng/banjul/src/lib/noesis/itemHistoryService.ts.
 *
 * KEY DIFFERENCE FROM SOURCE: the eng source is a Supabase CRUD layer
 * (every read/write hits `item_history` table). This port is pure in-memory:
 * record attempts via recordAttempt(), query via accessors, persist via
 * serialize() — the app layer wires persistence through NoesisStateStore.
 *
 * This separation keeps core dependency-free per CORE_SDK_CONSTITUTION while
 * preserving the universal aggregation semantics (accuracy, weak-item
 * filtering, seen-item set, mastery flag) that all three verticals share.
 */

/**
 * A single item attempt. Pass to recordAttempt() in real-time or replay.
 */
export interface ItemAttempt {
  itemId: string;
  correct: boolean;
  /** Optional — kept for parity with eng's source; not used in core aggregation today. */
  responseTimeMs?: number;
  /** Wall-clock timestamp; used for stable ordering during replay. */
  timestamp: number;
}

/**
 * Aggregator configuration. Defaults match noesis-eng's converged values.
 */
export interface ItemHistoryConfig {
  /** Accuracy below which an item is "weak" (default: 0.8 = 80%) */
  weakItemAccuracyThreshold: number;
  /** Minimum attempts before an item can be flagged as weak (default: 2) */
  minAttemptsForWeak: number;
  /** Minimum attempts before an item can be flagged as mastered (default: 2) */
  minAttemptsForMastery: number;
  /** Accuracy above which an item is "mastered" (default: 0.8 = 80%) */
  masteryAccuracyThreshold: number;
}

export const DEFAULT_ITEM_HISTORY_CONFIG: ItemHistoryConfig = {
  weakItemAccuracyThreshold: 0.8,
  minAttemptsForWeak: 2,
  minAttemptsForMastery: 2,
  masteryAccuracyThreshold: 0.8,
};

/**
 * Per-item statistics returned by getMasteryInfo() / getMasteryMap().
 */
export interface ItemMasteryInfo {
  itemId: string;
  attempts: number;
  correctCount: number;
  /** correctCount / attempts (0 if attempts=0) */
  accuracy: number;
  /** True iff accuracy ≥ masteryAccuracyThreshold AND attempts ≥ minAttemptsForMastery */
  mastered: boolean;
}

/**
 * In-memory aggregator.
 */
export class ItemHistoryAggregator {
  private readonly config: ItemHistoryConfig;
  /** itemId → { attempts, correctCount } */
  private readonly counters: Map<string, { attempts: number; correctCount: number }> = new Map();

  constructor(config: Partial<ItemHistoryConfig> = {}) {
    this.config = { ...DEFAULT_ITEM_HISTORY_CONFIG, ...config };
  }

  /**
   * Record one attempt. Idempotent only with respect to the running totals —
   * not deduped by timestamp; callers that replay an event log should clear
   * via reset() first.
   */
  recordAttempt(attempt: ItemAttempt): void {
    const cur = this.counters.get(attempt.itemId) ?? { attempts: 0, correctCount: 0 };
    this.counters.set(attempt.itemId, {
      attempts: cur.attempts + 1,
      correctCount: cur.correctCount + (attempt.correct ? 1 : 0),
    });
  }

  /**
   * Set of item IDs the learner has attempted at least once.
   */
  getSeenItemIds(): Set<string> {
    return new Set(this.counters.keys());
  }

  /**
   * Count of unique items attempted at least once. Cheaper than
   * getSeenItemIds().size when callers only need the count.
   */
  getIntroducedItemCount(): number {
    return this.counters.size;
  }

  /**
   * Items with accuracy below the weak threshold AND enough samples to trust
   * the estimate. Sorted by:
   *   1. Accuracy ascending (weakest first)
   *   2. Attempts descending as tiebreaker (more samples = more confident weak)
   *   3. Item ID ascending as final tiebreaker (replay determinism)
   *
   * @param limit  Optional cap on returned items (default: no cap)
   */
  getWeakItems(limit?: number): string[] {
    const candidates: { itemId: string; accuracy: number; attempts: number }[] = [];

    for (const [itemId, c] of this.counters) {
      if (c.attempts < this.config.minAttemptsForWeak) continue;
      const accuracy = c.correctCount / c.attempts;
      if (accuracy < this.config.weakItemAccuracyThreshold) {
        candidates.push({ itemId, accuracy, attempts: c.attempts });
      }
    }

    candidates.sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      if (a.attempts !== b.attempts) return b.attempts - a.attempts;
      return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
    });

    const ids = candidates.map((c) => c.itemId);
    return limit !== undefined ? ids.slice(0, limit) : ids;
  }

  /**
   * Mastery info for one item, or undefined if never attempted.
   */
  getMasteryInfo(itemId: string): ItemMasteryInfo | undefined {
    const c = this.counters.get(itemId);
    if (!c) return undefined;
    return this.makeMasteryInfo(itemId, c.attempts, c.correctCount);
  }

  /**
   * Mastery info for every attempted item.
   */
  getMasteryMap(): Map<string, ItemMasteryInfo> {
    const out = new Map<string, ItemMasteryInfo>();
    for (const [itemId, c] of this.counters) {
      out.set(itemId, this.makeMasteryInfo(itemId, c.attempts, c.correctCount));
    }
    return out;
  }

  /**
   * Reset to empty state (used before replaying an event log).
   */
  reset(): void {
    this.counters.clear();
  }

  /**
   * Serialize for persistence / replay.
   */
  serialize(): string {
    return JSON.stringify({
      config: this.config,
      counters: Array.from(this.counters.entries()),
    });
  }

  /**
   * Deserialize. Throws on malformed input.
   */
  static deserialize(data: string): ItemHistoryAggregator {
    const parsed = JSON.parse(data) as {
      config?: Partial<ItemHistoryConfig>;
      counters: [string, { attempts: number; correctCount: number }][];
    };
    const a = new ItemHistoryAggregator(parsed.config ?? {});
    for (const [itemId, c] of parsed.counters) {
      a.counters.set(itemId, c);
    }
    return a;
  }

  private makeMasteryInfo(
    itemId: string,
    attempts: number,
    correctCount: number
  ): ItemMasteryInfo {
    const accuracy = attempts > 0 ? correctCount / attempts : 0;
    const mastered =
      accuracy >= this.config.masteryAccuracyThreshold &&
      attempts >= this.config.minAttemptsForMastery;
    return { itemId, attempts, correctCount, accuracy, mastered };
  }
}

/** Factory function. */
export function createItemHistoryAggregator(
  config: Partial<ItemHistoryConfig> = {}
): ItemHistoryAggregator {
  return new ItemHistoryAggregator(config);
}
