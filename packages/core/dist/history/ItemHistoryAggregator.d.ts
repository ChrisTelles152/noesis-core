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
export declare const DEFAULT_ITEM_HISTORY_CONFIG: ItemHistoryConfig;
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
export declare class ItemHistoryAggregator {
    private readonly config;
    /** itemId → { attempts, correctCount } */
    private readonly counters;
    constructor(config?: Partial<ItemHistoryConfig>);
    /**
     * Record one attempt. Idempotent only with respect to the running totals —
     * not deduped by timestamp; callers that replay an event log should clear
     * via reset() first.
     */
    recordAttempt(attempt: ItemAttempt): void;
    /**
     * Set of item IDs the learner has attempted at least once.
     */
    getSeenItemIds(): Set<string>;
    /**
     * Count of unique items attempted at least once. Cheaper than
     * getSeenItemIds().size when callers only need the count.
     */
    getIntroducedItemCount(): number;
    /**
     * Items with accuracy below the weak threshold AND enough samples to trust
     * the estimate. Sorted by:
     *   1. Accuracy ascending (weakest first)
     *   2. Attempts descending as tiebreaker (more samples = more confident weak)
     *   3. Item ID ascending as final tiebreaker (replay determinism)
     *
     * @param limit  Optional cap on returned items (default: no cap)
     */
    getWeakItems(limit?: number): string[];
    /**
     * Mastery info for one item, or undefined if never attempted.
     */
    getMasteryInfo(itemId: string): ItemMasteryInfo | undefined;
    /**
     * Mastery info for every attempted item.
     */
    getMasteryMap(): Map<string, ItemMasteryInfo>;
    /**
     * Reset to empty state (used before replaying an event log).
     */
    reset(): void;
    /**
     * Serialize for persistence / replay.
     */
    serialize(): string;
    /**
     * Deserialize. Throws on malformed input.
     */
    static deserialize(data: string): ItemHistoryAggregator;
    private makeMasteryInfo;
}
/** Factory function. */
export declare function createItemHistoryAggregator(config?: Partial<ItemHistoryConfig>): ItemHistoryAggregator;
//# sourceMappingURL=ItemHistoryAggregator.d.ts.map