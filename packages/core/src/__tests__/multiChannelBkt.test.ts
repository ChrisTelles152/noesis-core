import { describe, it, expect } from 'vitest';
import {
  MultiChannelBKTEngine,
  createMultiChannelBKTEngine,
  calculateBKTUpdate,
  applyCategoryModifier,
  utcDateString,
  DEFAULT_DRILLING_DISCOUNT,
  type MultiChannelBKTConfig,
} from '../learner/index.js';

const ENG_LIKE_CONFIG: MultiChannelBKTConfig = {
  channels: {
    recog_mc: { pInit: 0.12, pLearn: 0.04, pSlip: 0.1, pGuess: 0.25 },
    cloze: { pInit: 0.1, pLearn: 0.035, pSlip: 0.12, pGuess: 0.15 },
    prod_typed: { pInit: 0.08, pLearn: 0.03, pSlip: 0.06, pGuess: 0.08 },
  },
  skillCategoryModifiers: {
    grammar: { pLearnMultiplier: 0.85, pSlipAdd: 0.03 },
  },
};

const MATH_LIKE_CONFIG: MultiChannelBKTConfig = {
  channels: {
    typed_answer: { pInit: 0.05, pLearn: 0.04, pSlip: 0.05, pGuess: 0.02 },
    multiple_choice: { pInit: 0.1, pLearn: 0.035, pSlip: 0.08, pGuess: 0.25 },
  },
};

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15 12:00 UTC
const T1 = T0 + 60_000; // +1 minute
const NEXT_DAY = T0 + 86_400_000; // +1 day
const TWO_DAYS = T0 + 2 * 86_400_000;

describe('utcDateString()', () => {
  it('returns YYYY-MM-DD UTC', () => {
    expect(utcDateString(T0)).toBe('2026-01-15');
    expect(utcDateString(NEXT_DAY)).toBe('2026-01-16');
  });

  it('handles same calendar day across timestamps', () => {
    const sameDay = T0 + 60_000;
    expect(utcDateString(T0)).toBe(utcDateString(sameDay));
  });
});

describe('applyCategoryModifier()', () => {
  it('returns unchanged params when modifier is undefined', () => {
    const p = { pInit: 0.1, pLearn: 0.04, pSlip: 0.1, pGuess: 0.2 };
    expect(applyCategoryModifier(p, undefined)).toEqual(p);
  });

  it('multiplies pLearn and adds to pSlip', () => {
    const p = { pInit: 0.1, pLearn: 0.04, pSlip: 0.1, pGuess: 0.2 };
    const out = applyCategoryModifier(p, { pLearnMultiplier: 0.85, pSlipAdd: 0.03 });
    expect(out.pLearn).toBeCloseTo(0.034, 10);
    expect(out.pSlip).toBeCloseTo(0.13, 10);
    expect(out.pInit).toBe(p.pInit);
    expect(out.pGuess).toBe(p.pGuess);
  });

  it('treats missing modifier fields as identity', () => {
    const p = { pInit: 0.1, pLearn: 0.04, pSlip: 0.1, pGuess: 0.2 };
    const a = applyCategoryModifier(p, { pLearnMultiplier: 0.5 });
    expect(a.pInit).toBe(0.1);
    expect(a.pLearn).toBeCloseTo(0.02, 10);
    expect(a.pSlip).toBe(0.1);
    expect(a.pGuess).toBe(0.2);

    const b = applyCategoryModifier(p, { pSlipAdd: 0.02 });
    expect(b.pInit).toBe(0.1);
    expect(b.pLearn).toBe(0.04);
    expect(b.pSlip).toBeCloseTo(0.12, 10);
    expect(b.pGuess).toBe(0.2);
  });
});

