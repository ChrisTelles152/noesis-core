import { describe, it, expect } from 'vitest';
import {
  SessionMetricsLogger,
  createSessionMetricsLogger,
  computeSessionMetrics,
  type AttemptRecord,
} from '../logging/index.js';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

function attempt(over: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    itemId: 'item-1',
    skillId: 'skill-1',
    channel: 'recog_mc',
    correct: true,
    responseTimeMs: 1000,
    timestamp: T0,
    ...over,
  };
}

describe('computeSessionMetrics — empty', () => {
  it('returns zero metrics for an empty attempt list', () => {
    const m = computeSessionMetrics([]);
    expect(m.totalAttempts).toBe(0);
    expect(m.correctCount).toBe(0);
    expect(m.incorrectCount).toBe(0);
    expect(m.accuracy).toBe(0);
    expect(m.uniqueItemsAttempted).toBe(0);
    expect(m.uniqueSkillsAttempted).toBe(0);
    expect(m.medianResponseTimeMs).toBe(0);
    expect(m.p90ResponseTimeMs).toBe(0);
    expect(m.byChannel).toEqual({});
    expect(m.bySkill).toEqual({});
  });
});

describe('computeSessionMetrics — basic counts', () => {
  it('counts totalAttempts / correctCount / incorrectCount / accuracy', () => {
    const m = computeSessionMetrics([
      attempt({ correct: true }),
      attempt({ correct: true }),
      attempt({ correct: false }),
      attempt({ correct: false }),
    ]);
    expect(m.totalAttempts).toBe(4);
    expect(m.correctCount).toBe(2);
    expect(m.incorrectCount).toBe(2);
    expect(m.accuracy).toBe(0.5);
  });

  it('counts unique items and skills', () => {
    const m = computeSessionMetrics([
      attempt({ itemId: 'a', skillId: 's1' }),
      attempt({ itemId: 'a', skillId: 's1' }),
      attempt({ itemId: 'b', skillId: 's1' }),
      attempt({ itemId: 'c', skillId: 's2' }),
    ]);
    expect(m.uniqueItemsAttempted).toBe(3);
    expect(m.uniqueSkillsAttempted).toBe(2);
  });

  it('sums response times', () => {
    const m = computeSessionMetrics([
      attempt({ responseTimeMs: 1000 }),
      attempt({ responseTimeMs: 2000 }),
      attempt({ responseTimeMs: 3000 }),
    ]);
    expect(m.totalResponseTimeMs).toBe(6000);
  });
});

describe('computeSessionMetrics — median and p90', () => {
  it('median of odd-length array is the middle element', () => {
    const m = computeSessionMetrics([
      attempt({ responseTimeMs: 100 }),
      attempt({ responseTimeMs: 200 }),
      attempt({ responseTimeMs: 300 }),
    ]);
    expect(m.medianResponseTimeMs).toBe(200);
  });

  it('median of even-length array averages the two middle elements', () => {
    const m = computeSessionMetrics([
      attempt({ responseTimeMs: 100 }),
      attempt({ responseTimeMs: 200 }),
      attempt({ responseTimeMs: 300 }),
      attempt({ responseTimeMs: 500 }),
    ]);
    expect(m.medianResponseTimeMs).toBe(250);
  });

  it('median is order-independent', () => {
    const a = computeSessionMetrics([
      attempt({ responseTimeMs: 100 }),
      attempt({ responseTimeMs: 200 }),
      attempt({ responseTimeMs: 300 }),
    ]);
    const b = computeSessionMetrics([
      attempt({ responseTimeMs: 300 }),
      attempt({ responseTimeMs: 100 }),
      attempt({ responseTimeMs: 200 }),
    ]);
    expect(a.medianResponseTimeMs).toBe(b.medianResponseTimeMs);
  });

  it('p90 returns the single element for length-1 input', () => {
    const m = computeSessionMetrics([attempt({ responseTimeMs: 1234 })]);
    expect(m.p90ResponseTimeMs).toBe(1234);
  });

  it('p90 of [0..100] is approximately 90 (linear interpolation)', () => {
    const records = Array.from({ length: 11 }, (_, i) =>
      attempt({ responseTimeMs: i * 10 })
    );
    const m = computeSessionMetrics(records);
    // rank = 0.9 * 10 = 9 → exact index → 90
    expect(m.p90ResponseTimeMs).toBe(90);
  });

  it('p90 interpolates between elements when rank is fractional', () => {
    const records = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((rt) =>
      attempt({ responseTimeMs: rt })
    );
    // n = 10, rank = 0.9 * 9 = 8.1 → interpolate between sorted[8]=90 and sorted[9]=100
    // value = 90 * 0.9 + 100 * 0.1 = 91
    const m = computeSessionMetrics(records);
    expect(m.p90ResponseTimeMs).toBeCloseTo(91, 6);
  });

  it('median is deterministic across JS engines (stable sort)', () => {
    const records = [5, 1, 3, 2, 4].map((rt) => attempt({ responseTimeMs: rt }));
    expect(computeSessionMetrics(records).medianResponseTimeMs).toBe(3);
  });
});

