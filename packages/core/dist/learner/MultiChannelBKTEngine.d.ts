/**
 * MultiChannelBKTEngine — Bayesian Knowledge Tracing with per-channel state
 *
 * Extends single-channel BKT to track mastery separately per assessment
 * channel (e.g., recognition MC, cloze, production typed). Bundles the two
 * universal patterns the verticals converged on but which the original
 * core BKTEngine does not provide:
 *
 *   1. **Per-channel pMastery** — a learner can be Mastered on RECOG_MC
 *      but only Learning on PROD_TYPED for the same skill.
 *   2. **Drilling discount** — discount the learning transition after the
 *      learner has already attempted this (skill, channel) more than N
 *      times in the same session, to prevent rapid mastery inflation from
 *      drilling the same item.
 *   3. **Skill category modifier** — pack-supplied per-category tweaks to
 *      pLearn / pSlip (e.g., English grammar items learn ~15% slower and
 *      are ~3% more brittle than vocabulary; that's `{grammar: {
 *      pLearnMultiplier: 0.85, pSlipAdd: 0.03 }}`).
 *
 * DESIGN NOTES (per eng audit §3.7):
 *
 *   - `computeUpdate` is exposed as a pure static so the planner snapshot
 *     and noesis-proof's replay framework can recompute BKT transitions
 *     purely from a captured event log.
 *   - `now` is a number (ms since epoch) parameter on every attempt, not
 *     an injected clock — matches the calibrator pattern, keeps the engine
 *     clock-free.
 *   - State persistence is the caller's responsibility via serialize() /
 *     deserialize(). Optimistic locking lives in core's persistence layer
 *     (OptimisticLockingStateStore — H-1.D.4); MCBKT itself is pure state
 *     transitions.
 *   - The existing single-channel `BKTEngine` is untouched. Single-channel
 *     callers (delf, noesis-proof) continue to use it without change. If
 *     a caller wants to migrate from BKTEngine to MCBKT, they pass a
 *     single-element channels record (e.g., `{ default: bktParams }`) and
 *     use channel="default" on every attempt.
 *
 * Ported logic from:
 *   - noesis-eng/banjul/src/lib/noesis/bktService.ts (multi-channel + grammar
 *     modifier + drilling discount + Bayesian update + correctDays append)
 *   - noesis-math/managua/src/lib/noesis/bktService.ts (same Bayesian update
 *     with two-channel set, no grammar modifier)
 *
 * The pure update math (`calculateBKTUpdate`) is re-exported from
 * BKTEngine to keep one source of truth for the Bayesian formula.
 */
import type { BKTParams } from './BKTEngine.js';
/**
 * Channel ID — pack-defined string. Core treats these as opaque keys.
 * Examples: "recog_mc", "cloze", "prod_typed", "typed_answer", "multiple_choice".
 */
export type ChannelId = string;
/**
 * Per-channel BKT parameters. Same shape as single-channel BKTParams.
 */
export type ChannelBKTConfig = BKTParams;
/**
 * Per-skill-category modifier. Keyed into MultiChannelBKTConfig.skillCategoryModifiers
 * by category name (e.g., "grammar", "vocabulary").
 */
export interface SkillCategoryModifier {
    /** Multiplier applied to pLearn (default 1.0 = no change). */
    pLearnMultiplier?: number;
    /** Additive applied to pSlip (default 0.0 = no change). */
    pSlipAdd?: number;
}
/**
 * Drilling-discount config. Discount the learning transition after the
 * learner has attempted this (skill, channel) more than N times in the
 * same session.
 */
export interface DrillingDiscountConfig {
    /** Trigger threshold: discount applies when sessionAttempts > this (default: 2). */
    attemptsBeforeDiscount: number;
    /** Discount multiplier on pLearn (default: 0.3 = 70% reduction). */
    multiplier: number;
}
export declare const DEFAULT_DRILLING_DISCOUNT: DrillingDiscountConfig;
/**
 * Multi-channel BKT engine configuration.
 */
export interface MultiChannelBKTConfig {
    /** Per-channel BKT parameters. Each channel ID is pack-defined. */
    channels: Record<ChannelId, ChannelBKTConfig>;
    /** Drilling-discount tuning. Defaults applied if omitted. */
    drillingDiscount?: DrillingDiscountConfig;
    /** Per-skill-category modifiers (e.g., {grammar: {pLearnMultiplier: 0.85}}). */
    skillCategoryModifiers?: Record<string, SkillCategoryModifier>;
}
/**
 * Per-channel state for a single (skill, channel) pair.
 */
