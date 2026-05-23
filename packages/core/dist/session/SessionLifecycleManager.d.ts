/**
 * SessionLifecycleManager — pure in-memory session bookkeeping
 *
 * One instance per app process. Holds the full lifecycle of in-flight sessions:
 *   - createSession(): start a new session with a pre-computed plan
 *   - getSession() / getSessionPlan() / findActiveSession(): query
 *   - recordItemShown() / recordItemAnswered(): incremental updates
 *   - endSession(): finalize
 *   - resumeSession(): restore from a previously serialized record
 *   - deleteSessionCaches() / clearAllCaches(): cleanup
 *   - serialize() / deserialize(): persist via NoesisStateStore
 *
 * Ported from noesis-eng/banjul/src/lib/noesis/sessionManagementService.ts.
 *
 * KEY DIFFERENCES FROM SOURCE:
 *
 *   1. Pure in-memory — no Supabase. All persistence is the caller's
 *      responsibility via serialize() at significant moments and the
 *      NoesisStateStore interface.
 *
 *   2. Determinism — every method that records a timestamp accepts `now: number`
 *      (ms since epoch) as a parameter. No internal Date.now() calls. Same
 *      replay sequence yields identical records.
 *
 *   3. Plan + plannerSnapshot are caller-supplied at createSession time —
 *      this module does not compute them. BudgetedSessionPlanner produces
 *      the SessionPlan; PlannerSnapshot (H-1.D.3) produces the snapshot.
 *      The lifecycle manager just stores both alongside the session record.
 *
 *   4. SessionId is caller-supplied. Eng generated UUIDs inside; we delegate
 *      to the caller (pack of EventFactoryContext.idGenerator) so replay
 *      determinism is preserved end-to-end.
 *
 *   5. SessionAttemptTracker isn't depended on yet (it lives in H-1.D.5
 *      SessionMetricsLogger). The caller can wire one up alongside if
 *      they want. We expose attempt counters on SessionRecord directly.
 */
import type { SessionPlan } from '../planning/BudgetedSessionPlanner.js';
/**
 * Persisted shape of a session.
 */
export interface SessionRecord {
    sessionId: string;
    learnerId: string;
    packId: string;
    packVersion: string;
    /** ms since epoch */
    startedAt: number;
    /** ms since epoch, null while in-flight */
    endedAt: number | null;
    /** Items the planner picked. */
    plan: SessionPlan;
    /** Item IDs the learner has been shown so far. */
    shownItemIds: string[];
    /** Distinct items the learner has answered so far. */
    itemsAnswered: number;
    /**
     * Opaque caller-supplied snapshot for deterministic replay (typically
     * produced by PlannerSnapshot in H-1.D.3). Stored as JSON-serialisable
     * object — the manager doesn't introspect it.
     */
    plannerSnapshot?: unknown;
}
export interface CreateSessionArgs {
    /** Caller-supplied (use EventFactoryContext.idGenerator for determinism). */
    sessionId: string;
    learnerId: string;
    packId: string;
    packVersion: string;
    /** Pre-computed by BudgetedSessionPlanner. */
    plan: SessionPlan;
    /** Optional: pre-captured snapshot for replay. */
    plannerSnapshot?: unknown;
    /** ms since epoch. */
    now: number;
}
export declare class SessionLifecycleManager {
    /** sessionId -> SessionRecord */
    private readonly sessions;
    /**
     * Create a new session. SessionId must not already exist (active or ended).
     */
    createSession(args: CreateSessionArgs): SessionRecord;
    /**
     * Lookup by sessionId. Returns undefined if not present.
     */
    getSession(sessionId: string): SessionRecord | undefined;
    /**
     * Convenience: get just the plan.
     */
    getSessionPlan(sessionId: string): SessionPlan | undefined;
    /**
     * Find the most-recently-started in-flight session for a (learner, pack).
     * Returns undefined if all sessions are ended or none exist.
     */
    findActiveSession(learnerId: string, packId: string): SessionRecord | undefined;
    /**
     * Record an item being shown to the learner.
     * Idempotent on duplicate itemId — does not double-count.
     */
    recordItemShown(sessionId: string, itemId: string): void;
    /**
     * Record an item being answered. Increments itemsAnswered.
     *
     * Note: idempotency is the caller's responsibility — if the same answer
     * is posted twice we'll count it twice. Use OptimisticLockingStateStore
     * (H-1.D.4) to guard against that at the persistence layer.
     */
    recordItemAnswered(sessionId: string): void;
    /**
     * Finalize a session.
     * Throws if already ended (caller should checkActive first if optional).
     */
    endSession(sessionId: string, now: number): SessionRecord;
    /**
     * Restore a previously-serialized session record. Used after process
     * restart or to replay a session from persisted state.
     *
     * If a session with the same ID already exists in the manager, it is
     * overwritten — the persisted record wins.
     */
    resumeSession(record: SessionRecord): void;
    /**
     * Drop a single session from in-memory caches. Does NOT delete persisted
     * state — that's the caller's responsibility.
     */
    deleteSessionCaches(sessionId: string): void;
    /**
     * Drop all sessions from in-memory caches. Useful for tests + dev hot reload.
     */
    clearAllCaches(): void;
    /**
     * Snapshot for persistence. Returns sorted JSON for stable output.
     */
    serialize(): string;
    /**
     * Restore from serialize() output.
     */
    static deserialize(data: string): SessionLifecycleManager;
    /**
     * Read-only iteration over all sessions (active + ended). Returns clones.
     */
    allSessions(): IterableIterator<SessionRecord>;
    /**
     * Count sessions matching a predicate. Useful for billing-soft-checks
     * etc. without exposing internal state.
     */
    countSessions(predicate: (r: SessionRecord) => boolean): number;
    private requireActive;
}
/**
 * Factory.
 */
export declare function createSessionLifecycleManager(): SessionLifecycleManager;
//# sourceMappingURL=SessionLifecycleManager.d.ts.map