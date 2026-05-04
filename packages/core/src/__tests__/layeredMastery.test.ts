import { describe, it, expect } from 'vitest';
import {
  LayeredMasteryModel,
  createLayeredMasteryModel,
  makeChannelMapping,
  DEFAULT_LAYERED_MASTERY_CONFIG,
  NO_CHANNEL_MAPPING,
  type MasteryLayer,
} from '../mastery/index.js';
import type { ChannelSkillProbability } from '../learner/MultiChannelBKTEngine.js';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15 12:00 UTC
const NOW_24H_LATER = T0 + 24 * 60 * 60 * 1000;
const NOW_25H_LATER = T0 + 25 * 60 * 60 * 1000;
const NOW_23H_LATER = T0 + 23 * 60 * 60 * 1000;
const NEXT_DAY = T0 + 86_400_000;

function mkState(overrides: Partial<ChannelSkillProbability> = {}): ChannelSkillProbability {
  return {
    skillId: 's1',
    channel: 'recog_mc',
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
    ...overrides,
  };
}

/** Default state that meets ALL six Mastered gates. */
function masteredState(overrides: Partial<ChannelSkillProbability> = {}): ChannelSkillProbability {
  return mkState({
    pMastery: 0.9,
    attempts: 8,
    correctCount: 5,
    correctDays: ['2026-01-15', '2026-01-16'],
    firstSeenAt: T0,
    lastCorrect: true,
    ...overrides,
  });
}

describe('DEFAULT_LAYERED_MASTERY_CONFIG sanity', () => {
  it('matches converged eng+math values', () => {
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.learned.pMasteryThreshold).toBe(0.75);
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.learned.minAttempts).toBe(3);
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.mastered.pMasteryThreshold).toBe(0.85);
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.mastered.minAttempts).toBe(6);
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.mastered.minCorrect).toBe(3);
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.mastered.minCalendarDays).toBe(2);
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.mastered.coolingOffHours).toBe(24);
    expect(DEFAULT_LAYERED_MASTERY_CONFIG.mastered.requireLastCorrect).toBe(true);
  });
});

describe('LayeredMasteryModel — classifyChannel layer transitions', () => {
  const model = new LayeredMasteryModel();

  it('returns unstarted when no attempts', () => {
    const r = model.classifyChannel(mkState({ attempts: 0 }), NOW_25H_LATER);
    expect(r.layer).toBe<MasteryLayer>('unstarted');
  });

  it('returns learning when attempts > 0 but below Learned thresholds', () => {
    const r = model.classifyChannel(
      mkState({ pMastery: 0.5, attempts: 2 }),
      NOW_25H_LATER
    );
    expect(r.layer).toBe<MasteryLayer>('learning');
  });

  it('returns learning when below pMastery threshold even with enough attempts', () => {
    const r = model.classifyChannel(
      mkState({ pMastery: 0.74, attempts: 5 }),
      NOW_25H_LATER
    );
    expect(r.layer).toBe<MasteryLayer>('learning');
  });

  it('returns learned when crossing Learned but failing a Mastered gate', () => {
    const r = model.classifyChannel(
      mkState({ pMastery: 0.78, attempts: 4, correctCount: 2 }),
      NOW_25H_LATER
    );
    expect(r.layer).toBe<MasteryLayer>('learned');
  });

  it('returns mastered when all six gates pass', () => {
    const r = model.classifyChannel(masteredState(), NOW_25H_LATER);
    expect(r.layer).toBe<MasteryLayer>('mastered');
    expect(r.blockers).toEqual([]);
  });
});

