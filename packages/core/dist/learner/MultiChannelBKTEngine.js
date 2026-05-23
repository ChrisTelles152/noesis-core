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
import { validateBKTParams } from './BKTEngine.js';
export const DEFAULT_DRILLING_DISCOUNT = {
    attemptsBeforeDiscount: 2,
    multiplier: 0.3,
};
// =============================================================================
// Pure update math
// =============================================================================
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
export function calculateBKTUpdate(currentPMastery, correct, params, discountFactor = 1.0) {
    const { pLearn, pSlip, pGuess } = params;
    const effectivePLearn = pLearn * discountFactor;
    // SAFETY: epsilon to prevent NaN if pSlip=1 and pGuess=0 (validated against
    // by validateBKTParams, but the guard is cheap).
    const EPSILON = 1e-10;
    let pMasteryGivenEvidence;
    if (correct) {
        const pCorrectGivenL = 1 - pSlip;
        const pCorrectGivenNotL = pGuess;
        const pCorrect = Math.max(EPSILON, pCorrectGivenL * currentPMastery + pCorrectGivenNotL * (1 - currentPMastery));
        pMasteryGivenEvidence = (pCorrectGivenL * currentPMastery) / pCorrect;
    }
    else {
        const pIncorrectGivenL = pSlip;
        const pIncorrectGivenNotL = 1 - pGuess;
        const pIncorrect = Math.max(EPSILON, pIncorrectGivenL * currentPMastery + pIncorrectGivenNotL * (1 - currentPMastery));
        pMasteryGivenEvidence = (pIncorrectGivenL * currentPMastery) / pIncorrect;
    }
    // Learning transition: P(L_new) = P(L|evidence) + (1 - P(L|evidence)) * pLearn * discount
    const newPMastery = pMasteryGivenEvidence + (1 - pMasteryGivenEvidence) * effectivePLearn;
    return Math.max(0, Math.min(1, newPMastery));
}
/**
 * Apply skill-category modifier to BKT params.
 * Returns a new BKTParams; does not mutate input.
 */
export function applyCategoryModifier(params, modifier) {
    if (!modifier)
        return params;
    return {
        pInit: params.pInit,
        pLearn: params.pLearn * (modifier.pLearnMultiplier ?? 1.0),
        pSlip: params.pSlip + (modifier.pSlipAdd ?? 0.0),
        pGuess: params.pGuess,
    };
}
/**
 * UTC YYYY-MM-DD from a ms-since-epoch timestamp. Matches eng/math semantics
 * (their `correctDays` use UTC dates from `toISOString().split('T')[0]`).
 */
