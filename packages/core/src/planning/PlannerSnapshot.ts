/**
 * PlannerSnapshot — frozen planner inputs for deterministic replay
 *
 * Captures everything BudgetedSessionPlanner needs to plan a session, in a
 * serializable shape. Replaying the snapshot through planFromSnapshot()
 * produces the same SessionPlan that was generated at capture time —
 * regardless of how the underlying data sources have evolved.
 *
 * This is the lynchpin of session-replay determinism: noesis-proof's
 * equivalence framework reads a captured snapshot, runs it through both
 * the old (vertical) and new (core) planner impls, and asserts the two
 * SessionPlan outputs match byte-for-byte.
 *
 * Ported from noesis-eng/banjul/src/lib/noesis/plannerSnapshot.ts.
 *
 * KEY DIFFERENCES FROM SOURCE:
 *
 *   1. The eng version has a `capturePlannerSnapshot()` that does DB queries
 *      (`getDueItems`, `getRecentErrorItems`, `getWeakSkills`, etc.). Core
 *      never queries — it only consumes already-fetched data via
 *      buildSnapshot(). The DB-fetching adapter lives in noesis-app.
 *
 *   2. The snapshot shape aligns with BudgetedSessionPlanner's input types
 *      (ReviewCandidate / ErrorCandidate / NewItemCandidate) instead of
 *      eng's bespoke SnapshotFSRSItem / SnapshotWeakSkill — one fewer
 *      transformation layer between snapshot and replay.
 *
 *   3. Frozen config travels in the snapshot for verification: replay uses
 *      the snapshot's config by default, falling back to a caller-supplied
 *      planner only when explicitly provided. This guards against config
 *      drift between capture and replay.
 *
 *   4. Pure: no I/O, no clock. capturedAt is a parameter.
 */

import {
  BudgetedSessionPlanner,
  DEFAULT_SESSION_BUDGET_CONFIG,
  type SessionBudgetConfig,
  type SessionPlan,
  type ReviewCandidate,
  type ErrorCandidate,
  type NewItemCandidate,
} from './BudgetedSessionPlanner.js';

/** Schema version of the snapshot shape. Bump on any breaking change. */
export const PLANNER_SNAPSHOT_VERSION = '1.0.0' as const;

/**
 * Frozen planner inputs at session-start.
 *
 * Caller is responsible for sorting candidates the same way the planner
 * expects them (top-priority first). The snapshot stores them in that
 * order; replay uses them as-is.
 */
export interface PlannerSnapshot {
  version: typeof PLANNER_SNAPSHOT_VERSION;
  /** ms since epoch — timestamp at which the snapshot was captured. */
  capturedAt: number;
  packId: string;
  packVersion: string;
  sessionNumber: number;
  /** Pre-computed via BudgetedSessionPlanner.detectBacklogGrowthSessions(). */
  backlogGrowthSessions: number;
  dueReviews: ReviewCandidate[];
  recentErrors: ErrorCandidate[];
  newItems: NewItemCandidate[];
  /** Frozen at capture so replay does not depend on a config that may have changed. */
  config: SessionBudgetConfig;
}

export interface BuildSnapshotArgs {
  capturedAt: number;
  packId: string;
  packVersion: string;
  sessionNumber: number;
  backlogGrowthSessions: number;
  dueReviews: ReviewCandidate[];
  recentErrors: ErrorCandidate[];
  newItems: NewItemCandidate[];
  /** Optional — defaults to DEFAULT_SESSION_BUDGET_CONFIG. */
  config?: Partial<SessionBudgetConfig>;
}

/**
 * Build a snapshot from already-fetched inputs. Pure — no I/O.
 *
 * Defensive-copies all input arrays so later caller mutations cannot drift
 * the snapshot's contents.
 */
export function buildPlannerSnapshot(args: BuildSnapshotArgs): PlannerSnapshot {
  const config: SessionBudgetConfig = {
    defaultBudget: args.config?.defaultBudget ?? DEFAULT_SESSION_BUDGET_CONFIG.defaultBudget,
    minBudget: args.config?.minBudget ?? DEFAULT_SESSION_BUDGET_CONFIG.minBudget,
    maxBudget: args.config?.maxBudget ?? DEFAULT_SESSION_BUDGET_CONFIG.maxBudget,
    reviews: { ...DEFAULT_SESSION_BUDGET_CONFIG.reviews, ...(args.config?.reviews ?? {}) },
    errors: { ...DEFAULT_SESSION_BUDGET_CONFIG.errors, ...(args.config?.errors ?? {}) },
    newItems: { ...DEFAULT_SESSION_BUDGET_CONFIG.newItems, ...(args.config?.newItems ?? {}) },
    backlog: { ...DEFAULT_SESSION_BUDGET_CONFIG.backlog, ...(args.config?.backlog ?? {}) },
  };
  return {
    version: PLANNER_SNAPSHOT_VERSION,
    capturedAt: args.capturedAt,
    packId: args.packId,
    packVersion: args.packVersion,
    sessionNumber: args.sessionNumber,
    backlogGrowthSessions: args.backlogGrowthSessions,
    dueReviews: args.dueReviews.map((r) => ({ ...r })),
    recentErrors: args.recentErrors.map((e) => ({ ...e })),
    newItems: args.newItems.map((n) => ({ ...n })),
    config,
  };
}

/**
 * Replay a snapshot through the planner. Returns the SessionPlan that
 * would have been produced at capture time.
 *
 * @param snapshot  Frozen planner inputs.
 * @param planner   Optional — if omitted, a BudgetedSessionPlanner is
 *                  constructed from snapshot.config. Pass an explicit
 *                  planner only if you want to deliberately replay against
 *                  a different config (e.g. equivalence testing across
 *                  config variants).
 */
export function planFromSnapshot(
  snapshot: PlannerSnapshot,
  planner?: BudgetedSessionPlanner
): SessionPlan {
  const p = planner ?? new BudgetedSessionPlanner(snapshot.config);
  return p.planSession({
    sessionNumber: snapshot.sessionNumber,
    dueReviews: snapshot.dueReviews,
    recentErrors: snapshot.recentErrors,
    newItems: snapshot.newItems,
    backlogGrowthSessions: snapshot.backlogGrowthSessions,
    now: snapshot.capturedAt,
  });
}

/**
 * Serialize for persistence.
 */
export function serializePlannerSnapshot(snapshot: PlannerSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Restore a snapshot. Validates schema version + minimal shape; throws on
 * mismatch so callers can detect stale snapshots after a core upgrade.
 */
export function deserializePlannerSnapshot(data: string): PlannerSnapshot {
  const parsed = JSON.parse(data) as PlannerSnapshot;
  if (parsed.version !== PLANNER_SNAPSHOT_VERSION) {
    throw new Error(
      `PlannerSnapshot version mismatch: expected ${PLANNER_SNAPSHOT_VERSION}, got ${parsed.version}`
    );
  }
  if (!parsed.config || !Array.isArray(parsed.dueReviews)) {
    throw new Error('PlannerSnapshot is malformed (missing config or dueReviews)');
  }
  return parsed;
}
