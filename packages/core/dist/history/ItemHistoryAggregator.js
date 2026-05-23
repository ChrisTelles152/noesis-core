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
export const DEFAULT_ITEM_HISTORY_CONFIG = {
    weakItemAccuracyThreshold: 0.8,
    minAttemptsForWeak: 2,
    minAttemptsForMastery: 2,
    masteryAccuracyThreshold: 0.8,
};
/**
 * In-memory aggregator.
 */
export class ItemHistoryAggregator {
    config;
    /** itemId → { attempts, correctCount } */
    counters = new Map();
    constructor(config = {}) {
        this.config = { ...DEFAULT_ITEM_HISTORY_CONFIG, ...config };
    }
    /**
     * Record one attempt. Idempotent only with respect to the running totals —
     * not deduped by timestamp; callers that replay an event log should clear
     * via reset() first.
     */
    recordAttempt(attempt) {
        const cur = this.counters.get(attempt.itemId) ?? { attempts: 0, correctCount: 0 };
        this.counters.set(attempt.itemId, {
            attempts: cur.attempts + 1,
            correctCount: cur.correctCount + (attempt.correct ? 1 : 0),
        });
    }
    /**
     * Set of item IDs the learner has attempted at least once.
     */
    getSeenItemIds() {
        return new Set(this.counters.keys());
    }
    /**
     * Count of unique items attempted at least once. Cheaper than
     * getSeenItemIds().size when callers only need the count.
     */
    getIntroducedItemCount() {
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
    getWeakItems(limit) {
        const candidates = [];
        for (const [itemId, c] of this.counters) {
            if (c.attempts < this.config.minAttemptsForWeak)
                continue;
            const accuracy = c.correctCount / c.attempts;
            if (accuracy < this.config.weakItemAccuracyThreshold) {
                candidates.push({ itemId, accuracy, attempts: c.attempts });
            }
        }
        candidates.sort((a, b) => {
            if (a.accuracy !== b.accuracy)
                return a.accuracy - b.accuracy;
            if (a.attempts !== b.attempts)
                return b.attempts - a.attempts;
            return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
        });
        const ids = candidates.map((c) => c.itemId);
        return limit !== undefined ? ids.slice(0, limit) : ids;
    }
    /**
     * Mastery info for one item, or undefined if never attempted.
     */
    getMasteryInfo(itemId) {
        const c = this.counters.get(itemId);
        if (!c)
            return undefined;
        return this.makeMasteryInfo(itemId, c.attempts, c.correctCount);
    }
    /**
     * Mastery info for every attempted item.
     */
    getMasteryMap() {
        const out = new Map();
        for (const [itemId, c] of this.counters) {
            out.set(itemId, this.makeMasteryInfo(itemId, c.attempts, c.correctCount));
        }
        return out;
    }
    /**
     * Reset to empty state (used before replaying an event log).
     */
    reset() {
        this.counters.clear();
    }
    /**
     * Serialize for persistence / replay.
     */
    serialize() {
        return JSON.stringify({
            config: this.config,
            counters: Array.from(this.counters.entries()),
        });
    }
    /**
     * Deserialize. Throws on malformed input.
     */
    static deserialize(data) {
        const parsed = JSON.parse(data);
        const a = new ItemHistoryAggregator(parsed.config ?? {});
        for (const [itemId, c] of parsed.counters) {
            a.counters.set(itemId, c);
        }
        return a;
    }
    makeMasteryInfo(itemId, attempts, correctCount) {
        const accuracy = attempts > 0 ? correctCount / attempts : 0;
        const mastered = accuracy >= this.config.masteryAccuracyThreshold &&
            attempts >= this.config.minAttemptsForMastery;
        return { itemId, attempts, correctCount, accuracy, mastered };
    }
}
/** Factory function. */
export function createItemHistoryAggregator(config = {}) {
    return new ItemHistoryAggregator(config);
}
//# sourceMappingURL=ItemHistoryAggregator.js.map