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
/**
 * Tunable knobs for the planner. Defaults match the converged eng+math values
 * with session budget=20 (per the decision lock in PHASE_H_EXECUTION_PLAN.md).
 */
export interface SessionBudgetConfig {
    /** Target items per session (default: 20). */
    defaultBudget: number;
    /** Lower bound on session size (default: 15). */
    minBudget: number;
    /** Upper bound on session size (default: 25). */
    maxBudget: number;
    reviews: {
        /** Fraction of budget allocated to reviews (default: 0.6). */
        targetFraction: number;
        /** Minimum review slots regardless of budget (default: 6). */
        minReviews: number;
    };
    errors: {
        /** Fraction of budget allocated to error repair (default: 0.25). */
        targetFraction: number;
        /** Hard cap on error-repair slots (default: 5). */
        maxItems: number;
        /** Items with accuracy below this count as "weak" (default: 0.6). */
        weaknessThreshold: number;
        /** Items failed more than this many days ago are not "recent" (default: 7). */
        lookbackDays: number;
    };
    newItems: {
        /** Cap on new items in a normal session (default: 4). */
        normalCap: number;
        /** Cap on new items during onboarding (first onboardingSessions sessions) (default: 6). */
        onboardingCap: number;
        /** How many sessions count as onboarding (default: 3). */
        onboardingSessions: number;
        /** Cap on new items when due queue is empty (encourages exploration) (default: 8). */
        emptyQueueCap: number;
        /** Max distinct new skills early in a pack (default: 1). */
        maxNewSkillsEarly: number;
        /** Max distinct new skills past the early threshold (default: 2). */
        maxNewSkillsLater: number;
        /** Session number at which "later" rules kick in (default: 10). */
        earlySessionThreshold: number;
        /** Max items per new skill in early sessions (default: 2). */
        maxNewItemsPerSkillEarly: number;
        /** Max items per new skill later (default: 4). */
        maxNewItemsPerSkillLater: number;
    };
    backlog: {
        /** Consecutive growth sessions before reduction triggers (default: 3). */
        growthSessionsBeforeReduction: number;
        /** Multiplier on budget when reduction triggers (default: 0.5). */
        reductionFactor: number;
    };
}
export declare const DEFAULT_SESSION_BUDGET_CONFIG: SessionBudgetConfig;
/** A review candidate — caller pre-sorts by review priority. */
export interface ReviewCandidate {
    itemId: string;
    skillId: string;
    /** ms since epoch — when this item became due (used for ordering, not by planner). */
    dueAt: number;
}
/** An error-repair candidate. */
export interface ErrorCandidate {
    itemId: string;
    skillId: string;
    /** Accuracy on this item (0–1) — items with accuracy < weaknessThreshold qualify. */
    accuracy: number;
    /** ms since epoch — last incorrect attempt time. Items older than lookbackDays are filtered. */
    lastErrorAt: number;
}
/** A new-item candidate (an item the learner hasn't seen yet). */
export interface NewItemCandidate {
    itemId: string;
    skillId: string;
    /** True iff this is a skill the learner has never attempted at all. */
    isNewSkill: boolean;
}
/**
 * Inputs to a session-planning call.
 */
export interface SessionPlanInput {
    /** 1-based session number for this learner+pack. */
    sessionNumber: number;
    /** Reviews currently due, pre-sorted by priority (most-due first). */
    dueReviews: ReviewCandidate[];
    /** Recent errors, pre-sorted by priority (worst first). */
    recentErrors: ErrorCandidate[];
    /** New items available, pre-sorted by priority (highest-leverage first). */
    newItems: NewItemCandidate[];
    /** Consecutive sessions where the due queue grew (for backlog control). */
    backlogGrowthSessions: number;
    /** Wall-clock at session start (ms since epoch) — used to filter recentErrors by lookbackDays. */
    now: number;
}
/**
 * Output of planSession — selected items + allocation breakdown.
 */
export interface SessionPlan {
    /** Effective budget after backlog reduction (if any). */
    budget: number;
    /** Whether backlog reduction was applied. */
    backlogReduced: boolean;
    /** Selected reviews (subset of input.dueReviews). */
    reviews: ReviewCandidate[];
    /** Selected error-repair items (subset of input.recentErrors). */
    errors: ErrorCandidate[];
    /** Selected new items (subset of input.newItems). */
    newItems: NewItemCandidate[];
    /** Allocation slots before clamping to candidate availability. */
    allocation: {
        reviewSlots: number;
        errorSlots: number;
        newSlots: number;
    };
    /** Distinct new skills introduced this session. */
    newSkillsIntroduced: Set<string>;
}
export declare class BudgetedSessionPlanner {
    private readonly config;
    constructor(config?: Partial<SessionBudgetConfig>);
    /**
     * Plan a session. Pure.
     */
    planSession(input: SessionPlanInput): SessionPlan;
    /**
     * Apply onboarding / empty-queue caps to the new-item slot count.
     */
    private applyNewItemCaps;
    /**
     * Select error-repair items: weakness threshold + lookback filter, then
     * take top N from caller's pre-sorted order.
     */
    private selectErrors;
    /**
     * Select new items honoring (a) total slot count, (b) max-new-skills cap
     * for the session phase, (c) per-skill new-item cap for the session phase.
     *
     * Per-skill cap means: if a new skill is introduced, we take at most N
     * items from that skill before moving on. New-skills cap limits how many
     * DISTINCT new skills get introduced at all.
     */
    private selectNewItems;
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
    static detectBacklogGrowthSessions(sessionDueHistory: {
        dueAtEnd: number;
    }[]): number;
}
/**
 * Factory.
 */
export declare function createBudgetedSessionPlanner(config?: Partial<SessionBudgetConfig>): BudgetedSessionPlanner;
//# sourceMappingURL=BudgetedSessionPlanner.d.ts.map