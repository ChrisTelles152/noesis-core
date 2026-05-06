import { describe, it, expect } from 'vitest';
import {
  BudgetedSessionPlanner,
  createBudgetedSessionPlanner,
  DEFAULT_SESSION_BUDGET_CONFIG,
  type SessionPlanInput,
  type ReviewCandidate,
  type ErrorCandidate,
  type NewItemCandidate,
} from '../planning/index.js';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const ONE_DAY = 86_400_000;

function review(itemId: string, skillId: string): ReviewCandidate {
  return { itemId, skillId, dueAt: NOW - 1000 };
}
function err(itemId: string, skillId: string, accuracy: number, daysAgo = 1): ErrorCandidate {
  return { itemId, skillId, accuracy, lastErrorAt: NOW - daysAgo * ONE_DAY };
}
function newItem(itemId: string, skillId: string, isNewSkill = false): NewItemCandidate {
  return { itemId, skillId, isNewSkill };
}

function input(overrides: Partial<SessionPlanInput> = {}): SessionPlanInput {
  return {
    sessionNumber: 1,
    dueReviews: [],
    recentErrors: [],
    newItems: [],
    backlogGrowthSessions: 0,
    now: NOW,
    ...overrides,
  };
}

describe('DEFAULT_SESSION_BUDGET_CONFIG sanity', () => {
  it('matches converged eng+math values with budget=20', () => {
    expect(DEFAULT_SESSION_BUDGET_CONFIG.defaultBudget).toBe(20);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.minBudget).toBe(15);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.maxBudget).toBe(25);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.reviews.targetFraction).toBe(0.6);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.reviews.minReviews).toBe(6);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.errors.targetFraction).toBe(0.25);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.errors.maxItems).toBe(5);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.errors.weaknessThreshold).toBe(0.6);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.errors.lookbackDays).toBe(7);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.newItems.normalCap).toBe(4);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.newItems.onboardingCap).toBe(6);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.newItems.maxNewSkillsEarly).toBe(1);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.newItems.maxNewSkillsLater).toBe(2);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.newItems.earlySessionThreshold).toBe(10);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.backlog.growthSessionsBeforeReduction).toBe(3);
    expect(DEFAULT_SESSION_BUDGET_CONFIG.backlog.reductionFactor).toBe(0.5);
  });
});

describe('BudgetedSessionPlanner — budget allocation', () => {
  const planner = new BudgetedSessionPlanner();

  it('allocates 60/25/15 (reviews/errors/new) at default budget=20', () => {
    const plan = planner.planSession(input({ sessionNumber: 5 }));
    expect(plan.budget).toBe(20);
    expect(plan.allocation.reviewSlots).toBe(12); // floor(20 * 0.6) but clamped to ≥6
    expect(plan.allocation.errorSlots).toBe(5); // floor(20 * 0.25) capped at 5
    expect(plan.allocation.newSlots).toBe(3); // 20 - 12 - 5, clamped by normalCap=4
  });

  it('honors minReviews when budget * targetFraction is small', () => {
    const small = new BudgetedSessionPlanner({ defaultBudget: 8, minBudget: 8 });
    const plan = small.planSession(input({ sessionNumber: 5 }));
    expect(plan.allocation.reviewSlots).toBe(6); // minReviews wins
  });

  it('caps errorSlots at maxItems=5 even when fraction would allow more', () => {
    const big = new BudgetedSessionPlanner({ defaultBudget: 50, maxBudget: 50 });
    const plan = big.planSession(input({ sessionNumber: 5 }));
    expect(plan.allocation.errorSlots).toBe(5); // 50 * 0.25 = 12.5 → still capped at 5
  });
});

describe('BudgetedSessionPlanner — backlog reduction', () => {
  const planner = new BudgetedSessionPlanner();

  it('does NOT reduce when backlogGrowthSessions < threshold', () => {
    const plan = planner.planSession(input({ backlogGrowthSessions: 2 }));
    expect(plan.backlogReduced).toBe(false);
    expect(plan.budget).toBe(20);
  });

  it('reduces when backlogGrowthSessions >= threshold (default 3)', () => {
    const plan = planner.planSession(input({ backlogGrowthSessions: 3 }));
    expect(plan.backlogReduced).toBe(true);
    // 20 * 0.5 = 10, but minBudget=15 clamps it back up
    expect(plan.budget).toBe(15);
  });

  it('reduced budget can fall to minBudget but not below', () => {
    const tight = new BudgetedSessionPlanner({ defaultBudget: 12, minBudget: 8 });
    const plan = tight.planSession(input({ backlogGrowthSessions: 5 }));
    expect(plan.backlogReduced).toBe(true);
    expect(plan.budget).toBe(8); // 12 * 0.5 = 6, clamped up to 8
  });

  it('honors a custom reduction factor', () => {
    const aggressive = new BudgetedSessionPlanner({
      defaultBudget: 30,
      maxBudget: 30,
      backlog: { growthSessionsBeforeReduction: 1, reductionFactor: 0.3 },
    });
    const plan = aggressive.planSession(input({ backlogGrowthSessions: 1 }));
    expect(plan.budget).toBe(15); // 30 * 0.3 = 9, clamped to minBudget=15
  });
});

