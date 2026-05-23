/**
 * BudgetedSessionPlanner — session-level allocation planner
 *
 * While `SessionPlannerImpl` answers "what's the next action right now?" at
 * every interaction (gap-targeting policy), `BudgetedSessionPlanner` answers
 * "what's the agenda for this whole session?" once at session start.
 *
 * It allocates a fixed-size session across three buckets per the converged
 * eng+math defaults:
 *
 *   1. **Reviews** (60% of budget, min 6) — items currently due for spaced
 *      retrieval (highest priority).
 *   2. **Errors** (25% of budget, max 5) — recently-failed items below a
 *      weakness threshold (default: accuracy < 0.6, lookback 7 days).
 *   3. **New items** (remaining budget, multiple caps) — new-skill
 *      introduction with onboarding ramp + per-session new-skill caps + per-
 *      skill new-item caps.
 *
 * Plus **backlog control**: if the learner's due queue grew over the last N
 * sessions (default 3), reduce session budget by 50% to give them a chance
 * to catch up.
 *
 * Pure: the planner is stateless. Caller supplies sorted candidates +
 * session number + backlog signal; planSession returns a SessionPlan.
 *
 * Per the audit, candidate ordering is the caller's responsibility (for
 * recycles tiebreaker, channel-preference sort, weakness-priority sort —
 * those are pack-tunable, not universal). Core's planner trusts that
 * candidates arrive sorted by priority and selects the top N from each.
 *
 * Sources:
 *   - noesis-eng/banjul/src/lib/noesis/plannerService.ts (~791 LOC)
 *   - noesis-math/managua/src/lib/noesis/plannerService.ts (~556 LOC)
 *   - noesis-eng/banjul/docs/PHASE_H_AUDIT.md §5 (magic-number convergence catalog)
 */