describe('calculateBKTUpdate() — pure', () => {
  const params = { pInit: 0.3, pLearn: 0.1, pSlip: 0.1, pGuess: 0.2 };

  it('moves pMastery up on a correct answer', () => {
    expect(calculateBKTUpdate(0.3, true, params)).toBeGreaterThan(0.3);
  });

  it('moves pMastery down on incorrect (subject to learning bump)', () => {
    // Even on incorrect, the learning transition adds (1 - posterior) * pLearn,
    // so the post-update value is >= the Bayesian posterior. Verify it's
    // STRICTLY less than current — the audit's example expects ~0.15 from 0.3.
    const out = calculateBKTUpdate(0.3, false, params);
    expect(out).toBeLessThan(0.3);
  });

  it('respects the discount factor', () => {
    const noDiscount = calculateBKTUpdate(0.3, true, params, 1.0);
    const halfDiscount = calculateBKTUpdate(0.3, true, params, 0.5);
    const noLearning = calculateBKTUpdate(0.3, true, params, 0.0);
    expect(noDiscount).toBeGreaterThan(halfDiscount);
    expect(halfDiscount).toBeGreaterThan(noLearning);
  });

  it('clamps to [0, 1]', () => {
    expect(calculateBKTUpdate(0, true, params)).toBeGreaterThanOrEqual(0);
    expect(calculateBKTUpdate(1, true, params)).toBeLessThanOrEqual(1);
    expect(calculateBKTUpdate(0, false, params)).toBeGreaterThanOrEqual(0);
    expect(calculateBKTUpdate(1, false, params)).toBeLessThanOrEqual(1);
  });
});

describe('MultiChannelBKTEngine — construction', () => {
  it('rejects an empty channels record', () => {
    expect(() => new MultiChannelBKTEngine({ channels: {} })).toThrow(/channels/);
  });

  it('rejects invalid BKT params per channel with a clear path', () => {
    expect(
      () =>
        new MultiChannelBKTEngine({
          channels: { x: { pInit: 0.1, pLearn: 0.1, pSlip: 0, pGuess: 0.2 } },
        })
    ).toThrow(/channel "x"/);
  });

  it('accepts the noesis-eng three-channel config', () => {
    expect(() => new MultiChannelBKTEngine(ENG_LIKE_CONFIG)).not.toThrow();
  });

  it('accepts the noesis-math two-channel config', () => {
    expect(() => new MultiChannelBKTEngine(MATH_LIKE_CONFIG)).not.toThrow();
  });
});

describe('MultiChannelBKTEngine — initialState / getState', () => {
  it('initializes pMastery to channel pInit', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const s = e.initialState('verb_present', 'recog_mc', T0);
    expect(s.pMastery).toBe(0.12);
    expect(s.attempts).toBe(0);
    expect(s.correctCount).toBe(0);
    expect(s.correctDays).toEqual([]);
    expect(s.firstSeenAt).toBe(T0);
  });

  it('throws on unknown channel in initialState', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    expect(() => e.initialState('s', 'bogus', T0)).toThrow(/Channel "bogus"/);
  });

  it('getState lazy-initializes for unseen (skill, channel)', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const s = e.getState('verb_present', 'cloze', T0);
    expect(s.pMastery).toBe(0.1);
    expect(s.skillId).toBe('verb_present');
    expect(s.channel).toBe('cloze');
  });
});