describe('BudgetedSessionPlanner — review selection', () => {
  const planner = new BudgetedSessionPlanner();

  it('returns top N reviews preserving caller order', () => {
    const reviews = [review('a', 's1'), review('b', 's2'), review('c', 's3')];
    const plan = planner.planSession(input({ sessionNumber: 5, dueReviews: reviews }));
    // reviewSlots is 12; we only have 3 → take all 3 in order.
    expect(plan.reviews.map((r) => r.itemId)).toEqual(['a', 'b', 'c']);
  });

  it('clamps to available reviews when fewer than slots', () => {
    const reviews = [review('a', 's1'), review('b', 's2')];
    const plan = planner.planSession(input({ dueReviews: reviews }));
    expect(plan.reviews).toHaveLength(2);
  });

  it('takes exactly reviewSlots when more reviews are available', () => {
    const reviews = Array.from({ length: 20 }, (_, i) => review(`r${i}`, `s${i}`));
    const plan = planner.planSession(input({ sessionNumber: 5, dueReviews: reviews }));
    expect(plan.reviews).toHaveLength(plan.allocation.reviewSlots);
  });
});

describe('BudgetedSessionPlanner — error selection (weakness + lookback)', () => {
  const planner = new BudgetedSessionPlanner();

  it('selects items with accuracy < weaknessThreshold (default 0.6)', () => {
    const errs = [
      err('a', 's1', 0.5),
      err('b', 's2', 0.3),
      err('c', 's3', 0.7), // not weak enough
      err('d', 's4', 0.4),
    ];
    const plan = planner.planSession(input({ recentErrors: errs }));
    expect(plan.errors.map((e) => e.itemId)).toEqual(['a', 'b', 'd']);
  });

  it('filters items older than lookbackDays (default 7)', () => {
    const errs = [
      err('recent', 's1', 0.4, 1),
      err('week-ago', 's2', 0.4, 6),
      err('two-weeks', 's3', 0.4, 14), // too old
    ];
    const plan = planner.planSession(input({ recentErrors: errs }));
    expect(plan.errors.map((e) => e.itemId)).toEqual(['recent', 'week-ago']);
  });

  it('includes the boundary day (exactly lookbackDays old)', () => {
    const errs = [err('boundary', 's', 0.4, 7)];
    const plan = planner.planSession(input({ recentErrors: errs }));
    expect(plan.errors).toHaveLength(1);
  });

  it('caps at errorSlots even when more weak+recent items exist', () => {
    const errs = Array.from({ length: 20 }, (_, i) => err(`e${i}`, `s${i}`, 0.3));
    const plan = planner.planSession(input({ recentErrors: errs }));
    expect(plan.errors).toHaveLength(plan.allocation.errorSlots);
  });
});