describe('computeSessionMetrics — per-channel breakdown', () => {
  it('groups attempts by channel and computes per-channel metrics', () => {
    const m = computeSessionMetrics([
      attempt({ channel: 'recog_mc', correct: true, responseTimeMs: 1000 }),
      attempt({ channel: 'recog_mc', correct: false, responseTimeMs: 2000 }),
      attempt({ channel: 'cloze', correct: true, responseTimeMs: 3000 }),
      attempt({ channel: 'cloze', correct: true, responseTimeMs: 5000 }),
    ]);
    expect(m.byChannel.recog_mc).toEqual({
      attempts: 2,
      correctCount: 1,
      accuracy: 0.5,
      medianResponseTimeMs: 1500,
    });
    expect(m.byChannel.cloze).toEqual({
      attempts: 2,
      correctCount: 2,
      accuracy: 1,
      medianResponseTimeMs: 4000,
    });
  });

  it('skips attempts with no channel set', () => {
    const m = computeSessionMetrics([
      attempt({ channel: undefined, correct: true }),
      attempt({ channel: 'recog_mc', correct: true }),
    ]);
    expect(Object.keys(m.byChannel)).toEqual(['recog_mc']);
    expect(m.byChannel.recog_mc.attempts).toBe(1);
    // Total attempts still counts the channel-less one.
    expect(m.totalAttempts).toBe(2);
  });

  it('produces channel keys in lexicographic order', () => {
    const m = computeSessionMetrics([
      attempt({ channel: 'z' }),
      attempt({ channel: 'a' }),
      attempt({ channel: 'm' }),
    ]);
    expect(Object.keys(m.byChannel)).toEqual(['a', 'm', 'z']);
  });
});

describe('computeSessionMetrics — per-skill breakdown', () => {
  it('groups attempts by skill', () => {
    const m = computeSessionMetrics([
      attempt({ skillId: 'verb_present', correct: true }),
      attempt({ skillId: 'verb_present', correct: true }),
      attempt({ skillId: 'verb_past', correct: false }),
    ]);
    expect(m.bySkill.verb_present.attempts).toBe(2);
    expect(m.bySkill.verb_present.correctCount).toBe(2);
    expect(m.bySkill.verb_past.attempts).toBe(1);
    expect(m.bySkill.verb_past.correctCount).toBe(0);
  });

  it('lists distinct channels per skill in lexicographic order', () => {
    const m = computeSessionMetrics([
      attempt({ skillId: 's1', channel: 'cloze' }),
      attempt({ skillId: 's1', channel: 'recog_mc' }),
      attempt({ skillId: 's1', channel: 'cloze' }),
    ]);
    expect(m.bySkill.s1.channels).toEqual(['cloze', 'recog_mc']);
  });

  it('omits channels=[] when no attempts had a channel', () => {
    const m = computeSessionMetrics([
      attempt({ skillId: 's1', channel: undefined }),
    ]);
    expect(m.bySkill.s1.channels).toEqual([]);
  });

  it('produces skill keys in lexicographic order', () => {
    const m = computeSessionMetrics([
      attempt({ skillId: 'z' }),
      attempt({ skillId: 'a' }),
      attempt({ skillId: 'm' }),
    ]);
    expect(Object.keys(m.bySkill)).toEqual(['a', 'm', 'z']);
  });
});

describe('computeSessionMetrics — order independence', () => {
  it('shuffling attempts does not change non-floating aggregates', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      attempt({
        itemId: `item-${i}`,
        skillId: `skill-${i % 3}`,
        channel: i % 2 === 0 ? 'recog_mc' : 'cloze',
        correct: i % 2 === 0,
        responseTimeMs: 1000 + i * 100,
      })
    );
    const a = computeSessionMetrics(records);
    const b = computeSessionMetrics([...records].reverse());
    expect(a.totalAttempts).toBe(b.totalAttempts);
    expect(a.correctCount).toBe(b.correctCount);
    expect(a.uniqueSkillsAttempted).toBe(b.uniqueSkillsAttempted);
    expect(a.medianResponseTimeMs).toBe(b.medianResponseTimeMs);
    expect(a.byChannel).toEqual(b.byChannel);
    expect(a.bySkill).toEqual(b.bySkill);
  });
});