describe('LayeredMasteryModel — Mastered gate blockers', () => {
  const model = new LayeredMasteryModel();

  it('blocks on pMastery threshold', () => {
    const r = model.classifyChannel(masteredState({ pMastery: 0.84 }), NOW_25H_LATER);
    expect(r.blockers.some((b) => b.includes('pMastery'))).toBe(true);
  });

  it('blocks on minAttempts', () => {
    const r = model.classifyChannel(masteredState({ attempts: 5 }), NOW_25H_LATER);
    expect(r.blockers.some((b) => b.includes('attempts <'))).toBe(true);
  });

  it('blocks on minCorrect', () => {
    const r = model.classifyChannel(masteredState({ correctCount: 2 }), NOW_25H_LATER);
    expect(r.blockers.some((b) => b.includes('correct <'))).toBe(true);
  });

  it('blocks on minCalendarDays', () => {
    const r = model.classifyChannel(
      masteredState({ correctDays: ['2026-01-15'] }),
      NOW_25H_LATER
    );
    expect(r.blockers.some((b) => b.includes('days with correct'))).toBe(true);
  });

  it('blocks on cooling-off', () => {
    const r = model.classifyChannel(masteredState(), NOW_23H_LATER);
    expect(r.blockers.some((b) => b.includes('since first seen'))).toBe(true);
  });

  it('exactly 24h cooling-off passes (>= boundary)', () => {
    const r = model.classifyChannel(masteredState(), NOW_24H_LATER);
    expect(r.layer).toBe('mastered');
  });

  it('blocks on lastCorrect=false', () => {
    const r = model.classifyChannel(masteredState({ lastCorrect: false }), NOW_25H_LATER);
    expect(r.blockers.some((b) => b.includes('Last attempt was not correct'))).toBe(true);
  });

  it('blocks on lastCorrect=null (never attempted) — but unstarted gate would also fire', () => {
    // attempts=0 means gate goes through unstarted, but if attempts>0 + lastCorrect=null
    // it's a malformed state we should still report.
    const r = model.classifyChannel(masteredState({ lastCorrect: null }), NOW_25H_LATER);
    expect(r.blockers.some((b) => b.includes('Last attempt was not correct'))).toBe(true);
  });

  it('reports multiple blockers when multiple gates fail', () => {
    const r = model.classifyChannel(
      masteredState({ attempts: 3, correctCount: 1, lastCorrect: false }),
      NOW_25H_LATER
    );
    expect(r.blockers.length).toBeGreaterThanOrEqual(3);
  });
});

describe('LayeredMasteryModel — config overrides', () => {
  it('honors a stricter learned threshold', () => {
    const m = new LayeredMasteryModel({ learned: { pMasteryThreshold: 0.9, minAttempts: 3 } });
    const r = m.classifyChannel(
      mkState({ pMastery: 0.85, attempts: 5 }),
      NOW_25H_LATER
    );
    expect(r.layer).toBe('learning');
  });

  it('honors requireLastCorrect=false to allow Mastered without recent correct', () => {
    const m = new LayeredMasteryModel({
      mastered: {
        ...DEFAULT_LAYERED_MASTERY_CONFIG.mastered,
        requireLastCorrect: false,
      },
    });
    const r = m.classifyChannel(masteredState({ lastCorrect: false }), NOW_25H_LATER);
    expect(r.layer).toBe('mastered');
  });

  it('deep-merges partial config (override only one field of mastered)', () => {
    const m = new LayeredMasteryModel({
      mastered: { ...DEFAULT_LAYERED_MASTERY_CONFIG.mastered, minAttempts: 100 },
    });
    const r = m.classifyChannel(masteredState({ attempts: 50 }), NOW_25H_LATER);
    expect(r.layer).toBe('learned');
    expect(r.blockers.some((b) => b.includes('100 required'))).toBe(true);
  });
});