export const DEFAULT_SESSION_BUDGET_CONFIG = {
    defaultBudget: 20,
    minBudget: 15,
    maxBudget: 25,
    reviews: {
        targetFraction: 0.6,
        minReviews: 6,
    },
    errors: {
        targetFraction: 0.25,
        maxItems: 5,
        weaknessThreshold: 0.6,
        lookbackDays: 7,
    },
    newItems: {
        normalCap: 4,
        onboardingCap: 6,
        onboardingSessions: 3,
        emptyQueueCap: 8,
        maxNewSkillsEarly: 1,
        maxNewSkillsLater: 2,
        earlySessionThreshold: 10,
        maxNewItemsPerSkillEarly: 2,
        maxNewItemsPerSkillLater: 4,
    },
    backlog: {
        growthSessionsBeforeReduction: 3,
        reductionFactor: 0.5,
    },
};
const MS_PER_DAY = 1000 * 60 * 60 * 24;
// =============================================================================
// BudgetedSessionPlanner
// =============================================================================
export class BudgetedSessionPlanner {
    config;
    constructor(config = {}) {
        // Deep-merge: each section can be partially overridden.
        this.config = {
            defaultBudget: config.defaultBudget ?? DEFAULT_SESSION_BUDGET_CONFIG.defaultBudget,
            minBudget: config.minBudget ?? DEFAULT_SESSION_BUDGET_CONFIG.minBudget,
            maxBudget: config.maxBudget ?? DEFAULT_SESSION_BUDGET_CONFIG.maxBudget,
            reviews: { ...DEFAULT_SESSION_BUDGET_CONFIG.reviews, ...(config.reviews ?? {}) },
            errors: { ...DEFAULT_SESSION_BUDGET_CONFIG.errors, ...(config.errors ?? {}) },
            newItems: { ...DEFAULT_SESSION_BUDGET_CONFIG.newItems, ...(config.newItems ?? {}) },
            backlog: { ...DEFAULT_SESSION_BUDGET_CONFIG.backlog, ...(config.backlog ?? {}) },
        };
    }
    /**
     * Plan a session. Pure.
     */
    planSession(input) {
        // 1. Compute effective budget with backlog control.
        const backlogReduced = input.backlogGrowthSessions >= this.config.backlog.growthSessionsBeforeReduction;
        const reducedBudget = backlogReduced
            ? Math.round(this.config.defaultBudget * this.config.backlog.reductionFactor)
            : this.config.defaultBudget;
        const budget = clamp(reducedBudget, this.config.minBudget, this.config.maxBudget);
        // 2. Compute target slot allocations.
        const reviewSlots = Math.max(this.config.reviews.minReviews, Math.floor(budget * this.config.reviews.targetFraction));
        const errorSlots = Math.min(this.config.errors.maxItems, Math.floor(budget * this.config.errors.targetFraction));
        // Whatever's left after reviews + errors goes to new items.
        const newSlotsRaw = Math.max(0, budget - reviewSlots - errorSlots);
        const newSlots = this.applyNewItemCaps(newSlotsRaw, input);
        // 3. Pick reviews (top N by caller's order; clamp to availability).
        const reviews = input.dueReviews.slice(0, reviewSlots);
        // 4. Pick errors with weakness + lookback filters.
        const errors = this.selectErrors(input.recentErrors, errorSlots, input.now);
        // 5. Pick new items with new-skill cap + per-skill cap.
        const { selected: newItems, newSkillsIntroduced } = this.selectNewItems(input.newItems, newSlots, input.sessionNumber);
        return {
            budget,
            backlogReduced,
            reviews,
            errors,
            newItems,
            allocation: { reviewSlots, errorSlots, newSlots },
            newSkillsIntroduced,
        };
    }
    /**
     * Apply onboarding / empty-queue caps to the new-item slot count.
     */
    applyNewItemCaps(rawSlots, input) {
        const cfg = this.config.newItems;
        let cap;
        if (input.dueReviews.length === 0) {
            cap = cfg.emptyQueueCap;
        }
        else if (input.sessionNumber <= cfg.onboardingSessions) {
            cap = cfg.onboardingCap;
        }
        else {
            cap = cfg.normalCap;
        }
        return Math.min(rawSlots, cap);
    }
    /**
     * Select error-repair items: weakness threshold + lookback filter, then
     * take top N from caller's pre-sorted order.
     */
    selectErrors(candidates, slots, now) {
        if (slots <= 0)
            return [];
        const cutoff = now - this.config.errors.lookbackDays * MS_PER_DAY;
        const filtered = candidates.filter((c) => c.accuracy < this.config.errors.weaknessThreshold && c.lastErrorAt >= cutoff);
        return filtered.slice(0, slots);
    }
    /**
     * Select new items honoring (a) total slot count, (b) max-new-skills cap
     * for the session phase, (c) per-skill new-item cap for the session phase.
     *
     * Per-skill cap means: if a new skill is introduced, we take at most N
     * items from that skill before moving on. New-skills cap limits how many
     * DISTINCT new skills get introduced at all.
     */
    selectNewItems(candidates, slots, sessionNumber) {
        if (slots <= 0)
            return { selected: [], newSkillsIntroduced: new Set() };
        const cfg = this.config.newItems;
        const isEarly = sessionNumber <= cfg.earlySessionThreshold;
        const maxNewSkills = isEarly ? cfg.maxNewSkillsEarly : cfg.maxNewSkillsLater;
        const maxItemsPerNewSkill = isEarly
            ? cfg.maxNewItemsPerSkillEarly
            : cfg.maxNewItemsPerSkillLater;
        const selected = [];
        const newSkillsIntroduced = new Set();
        const itemsPerSkill = new Map();
        for (const candidate of candidates) {
            if (selected.length >= slots)
                break;
            // New-skill gate: if this candidate would introduce a new skill, check
            // the per-session new-skills cap.
            if (candidate.isNewSkill && !newSkillsIntroduced.has(candidate.skillId)) {
                if (newSkillsIntroduced.size >= maxNewSkills) {
                    // Skip — would exceed new-skills cap.
                    continue;
                }
                newSkillsIntroduced.add(candidate.skillId);
            }
            // Per-skill item cap (applies only to new skills — not to items from
            // already-seen skills, where the planner trusts caller ordering).
            if (candidate.isNewSkill) {
                const cnt = itemsPerSkill.get(candidate.skillId) ?? 0;
                if (cnt >= maxItemsPerNewSkill)
                    continue;
                itemsPerSkill.set(candidate.skillId, cnt + 1);
            }
            selected.push(candidate);
        }
        return { selected, newSkillsIntroduced };
    }
    /**
     * Helper: detect backlog growth across recent session history.
     *
     * Returns the count of consecutive sessions (counting backwards from the
     * end) where the due-queue grew. The planner uses this against
     * `backlog.growthSessionsBeforeReduction`.
     *
     * Example: history = [{due: 5}, {due: 8}, {due: 12}, {due: 18}] →
     * growth count = 3 (each session grew the queue).
     */
    static detectBacklogGrowthSessions(sessionDueHistory) {
        if (sessionDueHistory.length < 2)
            return 0;
        let count = 0;
        for (let i = sessionDueHistory.length - 1; i >= 1; i--) {
            if (sessionDueHistory[i].dueAtEnd > sessionDueHistory[i - 1].dueAtEnd) {
                count++;
            }
            else {
                break;
            }
        }
        return count;
    }
}
/**
 * Factory.
 */
export function createBudgetedSessionPlanner(config = {}) {
    return new BudgetedSessionPlanner(config);
}
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
//# sourceMappingURL=BudgetedSessionPlanner.js.map