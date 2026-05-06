/**
 * useNoesisSDK persistence wire-up (Phase B2)
 *
 * Verifies that the demo app's SDK hook:
 *   1. Initializes the core engine on mount.
 *   2. Hydrates engine state from GET /api/engine/state.
 *   3. Autosaves engine state to PUT /api/engine/state on mutations.
 *
 * The shape of the GET/PUT bodies must match `apps/server/routes.ts`
 * (`PUT /api/engine/state` accepts `{ state: string }`; `GET` returns
 * `{ state: string }` or 404).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useNoesisSDK, _resetSdkInstanceForTesting } from '../useNoesisSDK';

// Silence the SDK boundary warning emitted when constructing CoreEngineAdapter
// without an explicit clock/idGenerator. The hook intentionally accepts the
// system-clock fallback for the demo.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  _resetSdkInstanceForTesting();
  vi.restoreAllMocks();
});

/** Build a fetch mock returning canned responses by URL+method. */
function makeFetchMock(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${u}`;
    const handler = routes[key];
    if (!handler) {
      throw new Error(`Unmocked fetch: ${key}`);
    }
    return handler();
  });
}

describe('Phase B2: useNoesisSDK persistence wire-up', () => {
  it('hydrates from server on mount and autosaves on practice events', async () => {
    const fetchMock = makeFetchMock({
      // No prior state — hydrate is a no-op.
      'GET /api/engine/state': () => new Response('', { status: 404 }),
      'PUT /api/engine/state': () => new Response('', { status: 200 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNoesisSDK());

    // Wait for the singleton-real SDK to take over from the stub.
    await waitFor(() => expect(result.current.isCoreInitialized()).toBe(true));

    // Wait for the hydrate GET to be issued.
    await waitFor(() => {
      const getCalls = fetchMock.mock.calls.filter(([url, init]) => {
        const u = typeof url === 'string' ? url : url.toString();
        return u === '/api/engine/state' && (init?.method ?? 'GET') === 'GET';
      });
      expect(getCalls.length).toBeGreaterThan(0);
    });

    // Trigger a state-changing mutation through the SDK. recordPractice on a
    // skill not in the (empty) graph is a BKT/FSRS no-op, but pushEvent still
    // fires, which is what schedules the autosave — so this is enough to
    // exercise the wire-up.
    result.current.recordPractice('a', 'q1', true, 100);

    // Autosave debounces at 1000 ms. Wait up to 1500 ms for the PUT.
    await waitFor(
      () => {
        const putCalls = fetchMock.mock.calls.filter(([url, init]) => {
          const u = typeof url === 'string' ? url : url.toString();
          return u === '/api/engine/state' && (init?.method ?? 'GET') === 'PUT';
        });
        expect(putCalls.length).toBeGreaterThan(0);
      },
      { timeout: 1500 }
    );

    // The PUT body must be valid JSON of shape { state: string } where state
    // is itself JSON parseable as an exportState payload.
    const putCall = fetchMock.mock.calls.find(([url, init]) => {
      const u = typeof url === 'string' ? url : url.toString();
      return u === '/api/engine/state' && (init?.method ?? 'GET') === 'PUT';
    });
    expect(putCall).toBeDefined();
    const init = putCall![1] as RequestInit;
    expect(init.credentials).toBe('include');
    const body = JSON.parse(init.body as string) as { state: string };
    expect(typeof body.state).toBe('string');
    const innerState = JSON.parse(body.state) as { learnerModels: unknown };
    expect(innerState).toHaveProperty('learnerModels');
  });

  it('hydrates pre-existing engine state when GET returns 200', async () => {
    // Pre-load the server-side mock with a known engine state. The hook
    // should hydrate it on mount, restoring the donor's progress.
    const donorState = JSON.stringify({
      version: '1.0.0',
      timestamp: 1000,
      learnerModels: [
        {
          learnerId: 'demo-learner',
          data: JSON.stringify({
            learnerId: 'demo-learner',
            skillProbabilities: [],
            totalEvents: 7,
            createdAt: 0,
            lastUpdated: 0,
          }),
        },
      ],
      memoryStates: [],
      transferResults: [],
      eventLog: [],
    });

    const fetchMock = makeFetchMock({
      'GET /api/engine/state': () =>
        new Response(JSON.stringify({ state: donorState }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      'PUT /api/engine/state': () => new Response('', { status: 200 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNoesisSDK());

    await waitFor(() => expect(result.current.isCoreInitialized()).toBe(true));

    // After hydrate completes, the engine reflects the pre-loaded state.
    await waitFor(() => {
      const progress = result.current.core?.getLearnerProgress();
      expect(progress?.totalEvents).toBe(7);
    });
  });
});
