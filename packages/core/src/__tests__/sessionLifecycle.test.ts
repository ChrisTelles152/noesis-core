import { describe, it, expect } from 'vitest';
import {
  SessionLifecycleManager,
  createSessionLifecycleManager,
  type SessionRecord,
} from '../session/index.js';
import type { SessionPlan } from '../planning/BudgetedSessionPlanner.js';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const T1 = T0 + 60_000;
const T2 = T1 + 60_000;

function plan(over: Partial<SessionPlan> = {}): SessionPlan {
  return {
    budget: 20,
    backlogReduced: false,
    reviews: [{ itemId: 'r1', skillId: 's1', dueAt: T0 - 1000 }],
    errors: [],
    newItems: [{ itemId: 'n1', skillId: 's2', isNewSkill: true }],
    allocation: { reviewSlots: 12, errorSlots: 5, newSlots: 3 },
    newSkillsIntroduced: new Set(['s2']),
    ...over,
  };
}

function args(over: Partial<Parameters<SessionLifecycleManager['createSession']>[0]> = {}) {
  return {
    sessionId: 'sess-1',
    learnerId: 'learner-1',
    packId: 'pack-1',
    packVersion: '1.0.0',
    plan: plan(),
    now: T0,
    ...over,
  };
}

describe('SessionLifecycleManager — createSession', () => {
  it('creates a new session with all expected fields', () => {
    const m = new SessionLifecycleManager();
    const r = m.createSession(args());
    expect(r.sessionId).toBe('sess-1');
    expect(r.learnerId).toBe('learner-1');
    expect(r.packId).toBe('pack-1');
    expect(r.packVersion).toBe('1.0.0');
    expect(r.startedAt).toBe(T0);
    expect(r.endedAt).toBeNull();
    expect(r.shownItemIds).toEqual([]);
    expect(r.itemsAnswered).toBe(0);
  });

  it('throws on duplicate sessionId', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    expect(() => m.createSession(args())).toThrow(/already exists/);
  });

  it('preserves the plan and plannerSnapshot', () => {
    const m = new SessionLifecycleManager();
    const snapshot = { fsrsState: 'opaque', bktState: 'opaque' };
    const r = m.createSession(args({ plannerSnapshot: snapshot }));
    expect(r.plan.budget).toBe(20);
    expect(r.plannerSnapshot).toEqual(snapshot);
  });

  it('returns a defensive copy — caller mutations do not leak in', () => {
    const m = new SessionLifecycleManager();
    const r = m.createSession(args());
    r.shownItemIds.push('hacked');
    r.itemsAnswered = 999;
    const fetched = m.getSession('sess-1')!;
    expect(fetched.shownItemIds).toEqual([]);
    expect(fetched.itemsAnswered).toBe(0);
  });
});

describe('SessionLifecycleManager — getSession / getSessionPlan', () => {
  it('returns undefined for unknown sessions', () => {
    const m = new SessionLifecycleManager();
    expect(m.getSession('missing')).toBeUndefined();
    expect(m.getSessionPlan('missing')).toBeUndefined();
  });

  it('returns the stored record', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    expect(m.getSession('sess-1')!.learnerId).toBe('learner-1');
    expect(m.getSessionPlan('sess-1')!.budget).toBe(20);
  });

  it('getSession returns a defensive copy', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    const a = m.getSession('sess-1')!;
    a.shownItemIds.push('hacked');
    expect(m.getSession('sess-1')!.shownItemIds).toEqual([]);
  });
});

