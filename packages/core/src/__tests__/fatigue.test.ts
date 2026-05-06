import { describe, it, expect } from 'vitest';
import {
  FatigueDetector,
  createFatigueDetector,
  DEFAULT_FATIGUE_CONFIG,
  type FatigueSignal,
} from '../fatigue/index.js';

/**
 * Mock clock factory — increments by `step` ms on each call. Caller can also
 * jump forward via `advance()`.
 */
function mockClock(start = 0, step = 0) {
  let now = start;
  const fn = (): number => {
    const v = now;
    now += step;
    return v;
  };
  return {
    fn,
    advance: (ms: number) => {
      now += ms;
    },
    set: (ms: number) => {
      now = ms;
    },
    peek: () => now,
  };
}

describe('FatigueDetector — construction', () => {
  it('requires an injected clock', () => {
    // @ts-expect-error - missing clock argument by design
    expect(() => new FatigueDetector({})).toThrow();
  });

  it('uses DEFAULT_FATIGUE_CONFIG when no config supplied', () => {
    const clock = mockClock();
    const fd = new FatigueDetector({}, clock.fn);
    // No way to introspect config directly — verify by behavior:
    // session cap default = 15 min; advance just under and check no cap signal.
    clock.advance(DEFAULT_FATIGUE_CONFIG.sessionCapMs - 1000);
    expect(fd.check()).toBe('none');
  });

  it('returns "none" before any attempts recorded', () => {
    const clock = mockClock();
    const fd = createFatigueDetector({}, clock.fn);
    expect(fd.check()).toBe('none');
  });
});

describe('FatigueDetector — session cap', () => {
  it('returns session_cap_reached when wall clock exceeds cap', () => {
    const clock = mockClock();
    const fd = new FatigueDetector({ sessionCapMs: 60_000 }, clock.fn);
    clock.advance(59_999);
    expect(fd.check()).toBe('none');
    clock.advance(2);
    expect(fd.check()).toBe('session_cap_reached');
  });

  it('cap takes precedence over dual-threshold', () => {
    const clock = mockClock();
    const fd = new FatigueDetector(
      { sessionCapMs: 1_000, minSamplesForDetection: 1, windowSize: 1 },
      clock.fn
    );
    fd.recordAttempt(100, true);
    clock.advance(2_000);
    fd.recordAttempt(5_000, false);
    expect(fd.check()).toBe('session_cap_reached');
  });
});

describe('FatigueDetector — dual-threshold', () => {
  it('returns "none" when below minSamplesForDetection', () => {
    const clock = mockClock();
    const fd = new FatigueDetector({ minSamplesForDetection: 6 }, clock.fn);
    for (let i = 0; i < 5; i++) {
      fd.recordAttempt(1_000, true);
    }
    expect(fd.check()).toBe('none');
  });

  it('triggers break_suggested when latency rises >=20% AND accuracy drops >=10%', () => {
    const clock = mockClock();
    const fd = new FatigueDetector(
      {
        windowSize: 4,
        latencyIncreaseThreshold: 0.2,
        accuracyDecreaseThreshold: 0.1,
        minSamplesForDetection: 8,
        sessionCapMs: 999_999_999,
      },
      clock.fn
    );

    // 8 attempts: first 4 fast+correct (baseline), last 4 slow+mostly-wrong (recent)
    for (let i = 0; i < 4; i++) fd.recordAttempt(1_000, true);
    for (let i = 0; i < 4; i++) fd.recordAttempt(2_000, i < 1); // 1/4 correct

    expect(fd.check()).toBe('break_suggested');
  });

  it('does NOT trigger when only latency rises (accuracy steady)', () => {
    const clock = mockClock();
    const fd = new FatigueDetector(
      {
        windowSize: 4,
        latencyIncreaseThreshold: 0.2,
        accuracyDecreaseThreshold: 0.1,
        minSamplesForDetection: 8,
        sessionCapMs: 999_999_999,
      },
      clock.fn
    );

    for (let i = 0; i < 4; i++) fd.recordAttempt(1_000, true);
    for (let i = 0; i < 4; i++) fd.recordAttempt(2_000, true); // still 100%
    expect(fd.check()).toBe('none');
  });

  it('does NOT trigger when only accuracy drops (latency steady)', () => {
    const clock = mockClock();
    const fd = new FatigueDetector(
      {
        windowSize: 4,
        latencyIncreaseThreshold: 0.2,
        accuracyDecreaseThreshold: 0.1,
        minSamplesForDetection: 8,
        sessionCapMs: 999_999_999,
      },
      clock.fn
    );

    for (let i = 0; i < 4; i++) fd.recordAttempt(1_000, true);
    for (let i = 0; i < 4; i++) fd.recordAttempt(1_000, false);
    expect(fd.check()).toBe('none');
  });

  it('returns "none" when baseline latency is zero (guard against NaN)', () => {
    const clock = mockClock();
    const fd = new FatigueDetector(
      {
        windowSize: 4,
        minSamplesForDetection: 8,
        sessionCapMs: 999_999_999,
      },
      clock.fn
    );
    for (let i = 0; i < 4; i++) fd.recordAttempt(0, true);
    for (let i = 0; i < 4; i++) fd.recordAttempt(0, false);
    expect(fd.check()).toBe('none');
  });
});