export function utcDateString(timestamp) {
    return new Date(timestamp).toISOString().split('T')[0];
}
// =============================================================================
// MultiChannelBKTEngine
// =============================================================================
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
export class MultiChannelBKTEngine {
    config;
    /** skillId -> channelId -> state */
    state = new Map();
    constructor(config) {
        if (!config.channels || Object.keys(config.channels).length === 0) {
            throw new Error('MultiChannelBKTConfig.channels must declare at least one channel');
        }
        for (const [channelId, params] of Object.entries(config.channels)) {
            try {
                validateBKTParams(params);
            }
            catch (e) {
                throw new Error(`Invalid BKT params for channel "${channelId}": ${e.message}`);
            }
        }
        this.config = config;
    }
    /**
     * Pure update computation. Same inputs → same outputs, no side effects.
     * Used by replay-equivalence checks and by applyAttempt() internally.
     */
    static computeUpdate(currentState, correct, sessionId, config, now, skillCategory) {
        const channelParams = config.channels[currentState.channel];
        if (!channelParams) {
            throw new Error(`Channel "${currentState.channel}" not declared in config.channels`);
        }
        const drilling = config.drillingDiscount ?? DEFAULT_DRILLING_DISCOUNT;
        // Reset session counter if sessionId changed.
        const isNewSession = currentState.currentSessionId !== sessionId;
        const sessionAttempts = isNewSession ? 1 : currentState.sessionAttempts + 1;
        const discounted = sessionAttempts > drilling.attemptsBeforeDiscount;
        const discountFactor = discounted ? drilling.multiplier : 1.0;
        const modifier = skillCategory ? config.skillCategoryModifiers?.[skillCategory] : undefined;
        const effectiveParams = applyCategoryModifier(channelParams, modifier);
        const newPMastery = calculateBKTUpdate(currentState.pMastery, correct, effectiveParams, discountFactor);
        // correctDays: append today's UTC date if correct and not already present.
        const correctDays = [...currentState.correctDays];
        if (correct) {
            const today = utcDateString(now);
            if (!correctDays.includes(today)) {
                correctDays.push(today);
            }
        }
        return { newPMastery, sessionAttempts, discounted, correctDays };
    }
    /**
     * Initial state for an unseen (skill, channel) pair.
     */
    initialState(skillId, channel, now) {
        const channelParams = this.config.channels[channel];
        if (!channelParams) {
            throw new Error(`Channel "${channel}" not declared in config.channels`);
        }
        return {
            skillId,
            channel,
            pMastery: channelParams.pInit,
            attempts: 0,
            correctCount: 0,
            sessionAttempts: 0,
            currentSessionId: null,
            correctDays: [],
            firstSeenAt: now,
            firstCorrectAt: null,
            lastAttemptAt: null,
            lastCorrect: null,
            lastUpdated: now,
        };
    }
    /**
     * Lookup or initialize state for (skill, channel). Caller can then mutate
     * via applyAttempt; this is the read-side accessor.
     */
    getState(skillId, channel, now) {
        let bySkill = this.state.get(skillId);
        if (!bySkill) {
            bySkill = new Map();
            this.state.set(skillId, bySkill);
        }
        let s = bySkill.get(channel);
        if (!s) {
            // We need a `now` to initialize — caller-supplied or 0 as a sentinel
            // (caller should always pass a real `now` if they're making an attempt).
            s = this.initialState(skillId, channel, now ?? 0);
            bySkill.set(channel, s);
        }
        return s;
    }
    /**
     * Apply one practice attempt. Updates internal state and returns the
     * before/after snapshots + flags.
     */
    applyAttempt(args) {
        const { skillId, channel, correct, sessionId, now, skillCategory } = args;
        const current = this.getState(skillId, channel, now);
        const before = {
            pMastery: current.pMastery,
            attempts: current.attempts,
            correctCount: current.correctCount,
        };
        const computed = MultiChannelBKTEngine.computeUpdate(current, correct, sessionId, this.config, now, skillCategory);
        const updated = {
            skillId,
            channel,
            pMastery: computed.newPMastery,
            attempts: current.attempts + 1,
            correctCount: current.correctCount + (correct ? 1 : 0),
            sessionAttempts: computed.sessionAttempts,
            currentSessionId: sessionId,
            correctDays: computed.correctDays,
            firstSeenAt: current.firstSeenAt,
            firstCorrectAt: current.firstCorrectAt ?? (correct ? now : null),
            lastAttemptAt: now,
            lastCorrect: correct,
            lastUpdated: now,
        };
        // Persist back to internal state.
        let bySkill = this.state.get(skillId);
        if (!bySkill) {
            bySkill = new Map();
            this.state.set(skillId, bySkill);
        }
        bySkill.set(channel, updated);
        return {
            before,
            after: {
                pMastery: updated.pMastery,
                attempts: updated.attempts,
                correctCount: updated.correctCount,
            },
            discounted: computed.discounted,
            correctDaysCountAfter: updated.correctDays.length,
        };
    }
    /**
     * pMastery for (skillId, channel). Returns config.channels[channel].pInit
     * if state is unseen.
     */
    getPMastery(skillId, channel) {
        const bySkill = this.state.get(skillId);
        if (!bySkill)
            return this.config.channels[channel]?.pInit ?? 0;
        const s = bySkill.get(channel);
        return s ? s.pMastery : (this.config.channels[channel]?.pInit ?? 0);
    }
    /**
     * Snapshot of all (skillId, channelId) -> state — defensive copy.
     */
    getAllStates() {
        const out = new Map();
        for (const [skillId, byChannel] of this.state) {
            const inner = new Map();
            for (const [channelId, s] of byChannel) {
                inner.set(channelId, { ...s, correctDays: [...s.correctDays] });
            }
            out.set(skillId, inner);
        }
        return out;
    }
    /**
     * Serialize for persistence / replay.
     */
    serialize() {
        const stateArray = [];
        for (const [skillId, byChannel] of this.state) {
            const channels = [];
            for (const [channelId, s] of byChannel) {
                channels.push([channelId, s]);
            }
            // Sort for stable output
            channels.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
            stateArray.push([skillId, channels]);
        }
        stateArray.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        return JSON.stringify({
            config: this.config,
            state: stateArray,
        });
    }
    /**
     * Restore from serialize() output.
     */
    static deserialize(data) {
        const parsed = JSON.parse(data);
        const engine = new MultiChannelBKTEngine(parsed.config);
        for (const [skillId, channels] of parsed.state) {
            const inner = new Map();
            for (const [channelId, s] of channels) {
                inner.set(channelId, s);
            }
            engine.state.set(skillId, inner);
        }
        return engine;
    }
}
/**
 * Factory for ergonomic call-sites.
 */
export function createMultiChannelBKTEngine(config) {
    return new MultiChannelBKTEngine(config);
}
//# sourceMappingURL=MultiChannelBKTEngine.js.map