describe('SessionLifecycleManager — findActiveSession', () => {
  it('returns undefined when no sessions exist for the learner+pack', () => {
    const m = new SessionLifecycleManager();
    expect(m.findActiveSession('learner-1', 'pack-1')).toBeUndefined();
  });

  it('returns the only active session when there is one', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A' }));
    expect(m.findActiveSession('learner-1', 'pack-1')!.sessionId).toBe('A');
  });

  it('returns the most recently started active session', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'old', now: T0 }));
    m.createSession(args({ sessionId: 'new', now: T2 }));
    m.createSession(args({ sessionId: 'mid', now: T1 }));
    expect(m.findActiveSession('learner-1', 'pack-1')!.sessionId).toBe('new');
  });

  it('skips ended sessions', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'ended', now: T0 }));
    m.endSession('ended', T1);
    m.createSession(args({ sessionId: 'active', now: T1 }));
    expect(m.findActiveSession('learner-1', 'pack-1')!.sessionId).toBe('active');
  });

  it('does not cross learner boundaries', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A', learnerId: 'learner-1' }));
    expect(m.findActiveSession('learner-2', 'pack-1')).toBeUndefined();
  });

  it('does not cross pack boundaries', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A', packId: 'pack-1' }));
    expect(m.findActiveSession('learner-1', 'pack-2')).toBeUndefined();
  });
});

describe('SessionLifecycleManager — recordItemShown', () => {
  it('appends a new item to shownItemIds', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    m.recordItemShown('sess-1', 'item-A');
    m.recordItemShown('sess-1', 'item-B');
    expect(m.getSession('sess-1')!.shownItemIds).toEqual(['item-A', 'item-B']);
  });

  it('is idempotent on duplicate itemId', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    m.recordItemShown('sess-1', 'item-A');
    m.recordItemShown('sess-1', 'item-A');
    expect(m.getSession('sess-1')!.shownItemIds).toEqual(['item-A']);
  });

  it('throws on unknown sessionId', () => {
    const m = new SessionLifecycleManager();
    expect(() => m.recordItemShown('missing', 'item-A')).toThrow(/not found/);
  });

  it('throws when session is already ended', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    m.endSession('sess-1', T1);
    expect(() => m.recordItemShown('sess-1', 'item-A')).toThrow(/already ended/);
  });
});

describe('SessionLifecycleManager — recordItemAnswered', () => {
  it('increments itemsAnswered', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    m.recordItemAnswered('sess-1');
    m.recordItemAnswered('sess-1');
    expect(m.getSession('sess-1')!.itemsAnswered).toBe(2);
  });

  it('throws on unknown sessionId', () => {
    const m = new SessionLifecycleManager();
    expect(() => m.recordItemAnswered('missing')).toThrow(/not found/);
  });

  it('throws when session is already ended', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    m.endSession('sess-1', T1);
    expect(() => m.recordItemAnswered('sess-1')).toThrow(/already ended/);
  });
});

describe('SessionLifecycleManager — endSession', () => {
  it('sets endedAt and returns the finalized record', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    const r = m.endSession('sess-1', T2);
    expect(r.endedAt).toBe(T2);
  });

  it('throws on unknown sessionId', () => {
    const m = new SessionLifecycleManager();
    expect(() => m.endSession('missing', T2)).toThrow(/not found/);
  });

  it('throws when ending a session twice', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    m.endSession('sess-1', T1);
    expect(() => m.endSession('sess-1', T2)).toThrow(/already ended/);
  });
});

describe('SessionLifecycleManager — resumeSession', () => {
  it('restores a session record into a fresh manager', () => {
    const original = new SessionLifecycleManager();
    original.createSession(args());
    original.recordItemShown('sess-1', 'A');
    original.recordItemAnswered('sess-1');
    const record = original.getSession('sess-1')!;

    const restored = new SessionLifecycleManager();
    restored.resumeSession(record);
    expect(restored.getSession('sess-1')).toEqual(record);
  });

  it('overwrites an existing session record with the same id', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args());
    m.recordItemAnswered('sess-1');
    const overwrite: SessionRecord = {
      sessionId: 'sess-1',
      learnerId: 'learner-1',
      packId: 'pack-1',
      packVersion: '1.0.0',
      startedAt: T0,
      endedAt: T2,
      plan: plan(),
      shownItemIds: ['restored-A'],
      itemsAnswered: 5,
    };
    m.resumeSession(overwrite);
    const got = m.getSession('sess-1')!;
    expect(got.itemsAnswered).toBe(5);
    expect(got.endedAt).toBe(T2);
    expect(got.shownItemIds).toEqual(['restored-A']);
  });
});