describe('FatigueDetector — reset', () => {
  it('clears attempts and re-anchors session start', () => {
    const clock = mockClock();
    const fd = new FatigueDetector({ sessionCapMs: 60_000 }, clock.fn);

    for (let i = 0; i < 5; i++) fd.recordAttempt(1_000, true);
    clock.advance(70_000);
    expect(fd.check()).toBe('session_cap_reached');

    fd.reset();
    expect(fd.getAttemptCount()).toBe(0);
    expect(fd.getSessionDuration()).toBe(0);
    expect(fd.check()).toBe('none');
  });
});

describe('FatigueDetector — observability', () => {
  it('reports attempt count and session duration', () => {
    const clock = mockClock();
    const fd = new FatigueDetector({}, clock.fn);

    expect(fd.getAttemptCount()).toBe(0);
    fd.recordAttempt(500, true);
    fd.recordAttempt(700, false);
    expect(fd.getAttemptCount()).toBe(2);

    clock.advance(5_000);
    expect(fd.getSessionDuration()).toBe(5_000);
  });

  it('returns a defensive copy of attempt records', () => {
    const clock = mockClock();
    const fd = new FatigueDetector({}, clock.fn);
    fd.recordAttempt(1_000, true);
    const snapshot = fd.getAttemptRecords();
    expect(snapshot).toHaveLength(1);
    // Mutating the returned array must not affect detector state.
    (snapshot as unknown as unknown[]).push({ responseTimeMs: 999, correct: false, timestamp: 0 });
    expect(fd.getAttemptCount()).toBe(1);
  });
});

describe('FatigueDetector — replay determinism', () => {
  it('produces identical signal sequences across two runs with the same clock + events', () => {
    const eventLog: { rt: number; correct: boolean }[] = [
      { rt: 1_000, correct: true },
      { rt: 1_100, correct: true },
      { rt: 1_050, correct: true },
      { rt: 1_200, correct: true },
      { rt: 1_500, correct: true },
      { rt: 1_800, correct: false },
      { rt: 2_500, correct: false },
      { rt: 3_000, correct: false },
      { rt: 3_500, correct: false },
    ];

    function runOnce(): FatigueSignal[] {
      const clock = mockClock();
      const fd = new FatigueDetector(
        {
          windowSize: 4,
          minSamplesForDetection: 8,
          sessionCapMs: 999_999_999,
        },
        clock.fn
      );
      const out: FatigueSignal[] = [];
      for (const e of eventLog) {
        out.push(fd.recordAttempt(e.rt, e.correct));
      }
      return out;
    }

    expect(runOnce()).toEqual(runOnce());
  });
});
