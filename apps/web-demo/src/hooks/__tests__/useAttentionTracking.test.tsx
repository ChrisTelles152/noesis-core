/**
 * useAttentionTracking env-flag tracker selection (Phase D2)
 *
 * Verifies that the hook selects WebGazer only when
 * VITE_ENABLE_REAL_GAZE_TRACKING === 'true', and defaults to the
 * simulated tracker otherwise. This is the runtime gate that keeps the
 * demo on the simulated path by default per INTENTION.md.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useAttentionTracking,
  getAttentionTracker,
  _resetAttentionTrackerForTesting,
} from '../useAttentionTracking';

beforeEach(() => {
  _resetAttentionTrackerForTesting();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetAttentionTrackerForTesting();
});

describe('Phase D2: useAttentionTracking selects tracker by env flag', () => {
  it('uses SimulatedAttentionTracker when VITE_ENABLE_REAL_GAZE_TRACKING is unset', () => {
    // Don't set the env var at all — default-by-omission must yield simulated.
    const { result } = renderHook(() => useAttentionTracking());
    expect(result.current.tracker.constructor.name).toBe('SimulatedAttentionTracker');
  });

  it("uses SimulatedAttentionTracker when flag is 'false'", () => {
    vi.stubEnv('VITE_ENABLE_REAL_GAZE_TRACKING', 'false');
    const { result } = renderHook(() => useAttentionTracking());
    expect(result.current.tracker.constructor.name).toBe('SimulatedAttentionTracker');
  });

  it("uses SimulatedAttentionTracker when flag is any non-'true' value", () => {
    // Strict equality — only 'true' opts in. Any other value (including
    // 'TRUE', 'yes', '1') keeps the simulated default to make the safer
    // path the harder-to-accidentally-disable one.
    for (const value of ['TRUE', 'yes', '1', '', 'webgazer']) {
      _resetAttentionTrackerForTesting();
      vi.stubEnv('VITE_ENABLE_REAL_GAZE_TRACKING', value);
      const { result } = renderHook(() => useAttentionTracking());
      expect(result.current.tracker.constructor.name).toBe('SimulatedAttentionTracker');
    }
  });

  it("uses WebGazerAttentionTracker when flag is exactly 'true'", () => {
    vi.stubEnv('VITE_ENABLE_REAL_GAZE_TRACKING', 'true');
    const { result } = renderHook(() => useAttentionTracking());
    // The legacy class kept its original name 'AttentionTracker' — it was
    // re-exported as `WebGazerAttentionTracker` in D1 but not renamed.
    expect(result.current.tracker.constructor.name).toBe('AttentionTracker');
  });

  it('caches the tracker across hook calls (singleton)', () => {
    vi.stubEnv('VITE_ENABLE_REAL_GAZE_TRACKING', 'false');
    const t1 = getAttentionTracker();
    const t2 = getAttentionTracker();
    expect(t1).toBe(t2);

    // Two independent hook mounts also return the same instance.
    const a = renderHook(() => useAttentionTracking());
    const b = renderHook(() => useAttentionTracking());
    expect(a.result.current.tracker).toBe(b.result.current.tracker);
  });

  it('_resetAttentionTrackerForTesting allows the next call to re-evaluate the flag', () => {
    vi.stubEnv('VITE_ENABLE_REAL_GAZE_TRACKING', 'false');
    const t1 = getAttentionTracker();
    expect(t1.constructor.name).toBe('SimulatedAttentionTracker');

    _resetAttentionTrackerForTesting();
    vi.stubEnv('VITE_ENABLE_REAL_GAZE_TRACKING', 'true');
    const t2 = getAttentionTracker();
    expect(t2.constructor.name).toBe('AttentionTracker'); // WebGazer
    expect(t2).not.toBe(t1);
  });
});