describe('BudgetedSessionPlanner — new item caps', () => {
  const planner = new BudgetedSessionPlanner();

  it('honors normalCap=4 in normal sessions with reviews available', () => {
    const items = Array.from({ length: 10 }, (_, i) => newItem(`n${i}`, `s${i}`));
    const reviews = [review('r', 's0')]; // make queue non-empty
    const plan = planner.planSession(
      input({ sessionNumber: 5, dueReviews: reviews, newItems: items })
    );
    // newSlots is min(3, normalCap=4) = 3
    expect(plan.newItems).toHaveLength(plan.allocation.newSlots);
    expect(plan.allocation.newSlots).toBe(3);
  });

  it('honors onboardingCap=6 in first 3 sessions', () => {
    const items = Array.from({ length: 10 }, (_, i) => newItem(`n${i}`, `s${i}`));
    const reviews = [review('r', 's0')];
    const plan = planner.planSession(
      input({ sessionNumber: 1, dueReviews: reviews, newItems: items })
    );
    // budget=20 - reviewSlots(12) - errorSlots(5) = 3 raw, capped by onboardingCap=6 → 3
    // (raw is the binding cap here; 3 < 6 = onboarding cap)
    expect(plan.allocation.newSlots).toBe(3);
  });

  it('honors emptyQueueCap=8 when due queue is empty', () => {
    const items = Array.from({ length: 20 }, (_, i) => newItem(`n${i}`, `s${i}`));
    const plan = planner.planSession(input({ sessionNumber: 5, newItems: items }));
    // No reviews → emptyQueueCap=8 applies; raw slots = 20 - 12 - 5 = 3 → 3 (still binding)
    expect(plan.allocation.newSlots).toBe(3);
  });

  it('emptyQueue path applies the larger cap when raw slots exceed it', () => {
    // To exercise the emptyQueueCap path, give the planner more leftover budget.
    const planner2 = new BudgetedSessionPlanner({
      defaultBudget: 25,
      maxBudget: 25,
      reviews: { targetFraction: 0.0, minReviews: 0 },
      errors: { ...DEFAULT_SESSION_BUDGET_CONFIG.errors, targetFraction: 0.0 },
    });
    const items = Array.from({ length: 20 }, (_, i) => newItem(`n${i}`, `s${i}`));
    const plan = planner2.planSession(input({ sessionNumber: 5, newItems: items }));
    // Empty queue → emptyQueueCap=8
    expect(plan.allocation.newSlots).toBe(8);
  });
});