describe('SessionMetricsLogger — record and compute', () => {
  it('records attempts per session and computes on demand', () => {
    const l = new SessionMetricsLogger();
    l.recordAttempt('s1', attempt({ correct: true }));
    l.recordAttempt('s1', attempt({ correct: false }));
    expect(l.computeMetrics('s1').totalAttempts).toBe(2);
    expect(l.computeMetrics('s1').accuracy).toBe(0.5);
  });

  it('isolates buffers across sessions', () => {
    const l = new SessionMetricsLogger();
    l.recordAttempt('s1', attempt({ correct: true }));
    l.recordAttempt('s2', attempt({ correct: false }));
    expect(l.computeMetrics('s1').correctCount).toBe(1);
    expect(l.computeMetrics('s2').correctCount).toBe(0);
  });

  it('computeMetrics on unknown session returns empty metrics', () => {
    const l = new SessionMetricsLogger();
    expect(l.computeMetrics('missing').totalAttempts).toBe(0);
  });

  it('getAttemptCount tracks buffer size', () => {
    const l = new SessionMetricsLogger();
    expect(l.getAttemptCount('s1')).toBe(0);
    l.recordAttempt('s1', attempt());
    l.recordAttempt('s1', attempt());
    expect(l.getAttemptCount('s1')).toBe(2);
  });

  it('getAttempts returns a defensive copy', () => {
    const l = new SessionMetricsLogger();
    l.recordAttempt('s1', attempt({ itemId: 'a' }));
    const copy = l.getAttempts('s1');
    copy[0].itemId = 'hacked';
    copy.push(attempt({ itemId: 'extra' }));
    expect(l.getAttempts('s1')[0].itemId).toBe('a');
    expect(l.getAttemptCount('s1')).toBe(1);
  });

  it('reset drops one session', () => {
    const l = new SessionMetricsLogger();
    l.recordAttempt('s1', attempt());
    l.recordAttempt('s2', attempt());
    l.reset('s1');
    expect(l.getAttemptCount('s1')).toBe(0);
    expect(l.getAttemptCount('s2')).toBe(1);
  });

  it('clearAll drops everything', () => {
    const l = new SessionMetricsLogger();
    l.recordAttempt('s1', attempt());
    l.recordAttempt('s2', attempt());
    l.clearAll();
    expect(l.getAttemptCount('s1')).toBe(0);
    expect(l.getAttemptCount('s2')).toBe(0);
  });
});

describe('SessionMetricsLogger — serialize / deserialize', () => {
  it('round-trips state losslessly', () => {
    const l = new SessionMetricsLogger();
    l.recordAttempt('s1', attempt({ correct: true }));
    l.recordAttempt('s1', attempt({ correct: false }));
    l.recordAttempt('s2', attempt({ channel: 'cloze' }));
    const restored = SessionMetricsLogger.deserialize(l.serialize());
    expect(restored.computeMetrics('s1')).toEqual(l.computeMetrics('s1'));
    expect(restored.computeMetrics('s2')).toEqual(l.computeMetrics('s2'));
  });

  it('produces stable JSON sorted by sessionId across runs', () => {
    function build(): string {
      const l = new SessionMetricsLogger();
      l.recordAttempt('z', attempt());
      l.recordAttempt('a', attempt());
      l.recordAttempt('m', attempt());
      return l.serialize();
    }
    expect(build()).toBe(build());
    const parsed = JSON.parse(build()) as Array<[string, unknown]>;
    expect(parsed.map((p) => p[0])).toEqual(['a', 'm', 'z']);
  });
});

describe('SessionMetricsLogger — replay determinism', () => {
  it('two loggers replaying the same event log produce identical metrics', () => {
    const events: AttemptRecord[] = [
      attempt({ itemId: 'a', skillId: 's1', correct: true, responseTimeMs: 1000 }),
      attempt({ itemId: 'b', skillId: 's2', correct: false, responseTimeMs: 2000 }),
      attempt({
        itemId: 'a',
        skillId: 's1',
        channel: 'cloze',
        correct: true,
        responseTimeMs: 3000,
      }),
    ];
    function run(): string {
      const l = new SessionMetricsLogger();
      for (const e of events) l.recordAttempt('s', e);
      return JSON.stringify(l.computeMetrics('s'));
    }
    expect(run()).toBe(run());
  });
});

describe('createSessionMetricsLogger factory', () => {
  it('returns a usable instance', () => {
    const l = createSessionMetricsLogger();
    l.recordAttempt('s', attempt());
    expect(l.computeMetrics('s').totalAttempts).toBe(1);
  });
});
