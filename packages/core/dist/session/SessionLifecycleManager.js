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
// =============================================================================
// SessionLifecycleManager
// =============================================================================
export class SessionLifecycleManager {
    /** sessionId -> SessionRecord */
    sessions = new Map();
    /**
     * Create a new session. SessionId must not already exist (active or ended).
     */
    createSession(args) {
        if (this.sessions.has(args.sessionId)) {
            throw new Error(`Session ${args.sessionId} already exists`);
        }
        const record = {
            sessionId: args.sessionId,
            learnerId: args.learnerId,
            packId: args.packId,
            packVersion: args.packVersion,
            startedAt: args.now,
            endedAt: null,
            plan: args.plan,
            shownItemIds: [],
            itemsAnswered: 0,
            plannerSnapshot: args.plannerSnapshot,
        };
        this.sessions.set(args.sessionId, record);
        return cloneRecord(record);
    }
    /**
     * Lookup by sessionId. Returns undefined if not present.
     */
    getSession(sessionId) {
        const r = this.sessions.get(sessionId);
        return r ? cloneRecord(r) : undefined;
    }
    /**
     * Convenience: get just the plan.
     */
    getSessionPlan(sessionId) {
        return this.sessions.get(sessionId)?.plan;
    }
    /**
     * Find the most-recently-started in-flight session for a (learner, pack).
     * Returns undefined if all sessions are ended or none exist.
     */
    findActiveSession(learnerId, packId) {
        let best;
        for (const r of this.sessions.values()) {
            if (r.learnerId === learnerId &&
                r.packId === packId &&
                r.endedAt === null &&
                (best === undefined || r.startedAt > best.startedAt)) {
                best = r;
            }
        }
        return best ? cloneRecord(best) : undefined;
    }
    /**
     * Record an item being shown to the learner.
     * Idempotent on duplicate itemId — does not double-count.
     */
    recordItemShown(sessionId, itemId) {
        const r = this.requireActive(sessionId);
        if (!r.shownItemIds.includes(itemId)) {
            r.shownItemIds.push(itemId);
        }
    }
    /**
     * Record an item being answered. Increments itemsAnswered.
     *
     * Note: idempotency is the caller's responsibility — if the same answer
     * is posted twice we'll count it twice. Use OptimisticLockingStateStore
     * (H-1.D.4) to guard against that at the persistence layer.
     */
    recordItemAnswered(sessionId) {
        const r = this.requireActive(sessionId);
        r.itemsAnswered += 1;
    }
    /**
     * Finalize a session.
     * Throws if already ended (caller should checkActive first if optional).
     */
    endSession(sessionId, now) {
        const r = this.sessions.get(sessionId);
        if (!r)
            throw new Error(`Session ${sessionId} not found`);
        if (r.endedAt !== null) {
            throw new Error(`Session ${sessionId} already ended at ${r.endedAt}`);
        }
        r.endedAt = now;
        return cloneRecord(r);
    }
    /**
     * Restore a previously-serialized session record. Used after process
     * restart or to replay a session from persisted state.
     *
     * If a session with the same ID already exists in the manager, it is
     * overwritten — the persisted record wins.
     */
    resumeSession(record) {
        this.sessions.set(record.sessionId, cloneRecord(record));
    }
    /**
     * Drop a single session from in-memory caches. Does NOT delete persisted
     * state — that's the caller's responsibility.
     */
    deleteSessionCaches(sessionId) {
        this.sessions.delete(sessionId);
    }
    /**
     * Drop all sessions from in-memory caches. Useful for tests + dev hot reload.
     */
    clearAllCaches() {
        this.sessions.clear();
    }
    /**
     * Snapshot for persistence. Returns sorted JSON for stable output.
     */
    serialize() {
        const records = Array.from(this.sessions.values());
        records.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
        // Map<string, NewItemCandidate>'s `newSkillsIntroduced` is a Set; serialize as array.
        const serialized = records.map((r) => ({
            ...r,
            plan: serializePlan(r.plan),
        }));
        return JSON.stringify(serialized);
    }
    /**
     * Restore from serialize() output.
     */
    static deserialize(data) {
        const m = new SessionLifecycleManager();
        const parsed = JSON.parse(data);
        for (const r of parsed) {
            m.sessions.set(r.sessionId, {
                ...r,
                plan: deserializePlan(r.plan),
            });
        }
        return m;
    }
    /**
     * Read-only iteration over all sessions (active + ended). Returns clones.
     */
    *allSessions() {
        for (const r of this.sessions.values()) {
            yield cloneRecord(r);
        }
    }
    /**
     * Count sessions matching a predicate. Useful for billing-soft-checks
     * etc. without exposing internal state.
     */
    countSessions(predicate) {
        let n = 0;
        for (const r of this.sessions.values()) {
            if (predicate(r))
                n++;
        }
        return n;
    }
    // -----------------------------------------------------------------------
    // private
    // -----------------------------------------------------------------------
    requireActive(sessionId) {
        const r = this.sessions.get(sessionId);
        if (!r)
            throw new Error(`Session ${sessionId} not found`);
        if (r.endedAt !== null) {
            throw new Error(`Session ${sessionId} already ended at ${r.endedAt}`);
        }
        return r;
    }
}
/**
 * Factory.
 */
export function createSessionLifecycleManager() {
    return new SessionLifecycleManager();
}
function serializePlan(plan) {
    return {
        ...plan,
        newSkillsIntroduced: Array.from(plan.newSkillsIntroduced),
    };
}
function deserializePlan(p) {
    return {
        ...p,
        newSkillsIntroduced: new Set(p.newSkillsIntroduced),
    };
}
function cloneRecord(r) {
    return {
        ...r,
        shownItemIds: [...r.shownItemIds],
        plan: {
            ...r.plan,
            reviews: [...r.plan.reviews],
            errors: [...r.plan.errors],
            newItems: [...r.plan.newItems],
            newSkillsIntroduced: new Set(r.plan.newSkillsIntroduced),
            allocation: { ...r.plan.allocation },
        },
    };
}
//# sourceMappingURL=SessionLifecycleManager.js.map