describe('BudgetedSessionPlanner — new-skills cap', () => {
  it('limits to maxNewSkillsEarly=1 in early sessions (≤ session 10)', () => {
    const planner = new BudgetedSessionPlanner({
      defaultBudget: 25,
      maxBudget: 25,
      reviews: { targetFraction: 0.0, minReviews: 0 },
      errors: { ...DEFAULT_SESSION_BUDGET_CONFIG.errors, targetFraction: 0.0 },
    });
    const items = [
      newItem('n1', 'skill_a', true),
      newItem('n2', 'skill_a', true),
      newItem('n3', 'skill_b', true), // would exceed early cap
      newItem('n4', 'skill_a', true),
    ];
    const plan = planner.planSession(input({ sessionNumber: 5, newItems: items }));
    expect(plan.newSkillsIntroduced).toEqual(new Set(['skill_a']));
    expect(plan.newItems.map((i) => i.itemId)).toEqual(['n1', 'n2']);
  });

  it('allows maxNewSkillsLater=2 past the early threshold', () => {
    const planner = new BudgetedSessionPlanner({
      defaultBudget: 25,
      maxBudget: 25,
      reviews: { targetFraction: 0.0, minReviews: 0 },
      errors: { ...DEFAULT_SESSION_BUDGET_CONFIG.errors, targetFraction: 0.0 },
    });
    const items = [
      newItem('n1', 'skill_a', true),
      newItem('n2', 'skill_b', true),
      newItem('n3', 'skill_c', true), // would exceed later cap
    ];
    const plan = planner.planSession(input({ sessionNumber: 11, newItems: items }));
    expect(plan.newSkillsIntroduced).toEqual(new Set(['skill_a', 'skill_b']));
  });

  it('does NOT count items from already-introduced skills against the new-skills cap', () => {
    const planner = new BudgetedSessionPlanner({
      defaultBudget: 25,
      maxBudget: 25,
      reviews: { targetFraction: 0.0, minReviews: 0 },
      errors: { ...DEFAULT_SESSION_BUDGET_CONFIG.errors, targetFraction: 0.0 },
    });
    const items = [
      newItem('n1', 'skill_a', false), // not new — already introduced
      newItem('n2', 'skill_b', true),
      newItem('n3', 'skill_a', false),
    ];
    const plan = planner.planSession(input({ sessionNumber: 5, newItems: items }));
    expect(plan.newSkillsIntroduced).toEqual(new Set(['skill_b']));
    expect(plan.newItems.map((i) => i.itemId)).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('BudgetedSessionPlanner — per-skill new-item cap', () => {
  const planner = new BudgetedSessionPlanner({
    defaultBudget: 25,
    maxBudget: 25,
    reviews: { targetFraction: 0.0, minReviews: 0 },
    errors: { ...DEFAULT_SESSION_BUDGET_CONFIG.errors, targetFraction: 0.0 },
  });

  it('caps at maxNewItemsPerSkillEarly=2 for new skills in early sessions', () => {
    const items = [
      newItem('n1', 'skill_a', true),
      newItem('n2', 'skill_a', true),
      newItem('n3', 'skill_a', true), // exceeds 2 per skill
      newItem('n4', 'skill_a', true),
    ];
    const plan = planner.planSession(input({ sessionNumber: 5, newItems: items }));
    expect(plan.newItems.map((i) => i.itemId)).toEqual(['n1', 'n2']);
  });

  it('allows maxNewItemsPerSkillLater=4 past the early threshold', () => {
    const items = [
      newItem('n1', 'skill_a', true),
      newItem('n2', 'skill_a', true),
      newItem('n3', 'skill_a', true),
      newItem('n4', 'skill_a', true),
      newItem('n5', 'skill_a', true), // exceeds 4
    ];
    const plan = planner.planSession(input({ sessionNumber: 11, newItems: items }));
    expect(plan.newItems).toHaveLength(4);
  });
});

describe('BudgetedSessionPlanner — empty/sparse inputs', () => {
  const planner = new BudgetedSessionPlanner();

  it('returns an empty plan when no candidates anywhere', () => {
    const plan = planner.planSession(input({}));
    expect(plan.reviews).toEqual([]);
    expect(plan.errors).toEqual([]);
    expect(plan.newItems).toEqual([]);
    expect(plan.newSkillsIntroduced.size).toBe(0);
  });

  it('handles zero new-item slots cleanly', () => {
    const items = [newItem('n1', 'skill_a', true)];
    // Force newSlots to zero by maxing out the other allocations.
    const tightPlanner = new BudgetedSessionPlanner({
      defaultBudget: 17,
      minBudget: 17,
      maxBudget: 17,
      reviews: { targetFraction: 0.7, minReviews: 12 },
      errors: { targetFraction: 0.3, maxItems: 5, weaknessThreshold: 0.6, lookbackDays: 7 },
    });
    const plan = tightPlanner.planSession(input({ sessionNumber: 5, newItems: items }));
    expect(plan.allocation.newSlots).toBeLessThanOrEqual(0);
    expect(plan.newItems).toEqual([]);
  });
});

describe('BudgetedSessionPlanner.detectBacklogGrowthSessions', () => {
  it('returns 0 for fewer than 2 sessions', () => {
    expect(BudgetedSessionPlanner.detectBacklogGrowthSessions([])).toBe(0);
    expect(BudgetedSessionPlanner.detectBacklogGrowthSessions([{ dueAtEnd: 5 }])).toBe(0);
  });

  it('counts consecutive growth from the most recent session', () => {
    expect(
      BudgetedSessionPlanner.detectBacklogGrowthSessions([
        { dueAtEnd: 5 },
        { dueAtEnd: 8 },
        { dueAtEnd: 12 },
        { dueAtEnd: 18 },
      ])
    ).toBe(3);
  });

  it('stops at the first non-growth session walking backward', () => {
    expect(
      BudgetedSessionPlanner.detectBacklogGrowthSessions([
        { dueAtEnd: 5 },
        { dueAtEnd: 12 }, // grew
        { dueAtEnd: 10 }, // shrank — boundary
        { dueAtEnd: 18 }, // grew
        { dueAtEnd: 22 }, // grew
      ])
    ).toBe(2);
  });

  it('returns 0 when the queue is shrinking', () => {
    expect(
      BudgetedSessionPlanner.detectBacklogGrowthSessions([
        { dueAtEnd: 20 },
        { dueAtEnd: 15 },
        { dueAtEnd: 10 },
      ])
    ).toBe(0);
  });

  it('counts equal as non-growth (strict >)', () => {
    expect(
      BudgetedSessionPlanner.detectBacklogGrowthSessions([{ dueAtEnd: 10 }, { dueAtEnd: 10 }])
    ).toBe(0);
  });
});

describe('BudgetedSessionPlanner — replay determinism', () => {
  it('planSession is pure — same input twice produces same output', () => {
    const planner = new BudgetedSessionPlanner();
    const inp = input({
      sessionNumber: 5,
      dueReviews: [review('r1', 's1'), review('r2', 's2')],
      recentErrors: [err('e1', 's3', 0.3)],
      newItems: [newItem('n1', 's4', true), newItem('n2', 's4', true)],
      backlogGrowthSessions: 1,
    });
    const a = planner.planSession(inp);
    const b = planner.planSession(inp);
    expect(a).toEqual(b);
  });
});

describe('createBudgetedSessionPlanner factory', () => {
  it('returns a usable instance', () => {
    const p = createBudgetedSessionPlanner({ defaultBudget: 18 });
    const plan = p.planSession(input({ sessionNumber: 5 }));
    expect(plan.budget).toBe(18);
  });
});
