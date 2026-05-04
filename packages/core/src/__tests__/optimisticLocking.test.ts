import { describe, it, expect } from 'vitest';
import {
  InMemoryOptimisticStore,
  createInMemoryOptimisticStore,
  OptimisticLockConflictError,
  updateWithRetry,
  type OptimisticLockingStore,
} from '../persistence/index.js';

interface State {
  count: number;
  label?: string;
}

describe('InMemoryOptimisticStore — basic load/write', () => {
  it('returns null for an unseen key', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    expect(await s.load('k')).toBeNull();
  });

  it('first write at expectedVersion=0 succeeds and produces version=1', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    const out = await s.tryWrite('k', { count: 1 }, 0);
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ count: 1 });
    expect(out!.version).toBe(1);
  });

  it('subsequent write at correct expectedVersion succeeds', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    await s.tryWrite('k', { count: 1 }, 0);
    const out = await s.tryWrite('k', { count: 2 }, 1);
    expect(out!.version).toBe(2);
    expect((await s.load('k'))!.value).toEqual({ count: 2 });
  });

  it('write at stale expectedVersion returns null (conflict)', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    await s.tryWrite('k', { count: 1 }, 0);
    expect(await s.tryWrite('k', { count: 99 }, 0)).toBeNull();
  });

  it('write at future expectedVersion returns null (conflict)', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    await s.tryWrite('k', { count: 1 }, 0);
    expect(await s.tryWrite('k', { count: 99 }, 5)).toBeNull();
  });

  it('load returns a defensive copy of the version envelope', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    await s.tryWrite('k', { count: 1 }, 0);
    const a = await s.load('k');
    const b = await s.load('k');
    expect(a).not.toBe(b); // different objects
    expect(a).toEqual(b);
  });
});

describe('InMemoryOptimisticStore — keys and remove', () => {
  it('remove returns true on existing key, false on missing', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    expect(await s.remove('k')).toBe(false);
    await s.tryWrite('k', { count: 1 }, 0);
    expect(await s.remove('k')).toBe(true);
    expect(await s.load('k')).toBeNull();
  });

  it('keys() returns stringified keys', async () => {
    const s = new InMemoryOptimisticStore<{ user: string; skill: string }, State>();
    await s.tryWrite({ user: 'u1', skill: 's1' }, { count: 1 }, 0);
    await s.tryWrite({ user: 'u2', skill: 's2' }, { count: 2 }, 0);
    expect(s.keys().sort()).toEqual([
      JSON.stringify({ user: 'u1', skill: 's1' }),
      JSON.stringify({ user: 'u2', skill: 's2' }),
    ]);
  });

  it('size() reports total entry count', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    expect(s.size()).toBe(0);
    await s.tryWrite('a', { count: 1 }, 0);
    await s.tryWrite('b', { count: 2 }, 0);
    expect(s.size()).toBe(2);
  });

  it('clear() drops all entries', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    await s.tryWrite('a', { count: 1 }, 0);
    s.clear();
    expect(s.size()).toBe(0);
  });
});

describe('InMemoryOptimisticStore — composite keys (object)', () => {
  it('treats object keys with same shape as identical', async () => {
    const s = new InMemoryOptimisticStore<{ user: string; skill: string }, State>();
    await s.tryWrite({ user: 'u', skill: 's' }, { count: 1 }, 0);
    const got = await s.load({ user: 'u', skill: 's' });
    expect(got!.value).toEqual({ count: 1 });
  });

  it('treats different shapes as different keys', async () => {
    const s = new InMemoryOptimisticStore<{ user: string; skill: string }, State>();
    await s.tryWrite({ user: 'u1', skill: 's' }, { count: 1 }, 0);
    expect(await s.load({ user: 'u2', skill: 's' })).toBeNull();
  });
});

describe('updateWithRetry — happy path', () => {
  it('reads / mutates / writes on first attempt when no contention', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    const result = await updateWithRetry(
      s,
      'k',
      (cur) => ({ count: (cur?.count ?? 0) + 1 })
    );
    expect(result.value.count).toBe(1);
    expect(result.version).toBe(1);
  });

  it('passes null + version=0 to mutator on first-write', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    let seen: { cur: State | null; version: number } | null = null;
    await updateWithRetry(s, 'k', (cur, version) => {
      seen = { cur, version };
      return { count: 1 };
    });
    expect(seen).toEqual({ cur: null, version: 0 });
  });

  it('preserves data across multiple sequential updates', async () => {
    const s = new InMemoryOptimisticStore<string, State>();
    await updateWithRetry(s, 'k', () => ({ count: 1 }));
    await updateWithRetry(s, 'k', (cur) => ({ count: (cur?.count ?? 0) + 1 }));
    await updateWithRetry(s, 'k', (cur) => ({ count: (cur?.count ?? 0) + 1 }));
    const final = await s.load('k');
    expect(final!.value.count).toBe(3);
    expect(final!.version).toBe(3);
  });
});

