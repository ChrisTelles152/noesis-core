import { describe, it, expect } from 'vitest';
import {
  buildPlannerSnapshot,
  planFromSnapshot,
  serializePlannerSnapshot,
  deserializePlannerSnapshot,
  PLANNER_SNAPSHOT_VERSION,
  BudgetedSessionPlanner,
  DEFAULT_SESSION_BUDGET_CONFIG,
  type ReviewCandidate,
  type ErrorCandidate,
  type NewItemCandidate,
  type BuildSnapshotArgs,
} from '../planning/index.js';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

function review(itemId: string, skillId: string): ReviewCandidate {
  return { itemId, skillId, dueAt: T0 - 1000 };
}
function err(itemId: string, skillId: string): ErrorCandidate {
  return { itemId, skillId, accuracy: 0.3, lastErrorAt: T0 - 86_400_000 };
}
function newItem(itemId: string, skillId: string, isNewSkill = false): NewItemCandidate {
  return { itemId, skillId, isNewSkill };
}

function defaultArgs(over: Partial<BuildSnapshotArgs> = {}): BuildSnapshotArgs {
  return {
    capturedAt: T0,
    packId: 'pack-1',
    packVersion: '1.0.0',
    sessionNumber: 5,
    backlogGrowthSessions: 0,
    dueReviews: [review('r1', 's1'), review('r2', 's2')],
    recentErrors: [err('e1', 's3')],
    newItems: [newItem('n1', 's4', true)],
    ...over,
  };
}

describe('PLANNER_SNAPSHOT_VERSION', () => {
  it('is the current schema version', () => {
    expect(PLANNER_SNAPSHOT_VERSION).toBe('1.0.0');
  });
});

describe('buildPlannerSnapshot', () => {
  it('captures all required fields', () => {
    const s = buildPlannerSnapshot(defaultArgs());
    expect(s.version).toBe('1.0.0');
    expect(s.capturedAt).toBe(T0);
    expect(s.packId).toBe('pack-1');
    expect(s.packVersion).toBe('1.0.0');
    expect(s.sessionNumber).toBe(5);
    expect(s.backlogGrowthSessions).toBe(0);
    expect(s.dueReviews).toHaveLength(2);
    expect(s.recentErrors).toHaveLength(1);
    expect(s.newItems).toHaveLength(1);
    expect(s.config).toEqual(DEFAULT_SESSION_BUDGET_CONFIG);
  });

  it('defensive-copies input arrays — caller mutation does not affect snapshot', () => {
    const reviews = [review('r1', 's1')];
    const s = buildPlannerSnapshot(defaultArgs({ dueReviews: reviews }));
    reviews.push(review('hacked', 's999'));
    expect(s.dueReviews).toHaveLength(1);
    expect(s.dueReviews[0].itemId).toBe('r1');
  });

  it('defensive-copies individual candidate objects', () => {
    const reviews = [review('r1', 's1')];
    const s = buildPlannerSnapshot(defaultArgs({ dueReviews: reviews }));
    reviews[0].itemId = 'mutated';
    expect(s.dueReviews[0].itemId).toBe('r1');
  });

  it('honors a partial config override (deep-merged)', () => {
    const s = buildPlannerSnapshot(
      defaultArgs({
        config: { defaultBudget: 25, reviews: { targetFraction: 0.7, minReviews: 6 } },
      })
    );
    expect(s.config.defaultBudget).toBe(25);
    expect(s.config.reviews.targetFraction).toBe(0.7);
    // minBudget (not overridden) keeps default value:
    expect(s.config.minBudget).toBe(15);
  });
});

