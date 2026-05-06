/**
 * Persistence (Phase B1) tests
 *
 * Verifies CoreEngineAdapter.persistTo / hydrate / flush, plus the two
 * built-in transport factories (localStorageTransport, httpTransport).
 *
 * What "definitely works" looks like:
 * - Every state-changing mutation triggers an autosave (with optional debounce).
 * - hydrate restores prior state byte-for-byte (composes with A1 determinism
 *   guarantees: importState then exportState must match what was loaded).
 * - flush forces an immediate save and cancels any pending debounce.
 * - Errors from the transport are routed to the consumer's onError hook,
 *   not silently swallowed.
 * - The transports themselves match the wire formats of the storage layers
 *   they target (localStorage key/value, HTTP `{ state }` JSON body matching
 *   apps/server's PUT/GET /api/engine/state).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CoreEngineAdapter,
  createCoreEngineAdapter,
  localStorageTransport,
  httpTransport,
  type PersistenceTransport,
} from '../core/CoreEngineAdapter';
import type { Skill } from '@noesis-edu/core';

const skills: Skill[] = [
  { id: 'a', name: 'A', prerequisites: [] },
  { id: 'b', name: 'B', prerequisites: ['a'] },
];

/** Helper — build an adapter with a deterministic clock + idGenerator. */
function makeAdapter(): CoreEngineAdapter {
  let counter = 0;
  return createCoreEngineAdapter({
    learnerId: 'l1',
    skills,
    clock: () => 1000,
    idGenerator: () => `evt-${++counter}`,
    suppressNonDeterminismWarning: true,
  });
}

/** A transport whose save/load are spy-able and inspectable. */
function makeFakeTransport(initial: string | null = null): PersistenceTransport & {
  save: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  saved: string[];
} {
  const saved: string[] = [];
  let stored: string | null = initial;
  const save = vi.fn(async (state: string) => {
    saved.push(state);
    stored = state;
  });
  const load = vi.fn(async () => stored);
  return { save, load, saved };
}