export interface ChannelSkillProbability {
    skillId: string;
    channel: ChannelId;
    pMastery: number;
    attempts: number;
    correctCount: number;
    /** Number of attempts in the current session — resets when sessionId changes. */
    sessionAttempts: number;
    currentSessionId: string | null;
    /** YYYY-MM-DD UTC strings for distinct calendar days with a correct answer. */
    correctDays: string[];
    /** ms since epoch */
    firstSeenAt: number;
    firstCorrectAt: number | null;
    lastAttemptAt: number | null;
    lastCorrect: boolean | null;
    lastUpdated: number;
}
/**
 * Result of applyAttempt() — before/after snapshots + provenance flags.
 */
export interface BKTAttemptResult {
    before: {
        pMastery: number;
        attempts: number;
        correctCount: number;
    };
    after: {
        pMastery: number;
        attempts: number;
        correctCount: number;
    };
    /** True if drilling discount was applied to this update. */
    discounted: boolean;
    /** correctDays.length after the update. */
    correctDaysCountAfter: number;
}
/**
 * Pure-update result (no before/after counts since computeUpdate doesn't
 * see the full state — caller composes).
 */
export interface BKTComputeResult {
    newPMastery: number;
    sessionAttempts: number;
    discounted: boolean;
    correctDays: string[];
}
/**
 * Bayesian knowledge tracing update — same formula as core's BKTEngine, but
 * separated as a pure function for explicit replay determinism.
 *
 * Step 1 (Bayes update on observation) followed by step 2 (learning
 * transition with optional discount).
 *
 * Identical numerics to BKTEngine.updateModel — the goal is byte-for-byte
 * parity for replay-equivalence tests.
 */
export declare function calculateBKTUpdate(currentPMastery: number, correct: boolean, params: BKTParams, discountFactor?: number): number;
/**
 * Apply skill-category modifier to BKT params.
 * Returns a new BKTParams; does not mutate input.
 */
export declare function applyCategoryModifier(params: BKTParams, modifier: SkillCategoryModifier | undefined): BKTParams;
/**
 * UTC YYYY-MM-DD from a ms-since-epoch timestamp. Matches eng/math semantics
 * (their `correctDays` use UTC dates from `toISOString().split('T')[0]`).
 */
export declare function utcDateString(timestamp: number): string;
/**
 * Stateful multi-channel BKT engine. One instance per learner.
 *
 * Internal state:  Map<skillId, Map<ChannelId, ChannelSkillProbability>>
 *
 * Caller responsibilities:
 *   - Construct with a config that declares all channels the learner uses.
 *   - Call applyAttempt(...) per practice event.
 *   - Optionally serialize() at session end and deserialize() at next start.
 */
export declare class MultiChannelBKTEngine {
    private readonly config;
    /** skillId -> channelId -> state */
    private readonly state;
    constructor(config: MultiChannelBKTConfig);
    /**
     * Pure update computation. Same inputs → same outputs, no side effects.
     * Used by replay-equivalence checks and by applyAttempt() internally.
     */
    static computeUpdate(currentState: ChannelSkillProbability, correct: boolean, sessionId: string, config: MultiChannelBKTConfig, now: number, skillCategory?: string): BKTComputeResult;
    /**
     * Initial state for an unseen (skill, channel) pair.
     */
    initialState(skillId: string, channel: ChannelId, now: number): ChannelSkillProbability;
    /**
     * Lookup or initialize state for (skill, channel). Caller can then mutate
     * via applyAttempt; this is the read-side accessor.
     */
    getState(skillId: string, channel: ChannelId, now?: number): ChannelSkillProbability;
    /**
     * Apply one practice attempt. Updates internal state and returns the
     * before/after snapshots + flags.
     */
    applyAttempt(args: {
        skillId: string;
        channel: ChannelId;
        correct: boolean;
        sessionId: string;
        now: number;
        skillCategory?: string;
    }): BKTAttemptResult;
    /**
     * pMastery for (skillId, channel). Returns config.channels[channel].pInit
     * if state is unseen.
     */
    getPMastery(skillId: string, channel: ChannelId): number;
    /**
     * Snapshot of all (skillId, channelId) -> state — defensive copy.
     */
    getAllStates(): Map<string, Map<ChannelId, ChannelSkillProbability>>;
    /**
     * Serialize for persistence / replay.
     */
    serialize(): string;
    /**
     * Restore from serialize() output.
     */
    static deserialize(data: string): MultiChannelBKTEngine;
}
/**
 * Factory for ergonomic call-sites.
 */
export declare function createMultiChannelBKTEngine(config: MultiChannelBKTConfig): MultiChannelBKTEngine;
//# sourceMappingURL=MultiChannelBKTEngine.d.ts.map