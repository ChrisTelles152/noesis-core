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
// =============================================================================
// Pure aggregator
// =============================================================================
/**
 * Compute session metrics from an attempt list. Pure — no I/O, no clock.
 *
 * Order-insensitive: shuffling the input does not change the output (modulo
 * floating-point sum order, which the test suite avoids).
 */
export function computeSessionMetrics(attempts) {
    if (attempts.length === 0)
        return emptyMetrics();
    let correctCount = 0;
    let totalResponseTimeMs = 0;
    const allRTs = [];
    const itemIds = new Set();
    const skillIds = new Set();
    const byChannelBuckets = new Map();
    const bySkillBuckets = new Map();
    for (const a of attempts) {
        if (a.correct)
            correctCount++;
        totalResponseTimeMs += a.responseTimeMs;
        allRTs.push(a.responseTimeMs);
        itemIds.add(a.itemId);
        skillIds.add(a.skillId);
        if (a.channel !== undefined) {
            const bucket = byChannelBuckets.get(a.channel) ?? [];
            bucket.push(a);
            byChannelBuckets.set(a.channel, bucket);
        }
        const skillBucket = bySkillBuckets.get(a.skillId) ?? [];
        skillBucket.push(a);
        bySkillBuckets.set(a.skillId, skillBucket);
    }
    const totalAttempts = attempts.length;
    const incorrectCount = totalAttempts - correctCount;
    const accuracy = correctCount / totalAttempts;
    const medianResponseTimeMs = median(allRTs);
    const p90ResponseTimeMs = percentile(allRTs, 0.9);
    return {
        totalAttempts,
        correctCount,
        incorrectCount,
        accuracy,
        uniqueItemsAttempted: itemIds.size,
        uniqueSkillsAttempted: skillIds.size,
        totalResponseTimeMs,
        medianResponseTimeMs,
        p90ResponseTimeMs,
        byChannel: aggregateByChannel(byChannelBuckets),
        bySkill: aggregateBySkill(bySkillBuckets),
    };
}
function emptyMetrics() {
    return {
        totalAttempts: 0,
        correctCount: 0,
        incorrectCount: 0,
        accuracy: 0,
        uniqueItemsAttempted: 0,
        uniqueSkillsAttempted: 0,
        totalResponseTimeMs: 0,
        medianResponseTimeMs: 0,
        p90ResponseTimeMs: 0,
        byChannel: {},
        bySkill: {},
    };
}
function aggregateByChannel(buckets) {
    const out = {};
    const sortedEntries = Array.from(buckets.entries()).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    for (const [ch, records] of sortedEntries) {
        const correct = records.filter((r) => r.correct).length;
        out[ch] = {
            attempts: records.length,
            correctCount: correct,
            accuracy: records.length > 0 ? correct / records.length : 0,
            medianResponseTimeMs: median(records.map((r) => r.responseTimeMs)),
        };
    }
    return out;
}
function aggregateBySkill(buckets) {
    const out = {};
    const sortedEntries = Array.from(buckets.entries()).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    for (const [skill, records] of sortedEntries) {
        const correct = records.filter((r) => r.correct).length;
        const channels = new Set();
        for (const r of records) {
            if (r.channel !== undefined)
                channels.add(r.channel);
        }
        out[skill] = {
            attempts: records.length,
            correctCount: correct,
            accuracy: records.length > 0 ? correct / records.length : 0,
            channels: Array.from(channels).sort(),
        };
    }
    return out;
}
/** Median of a numeric array. Returns 0 for empty input. */
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
/**
 * Linear-interpolation percentile. p in [0, 1]. Returns 0 for empty input.
 *
 * Uses the simple "rank = p * (n - 1)" formula with linear interpolation.
 * Deterministic across JS engines.
 */
function percentile(values, p) {
    if (values.length === 0)
        return 0;
    if (values.length === 1)
        return values[0];
    const sorted = [...values].sort((a, b) => a - b);
    const rank = p * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi)
        return sorted[lo];
    const frac = rank - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
// =============================================================================
// Stateful logger
// =============================================================================
/**
 * Per-session attempt buffer with on-demand metrics computation.
 *
 * One instance per app process; manages buffers across multiple sessions
 * concurrently. Caller invokes recordAttempt() during the session and
 * computeMetrics() / serialize() at session end.
 */
export class SessionMetricsLogger {
    /** sessionId -> attempts in insertion order */
    buffers = new Map();
    /**
     * Append one attempt to a session's buffer. The session is implicitly
     * created on first call.
     */
    recordAttempt(sessionId, attempt) {
        const buf = this.buffers.get(sessionId) ?? [];
        buf.push({ ...attempt });
        this.buffers.set(sessionId, buf);
    }
    /**
     * Compute metrics for a session's current buffer. Pure given the buffer
     * snapshot — re-computes on every call (cheap; the buffer is small per
     * session).
     *
     * Returns empty metrics for an unknown sessionId.
     */
    computeMetrics(sessionId) {
        return computeSessionMetrics(this.buffers.get(sessionId) ?? []);
    }
    /** Number of attempts buffered for a session. */
    getAttemptCount(sessionId) {
        return this.buffers.get(sessionId)?.length ?? 0;
    }
    /** Defensive copy of a session's buffer. */
    getAttempts(sessionId) {
        return (this.buffers.get(sessionId) ?? []).map((a) => ({ ...a }));
    }
    /** Drop one session's buffer. */
    reset(sessionId) {
        this.buffers.delete(sessionId);
    }
    /** Drop all session buffers. */
    clearAll() {
        this.buffers.clear();
    }
    /**
     * Serialize all session buffers for persistence / replay.
     * Sorted by sessionId for stable output.
     */
    serialize() {
        const entries = Array.from(this.buffers.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        return JSON.stringify(entries);
    }
    /**
     * Restore from serialize() output. Existing buffers are preserved and
     * the restored data is merged in (overwriting any same-key sessions).
     */
    static deserialize(data) {
        const m = new SessionMetricsLogger();
        const parsed = JSON.parse(data);
        for (const [sessionId, buf] of parsed) {
            m.buffers.set(sessionId, buf);
        }
        return m;
    }
}
/** Factory. */
export function createSessionMetricsLogger() {
    return new SessionMetricsLogger();
}
//# sourceMappingURL=SessionMetricsLogger.js.map