describe('MultiChannelBKTEngine — applyAttempt basic flow', () => {
  it('updates attempts/correctCount and pMastery on a correct attempt', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const result = e.applyAttempt({
      skillId: 'verb_present',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T0,
    });
    expect(result.before).toEqual({ pMastery: 0.12, attempts: 0, correctCount: 0 });
    expect(result.after.attempts).toBe(1);
    expect(result.after.correctCount).toBe(1);
    expect(result.after.pMastery).toBeGreaterThan(0.12);
    expect(result.discounted).toBe(false);
    expect(result.correctDaysCountAfter).toBe(1);
  });

  it('records firstCorrectAt on the first correct attempt only', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: false,
      sessionId: 's1',
      now: T0,
    });
    const stateAfterIncorrect = e.getState('a', 'recog_mc');
    expect(stateAfterIncorrect.firstCorrectAt).toBeNull();

    e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T1,
    });
    const stateAfterCorrect = e.getState('a', 'recog_mc');
    expect(stateAfterCorrect.firstCorrectAt).toBe(T1);

    e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T1 + 1000,
    });
    const stateAfterSecondCorrect = e.getState('a', 'recog_mc');
    // firstCorrectAt is sticky — does not move on subsequent correct answers.
    expect(stateAfterSecondCorrect.firstCorrectAt).toBe(T1);
  });

  it('appends correctDays only when crossing UTC date boundaries', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    e.applyAttempt({ skillId: 'a', channel: 'recog_mc', correct: true, sessionId: 's1', now: T0 });
    e.applyAttempt({ skillId: 'a', channel: 'recog_mc', correct: true, sessionId: 's1', now: T1 }); // same day
    expect(e.getState('a', 'recog_mc').correctDays).toEqual(['2026-01-15']);

    e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: NEXT_DAY,
    });
    expect(e.getState('a', 'recog_mc').correctDays).toEqual(['2026-01-15', '2026-01-16']);
  });

  it('does not add to correctDays on incorrect attempts', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    e.applyAttempt({ skillId: 'a', channel: 'recog_mc', correct: false, sessionId: 's1', now: T0 });
    expect(e.getState('a', 'recog_mc').correctDays).toEqual([]);
  });

  it('throws on unknown channel', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    expect(() =>
      e.applyAttempt({ skillId: 'a', channel: 'bogus', correct: true, sessionId: 's1', now: T0 })
    ).toThrow(/bogus/);
  });
});

describe('MultiChannelBKTEngine — channel isolation', () => {
  it('keeps state independent across channels for the same skill', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    e.applyAttempt({
      skillId: 'verb_present',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T0,
    });
    expect(e.getPMastery('verb_present', 'recog_mc')).toBeGreaterThan(0.12);
    expect(e.getPMastery('verb_present', 'cloze')).toBe(0.1);
    expect(e.getPMastery('verb_present', 'prod_typed')).toBe(0.08);
  });

  it('keeps state independent across skills', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    e.applyAttempt({ skillId: 'a', channel: 'recog_mc', correct: true, sessionId: 's', now: T0 });
    e.applyAttempt({ skillId: 'b', channel: 'recog_mc', correct: false, sessionId: 's', now: T0 });
    expect(e.getPMastery('a', 'recog_mc')).toBeGreaterThan(0.12);
    expect(e.getPMastery('b', 'recog_mc')).toBeLessThan(0.12);
  });
});

describe('MultiChannelBKTEngine — drilling discount', () => {
  it('does NOT discount on attempts 1 or 2 (default threshold = >2)', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const r1 = e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T0,
    });
    const r2 = e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T0 + 1000,
    });
    expect(r1.discounted).toBe(false);
    expect(r2.discounted).toBe(false);
  });

  it('DOES discount starting at attempt 3 in the same session', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    for (let i = 0; i < 2; i++) {
      e.applyAttempt({
        skillId: 'a',
        channel: 'recog_mc',
        correct: true,
        sessionId: 's1',
        now: T0 + i * 1000,
      });
    }
    const r3 = e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T0 + 2000,
    });
    expect(r3.discounted).toBe(true);
  });

  it('resets sessionAttempts when sessionId changes', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    for (let i = 0; i < 4; i++) {
      e.applyAttempt({
        skillId: 'a',
        channel: 'recog_mc',
        correct: true,
        sessionId: 's1',
        now: T0 + i * 1000,
      });
    }
    expect(e.getState('a', 'recog_mc').sessionAttempts).toBe(4);

    const r = e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's2',
      now: T0 + 5000,
    });
    expect(r.discounted).toBe(false);
    expect(e.getState('a', 'recog_mc').sessionAttempts).toBe(1);
  });

  it('honors a custom discount threshold and multiplier', () => {
    const cfg: MultiChannelBKTConfig = {
      ...ENG_LIKE_CONFIG,
      drillingDiscount: { attemptsBeforeDiscount: 0, multiplier: 0.5 },
    };
    const e = new MultiChannelBKTEngine(cfg);
    const r1 = e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's',
      now: T0,
    });
    expect(r1.discounted).toBe(true);
  });

  it('uses DEFAULT_DRILLING_DISCOUNT when config omits it', () => {
    const e = new MultiChannelBKTEngine({ channels: ENG_LIKE_CONFIG.channels });
    // Verify the threshold by behavior: 3rd attempt should be discounted.
    for (let i = 0; i < 2; i++) {
      e.applyAttempt({
        skillId: 'a',
        channel: 'recog_mc',
        correct: true,
        sessionId: 's',
        now: T0 + i * 1000,
      });
    }
    const r3 = e.applyAttempt({
      skillId: 'a',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's',
      now: T0 + 2000,
    });
    expect(r3.discounted).toBe(true);
    expect(DEFAULT_DRILLING_DISCOUNT.attemptsBeforeDiscount).toBe(2);
  });
});