describe('LayeredMasteryModel — classifySkill aggregation', () => {
  const channelMapping = makeChannelMapping((skillId) => {
    if (skillId.startsWith('grammar_')) {
      return { primary: 'cloze', secondary: 'prod_typed' };
    }
    return { primary: 'recog_mc', secondary: 'prod_typed' };
  });
  const model = new LayeredMasteryModel({}, channelMapping);

  it('returns unstarted for empty channel list', () => {
    const r = model.classifySkill('vocab_word', [], NOW_25H_LATER);
    expect(r.layer).toBe('unstarted');
    expect(r.avgPMastery).toBe(0);
  });

  it('returns mastered when ≥2 channels are mastered', () => {
    const states = [
      masteredState({ channel: 'recog_mc' }),
      masteredState({ channel: 'cloze' }),
    ];
    expect(model.classifySkill('vocab_word', states, NOW_25H_LATER).layer).toBe('mastered');
  });

  it('returns mastered when primary mastered AND secondary learned', () => {
    const states = [
      masteredState({ channel: 'recog_mc' }), // primary for vocab
      mkState({ channel: 'prod_typed', pMastery: 0.78, attempts: 4, correctCount: 2 }),
    ];
    const r = model.classifySkill('vocab_word', states, NOW_25H_LATER);
    expect(r.channels.find((c) => c.channel === 'prod_typed')!.layer).toBe('learned');
    expect(r.layer).toBe('mastered');
  });

  it('returns learned when only primary is mastered (secondary still learning)', () => {
    const states = [
      masteredState({ channel: 'recog_mc' }),
      mkState({ channel: 'prod_typed', pMastery: 0.5, attempts: 2 }),
    ];
    expect(model.classifySkill('vocab_word', states, NOW_25H_LATER).layer).toBe('learned');
  });

  it('uses single-channel fallback when only one channel has data and is mastered', () => {
    const states = [masteredState({ channel: 'recog_mc' })];
    expect(model.classifySkill('vocab_word', states, NOW_25H_LATER).layer).toBe('mastered');
  });

  it('falls back to unstarted when no channels have data', () => {
    const states = [mkState({ channel: 'recog_mc', attempts: 0 })];
    expect(model.classifySkill('vocab_word', states, NOW_25H_LATER).layer).toBe('unstarted');
  });

  it('reports primaryChannel/secondaryChannel from mapping', () => {
    const r = model.classifySkill('grammar_verbs', [], NOW_25H_LATER);
    expect(r.primaryChannel).toBe('cloze');
    expect(r.secondaryChannel).toBe('prod_typed');
  });

  it('returns null primary/secondary when no mapping is supplied', () => {
    const m = new LayeredMasteryModel({}, NO_CHANNEL_MAPPING);
    const r = m.classifySkill('any_skill', [masteredState()], NOW_25H_LATER);
    expect(r.primaryChannel).toBeNull();
    expect(r.secondaryChannel).toBeNull();
    // Single-channel fallback should still mark this as mastered
    expect(r.layer).toBe('mastered');
  });

  it('computes avgPMastery only across channels with attempts > 0', () => {
    const states = [
      mkState({ channel: 'recog_mc', pMastery: 0.8, attempts: 4 }),
      mkState({ channel: 'cloze', pMastery: 0.9, attempts: 6 }),
      mkState({ channel: 'prod_typed', pMastery: 0.5, attempts: 0 }), // ignored
    ];
    const r = model.classifySkill('vocab_word', states, NOW_25H_LATER);
    expect(r.avgPMastery).toBeCloseTo(0.85, 6);
  });

  it('skill is learned if ANY channel is learned or mastered', () => {
    const states = [
      mkState({ channel: 'recog_mc', pMastery: 0.78, attempts: 4 }),
      mkState({ channel: 'cloze', pMastery: 0.5, attempts: 2 }),
    ];
    const r = model.classifySkill('vocab_word', states, NOW_25H_LATER);
    expect(r.layer).toBe('learned');
  });
});

describe('LayeredMasteryModel — classifyPack', () => {
  const model = new LayeredMasteryModel();

  it('classifies every skill in the pack', () => {
    const pack = new Map<string, ChannelSkillProbability[]>([
      ['s1', [masteredState({ channel: 'recog_mc' })]],
      [
        's2',
        [mkState({ channel: 'recog_mc', pMastery: 0.78, attempts: 4, correctCount: 2 })],
      ],
      ['s3', [mkState({ channel: 'recog_mc', attempts: 0 })]],
    ]);
    const out = model.classifyPack(pack, NOW_25H_LATER);
    expect(out.size).toBe(3);
    expect(out.get('s1')!.layer).toBe('mastered');
    expect(out.get('s2')!.layer).toBe('learned');
    expect(out.get('s3')!.layer).toBe('unstarted');
  });
});

describe('LayeredMasteryModel — summarizePack', () => {
  const model = new LayeredMasteryModel();

  it('counts learned/mastered/total + per-channel breakdown', () => {
    const pack = new Map<string, ChannelSkillProbability[]>([
      ['s1', [masteredState({ channel: 'recog_mc' }), masteredState({ channel: 'cloze' })]],
      [
        's2',
        [
          mkState({ channel: 'recog_mc', pMastery: 0.78, attempts: 4, correctCount: 2 }),
          mkState({ channel: 'cloze', pMastery: 0.5, attempts: 2 }),
        ],
      ],
      ['s3', [mkState({ channel: 'recog_mc', attempts: 0 })]],
    ]);
    const summary = model.summarizePack(pack, NOW_25H_LATER);
    expect(summary.totalSkills).toBe(3);
    // s1 is mastered (both channels mastered) → counts as both learned and mastered
    // s2 is learned (recog_mc reached learned, cloze still learning)
    // s3 is unstarted
    expect(summary.skillsMastered).toBe(1);
    expect(summary.skillsLearned).toBe(2); // s1 + s2
    // Per-channel breakdown
    expect(summary.channelBreakdown.recog_mc.total).toBe(3);
    expect(summary.channelBreakdown.recog_mc.mastered).toBe(1);
    expect(summary.channelBreakdown.recog_mc.learned).toBe(2); // recog_mc on s1 (mastered) + s2 (learned)
    expect(summary.channelBreakdown.cloze.total).toBe(2);
    expect(summary.channelBreakdown.cloze.mastered).toBe(1);
  });

  it('avgPMastery only counts channels with attempts > 0', () => {
    const pack = new Map<string, ChannelSkillProbability[]>([
      [
        's1',
        [
          mkState({ channel: 'recog_mc', pMastery: 1.0, attempts: 1 }),
          mkState({ channel: 'cloze', pMastery: 0.0, attempts: 0 }),
        ],
      ],
    ]);
    const summary = model.summarizePack(pack, NOW_25H_LATER);
    expect(summary.avgPMastery).toBe(1.0);
  });

  it('avgPMastery is 0 for an empty pack', () => {
    const summary = model.summarizePack(new Map(), NOW_25H_LATER);
    expect(summary.avgPMastery).toBe(0);
    expect(summary.totalSkills).toBe(0);
  });
});

