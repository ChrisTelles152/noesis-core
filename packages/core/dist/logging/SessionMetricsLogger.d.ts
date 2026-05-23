/**
 * SessionMetricsLogger — pure session-level attempt aggregation
 *
 * Two surfaces:
 *
 *   1. computeSessionMetrics(attempts) — pure function. Take a list of
 *      AttemptRecord, produce per-session totals + per-channel +
 *      per-skill breakdowns. Use this directly if the app already owns
 *      the attempt log.
 *
 *   2. SessionMetricsLogger class — stateful per-session attempt buffer.
 *      recordAttempt(sessionId, attempt) appends; computeMetrics(sessionId)
 *      returns aggregates; serialize / deserialize for replay + persistence.
 *      Use this if you want core to manage the buffer for you.
 *
 * Ported from noesis-eng/banjul/src/lib/noesis/loggingService.ts.
 *
 * KEY DIFFERENCES FROM SOURCE:
 *
 *   1. No I/O. Eng's logSessionMetrics writes to Supabase; core only
 *      computes the aggregate. The DB-write adapter lives in noesis-app.
 *
 *   2. Channel IDs are opaque strings (pack-defined). Eng hardcodes
 *      RECOG_MC / CLOZE / PROD_TYPED column names and writes to the
 *      "recog_mc_accuracy / prod_typed_accuracy" legacy schema. That's a
 *      noesis-app-vs-vertical schema problem to resolve at H-3/H-4
 *      push-down time, NOT a core concern.
 *
 *   3. medianResponseTimeMs and p90ResponseTimeMs are computed
 *      deterministically. Sort, then index — replay-safe across runs and
 *      JS engines.
 *
 *   4. The aggregator is purely additive. No "correctRate over time" or
 *      streaks — those are pack-tunable and live in the app metric layer.
 */
/**
 * One learner attempt as fed into the aggregator.
 * Channel and timestamp are optional — older event logs that predate
 * multi-channel BKT or that lack precise timestamps still aggregate.
 */
export interface AttemptRecord {
    itemId: string;
    skillId: string;
    /** Pack-defined channel ID; undefined for single-channel verticals. */
    channel?: string;
    correct: boolean;
    /** Wall-clock latency. Used for median / p90 / per-channel-median. */
    responseTimeMs: number;
    /** ms since epoch — used for ordering only; aggregator does not gate on it. */
    timestamp: number;
}
export interface ChannelMetrics {
    attempts: number;
    correctCount: number;
    /** correctCount / attempts (0 if attempts=0). */
    accuracy: number;
    medianResponseTimeMs: number;
}
export interface SkillMetrics {
    attempts: number;
    correctCount: number;
    accuracy: number;
    /** Channels this skill was attempted on (sorted lexicographic). */
    channels: string[];
}
export interface SessionMetrics {
    totalAttempts: number;
    correctCount: number;
    incorrectCount: number;
    /** correctCount / totalAttempts (0 if totalAttempts=0). */
    accuracy: number;
    uniqueItemsAttempted: number;
    uniqueSkillsAttempted: number;
    totalResponseTimeMs: number;
    medianResponseTimeMs: number;
    p90ResponseTimeMs: number;
    /** Per-channel breakdown. Keys are pack-defined; sorted lexicographically. */
    byChannel: Record<string, ChannelMetrics>;
    /** Per-skill breakdown. Keys sorted lexicographically. */
    bySkill: Record<string, SkillMetrics>;
}
/**
 * Compute session metrics from an attempt list. Pure — no I/O, no clock.
 *
 * Order-insensitive: shuffling the input does not change the output (modulo
 * floating-point sum order, which the test suite avoids).
 */
export declare function computeSessionMetrics(attempts: readonly AttemptRecord[]): SessionMetrics;
/**
 * Per-session attempt buffer with on-demand metrics computation.
 *
 * One instance per app process; manages buffers across multiple sessions
 * concurrently. Caller invokes recordAttempt() during the session and
 * computeMetrics() / serialize() at session end.
 */
export declare class SessionMetricsLogger {
    /** sessionId -> attempts in insertion order */
    private readonly buffers;
    /**
     * Append one attempt to a session's buffer. The session is implicitly
     * created on first call.
     */
    recordAttempt(sessionId: string, attempt: AttemptRecord): void;
    /**
     * Compute metrics for a session's current buffer. Pure given the buffer
     * snapshot — re-computes on every call (cheap; the buffer is small per
     * session).
     *
     * Returns empty metrics for an unknown sessionId.
     */
    computeMetrics(sessionId: string): SessionMetrics;
    /** Number of attempts buffered for a session. */
    getAttemptCount(sessionId: string): number;
    /** Defensive copy of a session's buffer. */
    getAttempts(sessionId: string): AttemptRecord[];
    /** Drop one session's buffer. */
    reset(sessionId: string): void;
    /** Drop all session buffers. */
    clearAll(): void;
    /**
     * Serialize all session buffers for persistence / replay.
     * Sorted by sessionId for stable output.
     */
    serialize(): string;
    /**
     * Restore from serialize() output. Existing buffers are preserved and
     * the restored data is merged in (overwriting any same-key sessions).
     */
    static deserialize(data: string): SessionMetricsLogger;
}
/** Factory. */
export declare function createSessionMetricsLogger(): SessionMetricsLogger;
//# sourceMappingURL=SessionMetricsLogger.d.ts.map