describe('MultiChannelBKTEngine — skill category modifier', () => {
  it('grammar items learn slower than vocabulary (English values)', () => {
    const e1 = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const e2 = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);

    const grammarResult = e1.applyAttempt({
      skillId: 's',
      channel: 'cloze',
      correct: true,
      sessionId: 'x',
      now: T0,
      skillCategory: 'grammar',
    });
    const vocabResult = e2.applyAttempt({
      skillId: 's',
      channel: 'cloze',
      correct: true,
      sessionId: 'x',
      now: T0,
    });
    expect(grammarResult.after.pMastery).toBeLessThan(vocabResult.after.pMastery);
  });

  it('ignores unknown category names', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const r = e.applyAttempt({
      skillId: 's',
      channel: 'cloze',
      correct: true,
      sessionId: 'x',
      now: T0,
      skillCategory: 'unknown_category',
    });
    expect(r.after.pMastery).toBeGreaterThan(0.1);
  });

  it('does not apply modifier when skillCategory is omitted', () => {
    const e1 = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const e2 = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const a = e1.applyAttempt({
      skillId: 's',
      channel: 'cloze',
      correct: true,
      sessionId: 'x',
      now: T0,
    });
    const b = e2.applyAttempt({
      skillId: 's',
      channel: 'cloze',
      correct: true,
      sessionId: 'x',
      now: T0,
    });
    expect(a.after.pMastery).toBe(b.after.pMastery);
  });
});

describe('MultiChannelBKTEngine — observability', () => {
  it('returns deep defensive copies from getAllStates', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    e.applyAttempt({ skillId: 'a', channel: 'recog_mc', correct: true, sessionId: 's', now: T0 });
    const snap = e.getAllStates();
    snap.get('a')!.get('recog_mc')!.correctDays.push('hacked');
    expect(e.getState('a', 'recog_mc').correctDays).not.toContain('hacked');
  });

  it('getPMastery returns pInit for unseen state', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    expect(e.getPMastery('never_seen', 'recog_mc')).toBe(0.12);
    expect(e.getPMastery('never_seen', 'cloze')).toBe(0.1);
  });

  it('getPMastery returns 0 when both skill and channel are unknown', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    expect(e.getPMastery('s', 'no_such_channel')).toBe(0);
  });
});

describe('MultiChannelBKTEngine — serialize / deserialize', () => {
  it('round-trips state and config losslessly', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    e.applyAttempt({
      skillId: 'verb_present',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T0,
    });
    e.applyAttempt({
      skillId: 'verb_present',
      channel: 'cloze',
      correct: false,
      sessionId: 's1',
      now: T1,
      skillCategory: 'grammar',
    });
    e.applyAttempt({
      skillId: 'noun_plural',
      channel: 'prod_typed',
      correct: true,
      sessionId: 's1',
      now: NEXT_DAY,
    });

    const restored = MultiChannelBKTEngine.deserialize(e.serialize());

    for (const [skillId, byChan] of e.getAllStates()) {
      for (const [chan, original] of byChan) {
        const r = restored.getState(skillId, chan);
        expect(r).toEqual(original);
      }
    }
  });

  it('produces a stable JSON shape across runs (sorted keys)', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    // Apply in scrambled order:
    e.applyAttempt({ skillId: 'z', channel: 'cloze', correct: true, sessionId: 's', now: T0 });
    e.applyAttempt({ skillId: 'a', channel: 'recog_mc', correct: true, sessionId: 's', now: T0 });
    e.applyAttempt({
      skillId: 'm',
      channel: 'prod_typed',
      correct: false,
      sessionId: 's',
      now: T0,
    });

    const json = e.serialize();
    const parsed = JSON.parse(json) as { state: [string, unknown][] };
    const skillIds = parsed.state.map((s) => s[0]);
    expect(skillIds).toEqual([...skillIds].sort());
  });
});