describe('SessionLifecycleManager — cleanup', () => {
  it('deleteSessionCaches removes one session', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A' }));
    m.createSession(args({ sessionId: 'B' }));
    m.deleteSessionCaches('A');
    expect(m.getSession('A')).toBeUndefined();
    expect(m.getSession('B')).toBeDefined();
  });

  it('clearAllCaches drops everything', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A' }));
    m.createSession(args({ sessionId: 'B' }));
    m.clearAllCaches();
    expect(m.getSession('A')).toBeUndefined();
    expect(m.getSession('B')).toBeUndefined();
  });
});

describe('SessionLifecycleManager — serialize / deserialize', () => {
  it('round-trips a single session losslessly', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ plannerSnapshot: { x: 1 } }));
    m.recordItemShown('sess-1', 'item-A');
    m.recordItemAnswered('sess-1');

    const restored = SessionLifecycleManager.deserialize(m.serialize());
    expect(restored.getSession('sess-1')).toEqual(m.getSession('sess-1'));
  });

  it('round-trips multiple sessions including ended ones', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A', now: T0 }));
    m.createSession(args({ sessionId: 'B', now: T1 }));
    m.endSession('A', T2);

    const restored = SessionLifecycleManager.deserialize(m.serialize());
    expect(restored.getSession('A')!.endedAt).toBe(T2);
    expect(restored.getSession('B')!.endedAt).toBeNull();
  });

  it('preserves plan.newSkillsIntroduced as a Set across the round-trip', () => {
    const m = new SessionLifecycleManager();
    const customPlan = plan({ newSkillsIntroduced: new Set(['s2', 's3']) });
    m.createSession(args({ plan: customPlan }));
    const restored = SessionLifecycleManager.deserialize(m.serialize());
    const got = restored.getSession('sess-1')!;
    expect(got.plan.newSkillsIntroduced).toBeInstanceOf(Set);
    expect(Array.from(got.plan.newSkillsIntroduced).sort()).toEqual(['s2', 's3']);
  });

  it('produces stable JSON (sorted by sessionId) across runs', () => {
    function build(): string {
      const m = new SessionLifecycleManager();
      m.createSession(args({ sessionId: 'z' }));
      m.createSession(args({ sessionId: 'a' }));
      m.createSession(args({ sessionId: 'm' }));
      return m.serialize();
    }
    expect(build()).toBe(build());
    const parsed = JSON.parse(build()) as Array<{ sessionId: string }>;
    expect(parsed.map((p) => p.sessionId)).toEqual(['a', 'm', 'z']);
  });
});

describe('SessionLifecycleManager — observability helpers', () => {
  it('allSessions yields every record (active + ended)', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A', now: T0 }));
    m.createSession(args({ sessionId: 'B', now: T1 }));
    m.endSession('A', T2);
    const ids = Array.from(m.allSessions(), (r) => r.sessionId).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  it('countSessions filters by predicate', () => {
    const m = new SessionLifecycleManager();
    m.createSession(args({ sessionId: 'A', now: T0 }));
    m.createSession(args({ sessionId: 'B', now: T1 }));
    m.endSession('A', T2);
    expect(m.countSessions((r) => r.endedAt === null)).toBe(1);
    expect(m.countSessions(() => true)).toBe(2);
  });
});

describe('SessionLifecycleManager — replay determinism', () => {
  it('two managers replaying the same event log produce identical state', () => {
    const ops: Array<(m: SessionLifecycleManager) => void> = [
      (m) => m.createSession(args({ sessionId: 'A', now: T0 })),
      (m) => m.recordItemShown('A', 'item-1'),
      (m) => m.recordItemShown('A', 'item-2'),
      (m) => m.recordItemAnswered('A'),
      (m) => m.createSession(args({ sessionId: 'B', now: T1 })),
      (m) => m.endSession('A', T2),
    ];

    function run(): string {
      const m = new SessionLifecycleManager();
      for (const op of ops) op(m);
      return m.serialize();
    }
    expect(run()).toBe(run());
  });
});

describe('createSessionLifecycleManager factory', () => {
  it('returns a usable instance', () => {
    const m = createSessionLifecycleManager();
    m.createSession(args());
    expect(m.getSession('sess-1')).toBeDefined();
  });
});