describe('LayeredMasteryModel — revokeOnError (soft revocation)', () => {
  const model = new LayeredMasteryModel();

  it('flips lastCorrect=false but preserves pMastery', () => {
    const before = masteredState({ pMastery: 0.92 });
    const after = model.revokeOnError(before, NOW_25H_LATER);
    expect(after.lastCorrect).toBe(false);
    expect(after.pMastery).toBe(0.92);
    expect(after.attempts).toBe(before.attempts);
    expect(after.correctCount).toBe(before.correctCount);
  });

  it('updates lastUpdated timestamp', () => {
    const before = masteredState();
    const after = model.revokeOnError(before, NOW_25H_LATER);
    expect(after.lastUpdated).toBe(NOW_25H_LATER);
  });

  it('does not mutate the input state', () => {
    const before = masteredState();
    model.revokeOnError(before, NOW_25H_LATER);
    expect(before.lastCorrect).toBe(true); // unchanged
  });

  it('post-revocation classification reports not-mastered with lastCorrect blocker', () => {
    const before = masteredState();
    const after = model.revokeOnError(before, NOW_25H_LATER);
    const status = model.classifyChannel(after, NOW_25H_LATER);
    expect(status.layer).toBe('learned'); // still ≥0.75 + ≥3 attempts
    expect(status.blockers.some((b) => b.includes('Last attempt was not correct'))).toBe(true);
  });
});

describe('LayeredMasteryModel — replay determinism', () => {
  it('classifyChannel with same inputs always produces same output', () => {
    const m = new LayeredMasteryModel();
    const s = masteredState();
    const a = m.classifyChannel(s, NOW_25H_LATER);
    const b = m.classifyChannel(s, NOW_25H_LATER);
    expect(a).toEqual(b);
  });

  it('classifySkill with same inputs always produces same output', () => {
    const m = new LayeredMasteryModel();
    const states = [
      masteredState({ channel: 'recog_mc' }),
      mkState({ channel: 'prod_typed', pMastery: 0.78, attempts: 4, correctCount: 2 }),
    ];
    const a = m.classifySkill('s1', states, NOW_25H_LATER);
    const b = m.classifySkill('s1', states, NOW_25H_LATER);
    expect(a).toEqual(b);
  });
});

describe('createLayeredMasteryModel + makeChannelMapping', () => {
  it('factory returns a usable instance', () => {
    const m = createLayeredMasteryModel();
    expect(m.classifyChannel(masteredState(), NOW_25H_LATER).layer).toBe('mastered');
  });

  it('makeChannelMapping wraps a function as SkillChannelMapping', () => {
    const mapping = makeChannelMapping((skillId) => ({
      primary: skillId === 'a' ? 'x' : null,
      secondary: null,
    }));
    expect(mapping.forSkill('a').primary).toBe('x');
    expect(mapping.forSkill('b').primary).toBeNull();
  });
});

describe('LayeredMasteryModel — calendar-day boundary semantics (UTC)', () => {
  const model = new LayeredMasteryModel();

  it('respects the 2-day rule independent of clock time-of-day', () => {
    // Two correct days ≥2 — qualifies even if same wall-clock hour.
    const s = masteredState({ correctDays: ['2026-01-15', '2026-01-16'] });
    expect(model.classifyChannel(s, NOW_25H_LATER).layer).toBe('mastered');
  });

  it('two attempts on the same UTC date count as one day (deduplication invariant)', () => {
    // Two correct attempts on 2026-01-15 (same UTC date) → single entry.
    // (This is enforced by MultiChannelBKTEngine.computeUpdate, not by mastery model;
    //  this test asserts the mastery model honors the input correctly.)
    const s = masteredState({ correctDays: ['2026-01-15'] });
    const r = model.classifyChannel(s, NOW_25H_LATER);
    expect(r.layer).toBe('learned');
    expect(r.blockers.some((b) => b.includes('days with correct'))).toBe(true);
  });
});