describe('planFromSnapshot', () => {
  it('produces the SessionPlan the snapshot inputs would have generated', () => {
    const s = buildPlannerSnapshot(defaultArgs());
    const plan = planFromSnapshot(s);
    expect(plan.budget).toBe(20);
    expect(plan.reviews).toHaveLength(2);
    expect(plan.errors).toHaveLength(1);
    expect(plan.newItems).toHaveLength(1);
  });

  it('uses the snapshot config by default (replay uses frozen config)', () => {
    const s = buildPlannerSnapshot(
      defaultArgs({ config: { defaultBudget: 18, minBudget: 18, maxBudget: 18 } })
    );
    const plan = planFromSnapshot(s);
    expect(plan.budget).toBe(18);
  });

  it('honors a caller-supplied planner override (cross-config replay)', () => {
    const s = buildPlannerSnapshot(defaultArgs());
    const altPlanner = new BudgetedSessionPlanner({
      defaultBudget: 8,
      minBudget: 8,
      maxBudget: 8,
    });
    const plan = planFromSnapshot(s, altPlanner);
    expect(plan.budget).toBe(8);
  });

  it('is replay-deterministic — same snapshot twice yields the same plan', () => {
    const s = buildPlannerSnapshot(defaultArgs());
    expect(planFromSnapshot(s)).toEqual(planFromSnapshot(s));
  });

  it('produces a plan with the correct backlogReduced flag from snapshot', () => {
    const s = buildPlannerSnapshot(defaultArgs({ backlogGrowthSessions: 5 }));
    const plan = planFromSnapshot(s);
    expect(plan.backlogReduced).toBe(true);
  });
});

describe('serializePlannerSnapshot / deserializePlannerSnapshot', () => {
  it('round-trips losslessly', () => {
    const s = buildPlannerSnapshot(defaultArgs());
    const restored = deserializePlannerSnapshot(serializePlannerSnapshot(s));
    expect(restored).toEqual(s);
  });

  it('preserves replay equivalence — restored snapshot replays to the same plan', () => {
    const s = buildPlannerSnapshot(defaultArgs());
    const planA = planFromSnapshot(s);
    const restored = deserializePlannerSnapshot(serializePlannerSnapshot(s));
    const planB = planFromSnapshot(restored);
    expect(planA).toEqual(planB);
  });

  it('throws on schema-version mismatch', () => {
    const s = buildPlannerSnapshot(defaultArgs());
    const tampered = JSON.stringify({ ...s, version: '0.9.0' });
    expect(() => deserializePlannerSnapshot(tampered)).toThrow(/version mismatch/);
  });

  it('throws on malformed input (missing config)', () => {
    const malformed = JSON.stringify({
      version: '1.0.0',
      capturedAt: T0,
      packId: 'p',
      packVersion: '1',
      sessionNumber: 1,
      backlogGrowthSessions: 0,
      dueReviews: [],
      recentErrors: [],
      newItems: [],
      // config missing
    });
    expect(() => deserializePlannerSnapshot(malformed)).toThrow(/malformed/);
  });

  it('throws on malformed input (dueReviews not an array)', () => {
    const malformed = JSON.stringify({
      version: '1.0.0',
      capturedAt: T0,
      packId: 'p',
      packVersion: '1',
      sessionNumber: 1,
      backlogGrowthSessions: 0,
      dueReviews: null,
      recentErrors: [],
      newItems: [],
      config: DEFAULT_SESSION_BUDGET_CONFIG,
    });
    expect(() => deserializePlannerSnapshot(malformed)).toThrow(/malformed/);
  });
});

describe('PlannerSnapshot — equivalence with direct planner.planSession()', () => {
  it('a snapshot replayed produces the same plan as calling planSession directly', () => {
    const args = defaultArgs();
    const direct = new BudgetedSessionPlanner(args.config).planSession({
      sessionNumber: args.sessionNumber,
      dueReviews: args.dueReviews,
      recentErrors: args.recentErrors,
      newItems: args.newItems,
      backlogGrowthSessions: args.backlogGrowthSessions,
      now: args.capturedAt,
    });
    const replayed = planFromSnapshot(buildPlannerSnapshot(args));
    expect(direct).toEqual(replayed);
  });
});