describe('Phase B1: CoreEngineAdapter.persistTo + autosave', () => {
  it('autosaves on every state-changing mutation when debounce is 0', async () => {
    const adapter = makeAdapter();
    const transport = makeFakeTransport();
    adapter.persistTo(transport, { autosaveDebounceMs: 0 });

    adapter.recordPractice('a', 'q1', true, 100);
    adapter.recordPractice('a', 'q2', true, 100);
    adapter.recordPractice('a', 'q3', false, 100);

    // debounce=0 schedules each save in the next microtask. Three events →
    // three queued saves. Flush microtasks so the assertions are deterministic.
    await Promise.resolve();
    await Promise.resolve();

    expect(transport.save).toHaveBeenCalledTimes(3);
    // Every save payload must parse — proves we're saving real exportState output.
    for (const call of transport.save.mock.calls) {
      const payload = call[0] as string;
      expect(typeof payload).toBe('string');
      expect(() => JSON.parse(payload)).not.toThrow();
      expect(JSON.parse(payload)).toHaveProperty('learnerModels');
    }
  });

  it('debounces saves: 3 mutations within window collapse to a single save', () => {
    vi.useFakeTimers();
    try {
      const adapter = makeAdapter();
      const transport = makeFakeTransport();
      adapter.persistTo(transport, { autosaveDebounceMs: 1000 });

      adapter.recordPractice('a', 'q1', true, 100);
      adapter.recordPractice('a', 'q2', false, 100);
      adapter.recordPractice('a', 'q3', true, 100);

      // No save yet — debounce timer pending.
      expect(transport.save).not.toHaveBeenCalled();

      // Advance to just before the debounce window: still nothing.
      vi.advanceTimersByTime(999);
      expect(transport.save).not.toHaveBeenCalled();

      // Advance past it — exactly one save fires, carrying the *latest* state.
      vi.advanceTimersByTime(2);
      expect(transport.save).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('startSession, endSession, recordDiagnostic, updateSkillGraph all trigger autosave', async () => {
    const adapter = makeAdapter();
    const transport = makeFakeTransport();
    adapter.persistTo(transport, { autosaveDebounceMs: 0 });

    adapter.startSession();
    adapter.recordDiagnostic(
      ['a'],
      [{ skillId: 'a', score: 0.5, itemsAttempted: 1, itemsCorrect: 1 }]
    );
    adapter.endSession({
      durationMinutes: 1,
      itemsAttempted: 1,
      itemsCorrect: 1,
      skillsPracticed: ['a'],
    });
    adapter.updateSkillGraph([...skills, { id: 'c', name: 'C', prerequisites: [] }]);

    await Promise.resolve();
    await Promise.resolve();

    // 4 mutations, debounce 0 → 4 saves.
    expect(transport.save).toHaveBeenCalledTimes(4);
  });

  it('flush() forces an immediate save and cancels pending debounce', async () => {
    vi.useFakeTimers();
    try {
      const adapter = makeAdapter();
      const transport = makeFakeTransport();
      adapter.persistTo(transport, { autosaveDebounceMs: 1000 });

      adapter.recordPractice('a', 'q1', true, 100);
      // Pending debounced save — not yet fired.
      expect(transport.save).not.toHaveBeenCalled();

      const flushPromise = adapter.flush();
      // Resolve the awaited promise from flush().
      vi.useRealTimers();
      await flushPromise;

      expect(transport.save).toHaveBeenCalledTimes(1);

      // Advance the original debounce window — no second save, the timer was
      // cancelled by flush().
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);
      expect(transport.save).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes save errors to the onError hook', async () => {
    const adapter = makeAdapter();
    const error = new Error('disk full');
    const transport: PersistenceTransport = {
      save: vi.fn(async () => {
        throw error;
      }),
      load: vi.fn(async () => null),
    };
    const onError = vi.fn();
    adapter.persistTo(transport, { autosaveDebounceMs: 0, onError });

    adapter.recordPractice('a', 'q1', true, 100);
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('stopPersistence cancels pending debounce and disables future autosaves', () => {
    vi.useFakeTimers();
    try {
      const adapter = makeAdapter();
      const transport = makeFakeTransport();
      adapter.persistTo(transport, { autosaveDebounceMs: 1000 });

      adapter.recordPractice('a', 'q1', true, 100);
      adapter.stopPersistence();
      vi.advanceTimersByTime(2000);
      expect(transport.save).not.toHaveBeenCalled();

      // Future mutations also do not save.
      adapter.recordPractice('a', 'q2', true, 100);
      vi.advanceTimersByTime(2000);
      expect(transport.save).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Phase B1: CoreEngineAdapter.hydrate', () => {
  it('hydrates engine state from a transport', async () => {
    // Build a "donor" adapter with some practiced state.
    const donor = makeAdapter();
    donor.recordPractice('a', 'q1', true, 100);
    donor.recordPractice('a', 'q2', true, 100);
    donor.recordPractice('a', 'q3', true, 100);
    const donorState = donor.getCoreEngine().exportState();
    const donorProgress = donor.getLearnerProgress();

    // Fresh adapter, transport pre-loaded with donor state.
    const transport = makeFakeTransport(donorState);
    const adapter = makeAdapter();

    const restored = await adapter.hydrate(transport);
    expect(restored).toBe(true);
    expect(transport.load).toHaveBeenCalledTimes(1);

    // The fresh adapter now mirrors the donor's progress.
    expect(adapter.getLearnerProgress()).toEqual(donorProgress);
  });

  it('returns false when transport.load returns null', async () => {
    const adapter = makeAdapter();
    const transport = makeFakeTransport(null);
    const restored = await adapter.hydrate(transport);
    expect(restored).toBe(false);
  });

  it('hydrate does not install autosave — that is persistTo job', async () => {
    const adapter = makeAdapter();
    const donor = makeAdapter();
    donor.recordPractice('a', 'q1', true, 100);
    const transport = makeFakeTransport(donor.getCoreEngine().exportState());

    await adapter.hydrate(transport);
    transport.save.mockClear();
    adapter.recordPractice('a', 'q2', true, 100);

    // No transport installed for autosave → no save triggered.
    await Promise.resolve();
    await Promise.resolve();
    expect(transport.save).not.toHaveBeenCalled();
  });
});

describe('Phase B1: localStorageTransport', () => {
  beforeEach(() => {
    // jsdom provides window.localStorage; clear between tests.
    window.localStorage.clear();
  });

  it('round-trips engine state through window.localStorage', async () => {
    const t = localStorageTransport('noesis-test-key');
    expect(await t.load()).toBeNull();

    await t.save('{"hello":"world"}');
    expect(await t.load()).toBe('{"hello":"world"}');
  });

  it('end-to-end: persistTo → recordPractice → fresh adapter hydrate matches state', async () => {
    const transport = localStorageTransport('noesis-test-e2e');

    const a = makeAdapter();
    a.persistTo(transport, { autosaveDebounceMs: 0 });
    a.recordPractice('a', 'q1', true, 100);
    a.recordPractice('a', 'q2', true, 100);
    await Promise.resolve();
    await Promise.resolve();
    await a.flush(); // belt-and-braces: ensure latest state is durable

    const b = makeAdapter();
    expect(await b.hydrate(transport)).toBe(true);
    expect(b.getLearnerProgress()).toEqual(a.getLearnerProgress());
  });
});

describe('Phase B1: httpTransport', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('save → PUTs to the URL with JSON body { state } and credentials: include', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));
    const t = httpTransport('/api/engine/state', {
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await t.save('{"hello":"world"}');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/engine/state');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ state: '{"hello":"world"}' });
  });

  it('attaches X-CSRF-Token when csrfToken is provided', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));
    const t = httpTransport('/api/engine/state', {
      csrfToken: 'csrf-abc',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await t.save('{}');
    const init = fetchSpy.mock.calls[0]![1];
    expect(init.headers['X-CSRF-Token']).toBe('csrf-abc');
  });

  it('save throws when the server returns non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Server Error' }));
    const t = httpTransport('/api/engine/state', {
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    await expect(t.save('{}')).rejects.toThrow(/save failed \(500/);
  });

  it('load returns the stored state on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ state: '{"hello":"world"}' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const t = httpTransport('/api/engine/state', {
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    expect(await t.load()).toBe('{"hello":"world"}');
  });

  it('load returns null on 404 (matches apps/server route — "no engine state found")', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));
    const t = httpTransport('/api/engine/state', {
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    expect(await t.load()).toBeNull();
  });

  it('load throws on other non-2xx codes', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Server Error' }));
    const t = httpTransport('/api/engine/state', {
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    await expect(t.load()).rejects.toThrow(/load failed \(500/);
  });
});
