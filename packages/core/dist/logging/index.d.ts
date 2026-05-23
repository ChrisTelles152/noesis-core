/**
 * Session Metrics Logging Module
 *
 * Pure session-level attempt aggregation. Compute totals + per-channel +
 * per-skill breakdowns from a learner attempt list. No I/O — DB-write
 * adapters live in the app layer.
 */
export { SessionMetricsLogger, createSessionMetricsLogger, computeSessionMetrics, type AttemptRecord, type ChannelMetrics, type SkillMetrics, type SessionMetrics, } from './SessionMetricsLogger.js';
//# sourceMappingURL=index.d.ts.map