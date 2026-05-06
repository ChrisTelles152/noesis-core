import { describe, it, expect } from 'vitest';
import {
  ItemHistoryAggregator,
  createItemHistoryAggregator,
  DEFAULT_ITEM_HISTORY_CONFIG,
  type ItemAttempt,
} from '../history/index.js';

function attempt(itemId: string, correct: boolean, t = 0): ItemAttempt {
  return { itemId, correct, timestamp: t };
}

describe('ItemHistoryAggregator — empty state', () => {
  it('starts with no seen items', () => {
    const a = new ItemHistoryAggregator();
    expect(a.getSeenItemIds().size).toBe(0);
    expect(a.getIntroducedItemCount()).toBe(0);
    expect(a.getWeakItems()).toEqual([]);
    expect(a.getMasteryMap().size).toBe(0);
  });

  it('returns undefined mastery info for never-seen items', () => {
    const a = new ItemHistoryAggregator();
    expect(a.getMasteryInfo('never_seen')).toBeUndefined();
  });
});

describe('ItemHistoryAggregator — recordAttempt', () => {
  it('counts attempts and correctCount per item', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('x', false));
    a.recordAttempt(attempt('x', true));
    const info = a.getMasteryInfo('x')!;
    expect(info.attempts).toBe(3);
    expect(info.correctCount).toBe(2);
    expect(info.accuracy).toBeCloseTo(2 / 3, 10);
  });

  it('keeps separate counters per itemId', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('y', false));
    expect(a.getMasteryInfo('x')!.attempts).toBe(1);
    expect(a.getMasteryInfo('y')!.attempts).toBe(1);
    expect(a.getMasteryInfo('x')!.correctCount).toBe(1);
    expect(a.getMasteryInfo('y')!.correctCount).toBe(0);
  });
});

describe('ItemHistoryAggregator — getSeenItemIds / getIntroducedItemCount', () => {
  it('reports the unique set of attempted items', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('y', false));
    a.recordAttempt(attempt('x', true));
    expect(a.getSeenItemIds()).toEqual(new Set(['x', 'y']));
    expect(a.getIntroducedItemCount()).toBe(2);
  });

  it('returns a defensive copy (mutation does not affect state)', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('x', true));
    const snapshot = a.getSeenItemIds();
    snapshot.add('hacked');
    expect(a.getSeenItemIds().has('hacked')).toBe(false);
  });
});

describe('ItemHistoryAggregator — getWeakItems (default config: <80% accuracy, ≥2 attempts)', () => {
  it('excludes items with too few attempts', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('x', false)); // 0/1 — only 1 attempt, excluded
    expect(a.getWeakItems()).toEqual([]);
  });

  it('excludes items above the accuracy threshold', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('x', true)); // 5/5 = 100% — excluded
    expect(a.getWeakItems()).toEqual([]);
  });

  it('includes items below threshold with enough attempts', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('weak', false));
    a.recordAttempt(attempt('weak', false)); // 0/2 = 0%
    a.recordAttempt(attempt('strong', true));
    a.recordAttempt(attempt('strong', true)); // 2/2 = 100%
    expect(a.getWeakItems()).toEqual(['weak']);
  });

  it('sorts weakest first (lowest accuracy)', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('mediocre', true));
    a.recordAttempt(attempt('mediocre', false));
    a.recordAttempt(attempt('mediocre', false)); // 1/3 ≈ 33%

    a.recordAttempt(attempt('terrible', false));
    a.recordAttempt(attempt('terrible', false)); // 0/2 = 0%

    expect(a.getWeakItems()).toEqual(['terrible', 'mediocre']);
  });

  it('breaks accuracy ties by attempts desc, then by itemId asc', () => {
    const a = new ItemHistoryAggregator();
    // Both 1/2 = 50% accuracy
    a.recordAttempt(attempt('a_item', true));
    a.recordAttempt(attempt('a_item', false));
    a.recordAttempt(attempt('b_item', true));
    a.recordAttempt(attempt('b_item', false));
    // a_item and b_item are tied — should sort lexicographically
    expect(a.getWeakItems()).toEqual(['a_item', 'b_item']);

    // Now give 'a_item' more attempts at same accuracy:
    a.recordAttempt(attempt('a_item', true));
    a.recordAttempt(attempt('a_item', false));
    // a_item: 2/4 = 50%, attempts=4. b_item: 1/2 = 50%, attempts=2.
    // a_item has more samples → ranks first.
    expect(a.getWeakItems()).toEqual(['a_item', 'b_item']);
  });

  it('respects the limit parameter', () => {
    const a = new ItemHistoryAggregator();
    for (const id of ['x', 'y', 'z']) {
      a.recordAttempt(attempt(id, false));
      a.recordAttempt(attempt(id, false));
    }
    expect(a.getWeakItems(2)).toHaveLength(2);
    expect(a.getWeakItems(0)).toHaveLength(0);
  });
});