describe('updateWithRetry — conflict handling', () => {
  /**
   * Helper: a wrapper store that can simulate a concurrent writer between
   * load and tryWrite. After `simulateRacesOnAttempts` writes, it lets the
   * caller's write succeed.
   */
  class RacyStore<TKey, TValue> implements OptimisticLockingStore<TKey, TValue> {
    public attempts = 0;
    constructor(
      private readonly inner: OptimisticLockingStore<TKey, TValue>,
      private readonly raceUntilAttempt: number,
      private readonly racingMutator: (
        cur: TValue | null,
        version: number
      ) => TValue
    ) {}
    load(key: TKey) {
      return this.inner.load(key);
    }
    async tryWrite(key: TKey, value: TValue, expectedVersion: number) {
      this.attempts++;
      // Simulate a concurrent writer winning before our write — bumps
      // the version on the underlying store, so our write conflicts.
      if (this.attempts <= this.raceUntilAttempt) {
        const cur = await this.inner.load(key);
        const v = cur ? cur.version : 0;
        await this.inner.tryWrite(key, this.racingMutator(cur ? cur.value : null, v), v);
      }
      return this.inner.tryWrite(key, value, expectedVersion);
    }
    remove(key: TKey) {
      return this.inner.remove(key);
    }
  }

  it('retries once on a single conflict and succeeds on the retry', async () => {
    const inner = new InMemoryOptimisticStore<string, State>();
    const racy = new RacyStore(inner, 1, (cur) => ({
      count: (cur?.count ?? 0) + 100,
    }));
    const out = await updateWithRetry(racy, 'k', (cur) => ({
      count: (cur?.count ?? 0) + 1,
    }));
    expect(racy.attempts).toBe(2);
    expect(out.value.count).toBe(101); // racer wrote 100, retry sees 100, mutator adds 1
  });

  it('throws OptimisticLockConflictError after maxRetries+1 attempts', async () => {
    const inner = new InMemoryOptimisticStore<string, State>();
    const racy = new RacyStore(inner, 5, () => ({ count: 0 }));
    let thrown: unknown = null;
    try {
      await updateWithRetry(
        racy,
        'k',
        (cur) => ({ count: (cur?.count ?? 0) + 1 }),
        { maxRetries: 1, kind: 'bkt' }
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OptimisticLockConflictError);
    const err = thrown as OptimisticLockConflictError;
    expect(err.kind).toBe('bkt');
    expect(err.key).toBe('k');
    expect(racy.attempts).toBe(2); // initial + 1 retry
  });

  it('honors a higher maxRetries setting', async () => {
    const inner = new InMemoryOptimisticStore<string, State>();
    const racy = new RacyStore(inner, 3, (cur) => ({
      count: (cur?.count ?? 0) + 100,
    }));
    const out = await updateWithRetry(
      racy,
      'k',
      (cur) => ({ count: (cur?.count ?? 0) + 1 }),
      { maxRetries: 5 }
    );
    expect(racy.attempts).toBe(4); // 3 races + 1 success
    expect(out.value.count).toBe(301);
  });

  it('mutator sees the latest state on each retry (not the first read)', async () => {
    const inner = new InMemoryOptimisticStore<string, State>();
    const racy = new RacyStore(inner, 1, () => ({ count: 999 }));
    const observed: Array<State | null> = [];
    await updateWithRetry(racy, 'k', (cur) => {
      observed.push(cur ? { ...cur } : null);
      return { count: (cur?.count ?? 0) + 1 };
    });
    expect(observed).toEqual([null, { count: 999 }]);
  });
});

describe('OptimisticLockConflictError', () => {
  it('carries key, expectedVersion, kind, and a clear message', () => {
    const e = new OptimisticLockConflictError({ user: 'u', skill: 's' }, 5, 'bkt');
    expect(e.name).toBe('OptimisticLockConflictError');
    expect(e.kind).toBe('bkt');
    expect(e.expectedVersion).toBe(5);
    expect(e.key).toEqual({ user: 'u', skill: 's' });
    expect(e.message).toMatch(/bkt/);
    expect(e.message).toMatch(/expectedVersion=5/);
    expect(e.message).toMatch(/u.*s/); // stringified key contains both
  });

  it('defaults kind to "state" when not specified', () => {
    const e = new OptimisticLockConflictError('k', 0);
    expect(e.kind).toBe('state');
  });

  it('handles non-stringifiable keys gracefully', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const e = new OptimisticLockConflictError(circular, 0);
    // Doesn't throw on String(circular) fallback path
    expect(e.message).toContain('expectedVersion=0');
  });
});

describe('createInMemoryOptimisticStore factory', () => {
  it('returns a usable instance', async () => {
    const s = createInMemoryOptimisticStore<string, State>();
    await s.tryWrite('k', { count: 1 }, 0);
    expect((await s.load('k'))!.value.count).toBe(1);
  });
});

describe('Integration: BKT-style update pattern', () => {
  it('simulates the eng/math BKT update: load → compute → optimistic write', async () => {
    const s = new InMemoryOptimisticStore<{ user: string; skill: string; channel: string }, State>();
    const key = { user: 'u1', skill: 'verb_present', channel: 'recog_mc' };

    // Initial seed
    await s.tryWrite(key, { count: 0 }, 0);

    // Simulate 5 sequential answer submissions (no contention)
    for (let i = 0; i < 5; i++) {
      await updateWithRetry(s, key, (cur) => ({ count: (cur?.count ?? 0) + 1 }), {
        kind: 'bkt',
      });
    }
    const final = await s.load(key);
    expect(final!.value.count).toBe(5);
    expect(final!.version).toBe(6); // 1 seed + 5 updates
  });
});