describe('MultiChannelBKTEngine — replay determinism', () => {
  it('produces identical state across two runs of the same event log', () => {
    const events: {
      skillId: string;
      channel: string;
      correct: boolean;
      sessionId: string;
      now: number;
      skillCategory?: string;
    }[] = [
      {
        skillId: 'verb_present',
        channel: 'recog_mc',
        correct: true,
        sessionId: 's1',
        now: T0,
      },
      {
        skillId: 'verb_present',
        channel: 'cloze',
        correct: false,
        sessionId: 's1',
        now: T0 + 1000,
        skillCategory: 'grammar',
      },
      {
        skillId: 'verb_present',
        channel: 'cloze',
        correct: true,
        sessionId: 's1',
        now: T0 + 2000,
        skillCategory: 'grammar',
      },
      {
        skillId: 'noun_plural',
        channel: 'prod_typed',
        correct: true,
        sessionId: 's1',
        now: T0 + 3000,
      },
      {
        skillId: 'verb_present',
        channel: 'recog_mc',
        correct: true,
        sessionId: 's2', // session boundary
        now: NEXT_DAY,
      },
      {
        skillId: 'verb_present',
        channel: 'recog_mc',
        correct: false,
        sessionId: 's2',
        now: NEXT_DAY + 1000,
      },
    ];

    function run(): string {
      const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
      for (const ev of events) e.applyAttempt(ev);
      return e.serialize();
    }
    expect(run()).toBe(run());
  });
});

describe('MultiChannelBKTEngine — static computeUpdate (pure)', () => {
  it('matches applyAttempt output for the same input state', () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    const initial = e.initialState('s', 'recog_mc', T0);

    const computed = MultiChannelBKTEngine.computeUpdate(initial, true, 's1', ENG_LIKE_CONFIG, T0);
    const applied = e.applyAttempt({
      skillId: 's',
      channel: 'recog_mc',
      correct: true,
      sessionId: 's1',
      now: T0,
    });

    expect(applied.after.pMastery).toBeCloseTo(computed.newPMastery, 12);
    expect(applied.discounted).toBe(computed.discounted);
    expect(applied.correctDaysCountAfter).toBe(computed.correctDays.length);
  });

  it('throws on unknown channel in static computeUpdate', () => {
    const fakeState = {
      skillId: 's',
      channel: 'bogus',
      pMastery: 0.5,
      attempts: 0,
      correctCount: 0,
      sessionAttempts: 0,
      currentSessionId: null,
      correctDays: [],
      firstSeenAt: T0,
      firstCorrectAt: null,
      lastAttemptAt: null,
      lastCorrect: null,
      lastUpdated: T0,
    };
    expect(() =>
      MultiChannelBKTEngine.computeUpdate(fakeState, true, 's1', ENG_LIKE_CONFIG, T0)
    ).toThrow(/bogus/);
  });
});

describe('createMultiChannelBKTEngine factory', () => {
  it('returns a usable instance', () => {
    const e = createMultiChannelBKTEngine(MATH_LIKE_CONFIG);
    expect(e.getPMastery('s', 'typed_answer')).toBe(0.05);
  });
});

describe('MultiChannelBKTEngine — convergence smoke (5 correct in a row past Mastered floor)', () => {
  it("reaches pMastery >= 0.85 within the eng audit's typical 6-attempt regime", () => {
    const e = new MultiChannelBKTEngine(ENG_LIKE_CONFIG);
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const day = TWO_DAYS + i * 600_000; // span 2 days, 10 min apart
      const r = e.applyAttempt({
        skillId: 's',
        channel: 'recog_mc',
        correct: true,
        sessionId: i < 3 ? 's1' : 's2',
        now: day,
      });
      last = r.after.pMastery;
    }
    expect(last).toBeGreaterThanOrEqual(0.85);
  });
});