describe('ItemHistoryAggregator — mastery flag', () => {
  it('marks items as mastered with ≥80% accuracy and ≥2 attempts', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('m', true));
    a.recordAttempt(attempt('m', true));
    expect(a.getMasteryInfo('m')!.mastered).toBe(true);
  });

  it('does not mark single-attempt items as mastered (insufficient samples)', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('m', true));
    expect(a.getMasteryInfo('m')!.mastered).toBe(false);
  });

  it('does not mark items below the accuracy threshold', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('m', true));
    a.recordAttempt(attempt('m', false)); // 1/2 = 50%
    expect(a.getMasteryInfo('m')!.mastered).toBe(false);
  });
});

describe('ItemHistoryAggregator — config overrides', () => {
  it('honors a stricter accuracy threshold', () => {
    const a = new ItemHistoryAggregator({ weakItemAccuracyThreshold: 1.0 });
    // Anything <100% is now weak (with ≥2 attempts).
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('x', false));
    expect(a.getWeakItems()).toEqual(['x']);
  });

  it('honors a higher minAttempts requirement', () => {
    const a = new ItemHistoryAggregator({ minAttemptsForWeak: 5 });
    for (let i = 0; i < 3; i++) a.recordAttempt(attempt('x', false));
    expect(a.getWeakItems()).toEqual([]); // only 3 attempts, threshold is 5
    a.recordAttempt(attempt('x', false));
    a.recordAttempt(attempt('x', false));
    expect(a.getWeakItems()).toEqual(['x']);
  });
});

describe('ItemHistoryAggregator — reset', () => {
  it('clears all counters', () => {
    const a = new ItemHistoryAggregator();
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('y', false));
    a.reset();
    expect(a.getIntroducedItemCount()).toBe(0);
    expect(a.getMasteryInfo('x')).toBeUndefined();
  });
});

describe('ItemHistoryAggregator — serialize / deserialize round-trip', () => {
  it('round-trips state and config losslessly', () => {
    const a = new ItemHistoryAggregator({ weakItemAccuracyThreshold: 0.7 });
    a.recordAttempt(attempt('x', true));
    a.recordAttempt(attempt('x', false));
    a.recordAttempt(attempt('y', true));

    const restored = ItemHistoryAggregator.deserialize(a.serialize());
    expect(restored.getMasteryInfo('x')).toEqual(a.getMasteryInfo('x'));
    expect(restored.getMasteryInfo('y')).toEqual(a.getMasteryInfo('y'));
    expect(restored.getWeakItems()).toEqual(a.getWeakItems());

    // Config preserved (verify by adding an item that's only weak under custom threshold):
    restored.recordAttempt(attempt('z', true));
    restored.recordAttempt(attempt('z', false));
    restored.recordAttempt(attempt('z', false)); // 1/3 ≈ 33% — weak under 0.7 too
    expect(restored.getWeakItems()).toContain('z');
  });
});

describe('createItemHistoryAggregator factory', () => {
  it('returns a usable instance with defaults', () => {
    const a = createItemHistoryAggregator();
    expect(a.getIntroducedItemCount()).toBe(0);
  });

  it('honors config in factory', () => {
    const a = createItemHistoryAggregator({ minAttemptsForWeak: 10 });
    for (let i = 0; i < 9; i++) a.recordAttempt(attempt('x', false));
    expect(a.getWeakItems()).toEqual([]);
  });
});

describe('ItemHistoryAggregator — replay determinism', () => {
  it('produces identical state across two runs of the same event log', () => {
    const events: ItemAttempt[] = [
      attempt('a', true, 1),
      attempt('b', false, 2),
      attempt('a', false, 3),
      attempt('b', true, 4),
      attempt('c', false, 5),
      attempt('c', false, 6),
    ];

    function run() {
      const a = new ItemHistoryAggregator();
      for (const e of events) a.recordAttempt(e);
      return a.serialize();
    }

    expect(run()).toBe(run());
  });
});

describe('DEFAULT_ITEM_HISTORY_CONFIG sanity', () => {
  it('matches noesis-eng converged values', () => {
    expect(DEFAULT_ITEM_HISTORY_CONFIG.weakItemAccuracyThreshold).toBe(0.8);
    expect(DEFAULT_ITEM_HISTORY_CONFIG.minAttemptsForWeak).toBe(2);
    expect(DEFAULT_ITEM_HISTORY_CONFIG.masteryAccuracyThreshold).toBe(0.8);
    expect(DEFAULT_ITEM_HISTORY_CONFIG.minAttemptsForMastery).toBe(2);
  });
});
