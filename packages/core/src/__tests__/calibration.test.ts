import { describe, it, expect } from 'vitest';
import {
  EloDifficultyCalibrator,
  createEloDifficultyCalibrator,
  expectedProbability,
  updateRatings,
  DEFAULT_ELO_CONFIG,
} from '../calibration/index.js';

describe('expectedProbability()', () => {
  it('returns 0.5 when ratings are equal', () => {
    expect(expectedProbability(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it('returns >0.5 when learner outranks item', () => {
    expect(expectedProbability(1500, 1200)).toBeGreaterThan(0.5);
  });

  it('returns <0.5 when item outranks learner', () => {
    expect(expectedProbability(1000, 1500)).toBeLessThan(0.5);
  });

  it('returns ~0.909 for a 400-point learner advantage (10:1 odds)', () => {
    // P = 1 / (1 + 10^(-1)) = 10/11 ≈ 0.9091
    expect(expectedProbability(1600, 1200)).toBeCloseTo(10 / 11, 6);
  });

  it('is symmetric: P(a vs b) + P(b vs a) === 1', () => {
    const p1 = expectedProbability(1500, 1200);
    const p2 = expectedProbability(1200, 1500);
    expect(p1 + p2).toBeCloseTo(1, 10);
  });
});

describe('updateRatings() — pure', () => {
  it('moves learner up and item down on a correct answer', () => {
    const out = updateRatings(1200, 1200, true);
    expect(out.learnerRating).toBeGreaterThan(1200);
    expect(out.itemRating).toBeLessThan(1200);
  });

  it('moves learner down and item up on an incorrect answer', () => {
    const out = updateRatings(1200, 1200, false);
    expect(out.learnerRating).toBeLessThan(1200);
    expect(out.itemRating).toBeGreaterThan(1200);
  });

  it('shifts more for an upset (learner correct on a much harder item)', () => {
    const expected = updateRatings(1200, 1500, true);
    const baseline = updateRatings(1200, 1200, true);
    const shiftExpected = expected.learnerRating - 1200;
    const shiftBaseline = baseline.learnerRating - 1200;
    expect(shiftExpected).toBeGreaterThan(shiftBaseline);
  });

  it('clamps to [minRating, maxRating]', () => {
    const out = updateRatings(99, 99, true, {
      ...DEFAULT_ELO_CONFIG,
      minRating: 100,
      maxRating: 3000,
    });
    expect(out.learnerRating).toBeGreaterThanOrEqual(100);
    expect(out.itemRating).toBeGreaterThanOrEqual(100);
  });

  it('respects custom K factors', () => {
    const slow = updateRatings(1200, 1200, true, {
      ...DEFAULT_ELO_CONFIG,
      kLearner: 1,
    });
    const fast = updateRatings(1200, 1200, true, {
      ...DEFAULT_ELO_CONFIG,
      kLearner: 64,
    });
    expect(fast.learnerRating - 1200).toBeGreaterThan(slow.learnerRating - 1200);
  });
});

describe('EloDifficultyCalibrator — basic stateful flow', () => {
  it('returns defaultRating for unseen skills/items', () => {
    const c = new EloDifficultyCalibrator();
    expect(c.getLearnerRating('skill_a')).toBe(DEFAULT_ELO_CONFIG.defaultRating);
    expect(c.getItemRating('item_x')).toBe(DEFAULT_ELO_CONFIG.defaultRating);
  });

  it('honors a custom defaultRating', () => {
    const c = new EloDifficultyCalibrator({ defaultRating: 1500 });
    expect(c.getLearnerRating('skill_a')).toBe(1500);
  });

  it('updates both learner and item state on recordAnswer', () => {
    const c = new EloDifficultyCalibrator();
    const before = c.getLearnerRating('skill_a');
    const out = c.recordAnswer('skill_a', 'item_x', true);
    expect(c.getLearnerRating('skill_a')).toBe(out.learnerRating);
    expect(c.getItemRating('item_x')).toBe(out.itemRating);
    expect(c.getLearnerRating('skill_a')).toBeGreaterThan(before);
  });

  it('returns prior expected probability on each update', () => {
    const c = new EloDifficultyCalibrator();
    const out = c.recordAnswer('skill_a', 'item_x', true);
    expect(out.expectedP).toBeCloseTo(0.5, 10); // both at default 1200
  });

  it('keeps skill ratings independent across skills', () => {
    const c = new EloDifficultyCalibrator();
    c.recordAnswer('skill_a', 'item_x', true);
    expect(c.getLearnerRating('skill_a')).toBeGreaterThan(1200);
    expect(c.getLearnerRating('skill_b')).toBe(1200);
  });
});

describe('EloDifficultyCalibrator — selectBestItem', () => {
  it('returns null for empty candidates', () => {
    const c = new EloDifficultyCalibrator();
    expect(c.selectBestItem('skill_a', [])).toBeNull();
  });

  it('returns the item closest to learner rating', () => {
    const c = new EloDifficultyCalibrator();
    c.recordAnswer('skill_a', 'item_easy', true);
    c.recordAnswer('skill_a', 'item_easy', true);
    c.recordAnswer('skill_a', 'item_hard', false);
    c.recordAnswer('skill_a', 'item_hard', false);
    // Now learner rating > 1200, item_easy < 1200, item_hard > 1200
    const learner = c.getLearnerRating('skill_a');
    const items = ['item_easy', 'item_hard', 'item_unseen']; // unseen = 1200
    const best = c.selectBestItem('skill_a', items)!;
    const bestDiff = Math.abs(c.getItemRating(best) - learner);
    for (const id of items) {
      const d = Math.abs(c.getItemRating(id) - learner);
      expect(bestDiff).toBeLessThanOrEqual(d);
    }
  });

  it('breaks ties deterministically by lexicographic item ID', () => {
    const c = new EloDifficultyCalibrator();
    // All items start at default rating → all equally good for an unseen skill
    expect(c.selectBestItem('skill_a', ['c', 'b', 'a'])).toBe('a');
    expect(c.selectBestItem('skill_a', ['a', 'b', 'c'])).toBe('a');
    // Same answer regardless of input order — replay-deterministic.
  });
});

describe('EloDifficultyCalibrator — observability', () => {
  it('returns defensive copies of rating maps', () => {
    const c = new EloDifficultyCalibrator();
    c.recordAnswer('skill_a', 'item_x', true);

    const learnerSnap = c.getAllLearnerRatings();
    learnerSnap.set('hacked', 9999);
    expect(c.getLearnerRating('hacked')).toBe(DEFAULT_ELO_CONFIG.defaultRating);

    const itemSnap = c.getAllItemRatings();
    itemSnap.set('hacked', 9999);
    expect(c.getItemRating('hacked')).toBe(DEFAULT_ELO_CONFIG.defaultRating);
  });
});

describe('EloDifficultyCalibrator — serialize / deserialize round-trip', () => {
  it('round-trips state losslessly', () => {
    const c = new EloDifficultyCalibrator({ kLearner: 24 });
    c.recordAnswer('skill_a', 'item_x', true);
    c.recordAnswer('skill_a', 'item_y', false);
    c.recordAnswer('skill_b', 'item_x', true);

    const serialized = c.serialize();
    const restored = EloDifficultyCalibrator.deserialize(serialized);

    expect(restored.getLearnerRating('skill_a')).toBe(c.getLearnerRating('skill_a'));
    expect(restored.getLearnerRating('skill_b')).toBe(c.getLearnerRating('skill_b'));
    expect(restored.getItemRating('item_x')).toBe(c.getItemRating('item_x'));
    expect(restored.getItemRating('item_y')).toBe(c.getItemRating('item_y'));
  });

  it('preserves config across deserialize', () => {
    const c = new EloDifficultyCalibrator({ kLearner: 50, defaultRating: 1000 });
    const restored = EloDifficultyCalibrator.deserialize(c.serialize());
    expect(restored.getLearnerRating('unseen')).toBe(1000);
    // K-factor is private; verify behaviorally:
    const out = restored.recordAnswer('s', 'i', true);
    const refC = new EloDifficultyCalibrator({ kLearner: 50, defaultRating: 1000 });
    const refOut = refC.recordAnswer('s', 'i', true);
    expect(out.learnerRating).toBe(refOut.learnerRating);
  });
});

describe('createEloDifficultyCalibrator factory', () => {
  it('returns a usable instance', () => {
    const c = createEloDifficultyCalibrator({ kLearner: 16 });
    expect(c.getLearnerRating('s')).toBe(DEFAULT_ELO_CONFIG.defaultRating);
  });
});

describe('EloDifficultyCalibrator — replay determinism', () => {
  it('produces identical state across two runs of the same event log', () => {
    const events: { skillId: string; itemId: string; correct: boolean }[] = [
      { skillId: 'a', itemId: 'x', correct: true },
      { skillId: 'a', itemId: 'y', correct: false },
      { skillId: 'b', itemId: 'x', correct: true },
      { skillId: 'a', itemId: 'x', correct: false },
    ];

    function run() {
      const c = new EloDifficultyCalibrator();
      for (const e of events) c.recordAnswer(e.skillId, e.itemId, e.correct);
      return c.serialize();
    }

    expect(run()).toBe(run());
  });
});
