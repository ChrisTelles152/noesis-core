import { describe, it, expect } from 'vitest';
import {
  LevenshteinMatcher,
  createLevenshteinMatcher,
  levenshtein,
  DEFAULT_BUDGET_BY_LENGTH,
  type AnswerNormalizer,
} from '../answer/index.js';

describe('levenshtein()', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('cat', 'cat')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns string length when one side is empty', () => {
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'abcd')).toBe(4);
  });

  it('counts a single substitution as 1', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('counts a single insertion as 1', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('counts a single deletion as 1', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('handles classic kitten / sitting (distance 3)', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('is symmetric', () => {
    expect(levenshtein('hello', 'world')).toBe(levenshtein('world', 'hello'));
    expect(levenshtein('abc', 'xyz')).toBe(levenshtein('xyz', 'abc'));
  });

  it('handles the two-string-length swap path (a longer than b)', () => {
    // Internal optimization swaps so a is the shorter string.
    expect(levenshtein('aaaaaa', 'bb')).toBe(6);
    expect(levenshtein('bb', 'aaaaaa')).toBe(6);
  });
});

describe('DEFAULT_BUDGET_BY_LENGTH', () => {
  it('allows 0 errors for short answers (≤5)', () => {
    expect(DEFAULT_BUDGET_BY_LENGTH(0)).toBe(0);
    expect(DEFAULT_BUDGET_BY_LENGTH(5)).toBe(0);
  });

  it('allows 1 error for medium answers (6–25)', () => {
    expect(DEFAULT_BUDGET_BY_LENGTH(6)).toBe(1);
    expect(DEFAULT_BUDGET_BY_LENGTH(15)).toBe(1);
    expect(DEFAULT_BUDGET_BY_LENGTH(25)).toBe(1);
  });

  it('allows 2 errors for long answers (>25)', () => {
    expect(DEFAULT_BUDGET_BY_LENGTH(26)).toBe(2);
    expect(DEFAULT_BUDGET_BY_LENGTH(100)).toBe(2);
  });
});

describe('LevenshteinMatcher.normalize()', () => {
  const matcher = new LevenshteinMatcher();

  it('lowercases by default', () => {
    expect(matcher.normalize('Hello')).toBe('hello');
    expect(matcher.normalize('CAT')).toBe('cat');
  });

  it('strips diacritics by default', () => {
    expect(matcher.normalize('café')).toBe('cafe');
    expect(matcher.normalize('crème brûlée')).toBe('creme brulee');
    expect(matcher.normalize('mañana')).toBe('manana');
  });

  it('collapses internal whitespace and trims', () => {
    expect(matcher.normalize('  hello   world  ')).toBe('hello world');
    expect(matcher.normalize('a\tb\nc')).toBe('a b c');
  });

  it('preserves diacritics when configured to', () => {
    const m = new LevenshteinMatcher({ stripDiacritics: false });
    expect(m.normalize('café')).toBe('café');
  });

  it('preserves case when configured to', () => {
    const m = new LevenshteinMatcher({ lowercase: false });
    expect(m.normalize('Hello')).toBe('Hello');
  });
});

describe('LevenshteinMatcher.matches() — single expected', () => {
  const matcher = new LevenshteinMatcher();

  it('matches identical inputs', () => {
    expect(matcher.matches('cat', 'cat')).toBe(true);
  });

  it('does not tolerate any typo for length ≤5 (budget=0)', () => {
    expect(matcher.matches('cat', 'bat')).toBe(false);
    expect(matcher.matches('hello', 'helo')).toBe(false);
  });

  it('tolerates 1 typo for length 6–25 (budget=1)', () => {
    expect(matcher.matches('beautifu', 'beautiful')).toBe(true); // missing l
    expect(matcher.matches('beauttiful', 'beautiful')).toBe(true); // extra t
    expect(matcher.matches('beauttifu', 'beautiful')).toBe(false); // 2 errors
  });

  it('tolerates 2 typos for length >25 (budget=2)', () => {
    const expected = 'the quick brown fox jumps over the lazy dog';
    const oneTypo = 'the quik brown fox jumps over the lazy dog';
    const twoTypos = 'the quik brown fox jmps over the lazy dog';
    const threeTypos = 'the quik brown fox jmps over teh lazy dog';
    expect(matcher.matches(oneTypo, expected)).toBe(true);
    expect(matcher.matches(twoTypos, expected)).toBe(true);
    expect(matcher.matches(threeTypos, expected)).toBe(false);
  });

  it('matches across diacritic differences', () => {
    expect(matcher.matches('cafe', 'café')).toBe(true);
    expect(matcher.matches('CAFÉ', 'cafe')).toBe(true);
  });

  it('matches across whitespace differences', () => {
    expect(matcher.matches('  hello  world  ', 'hello world')).toBe(true);
  });
});

describe('LevenshteinMatcher.matches() — multiple expected (variants)', () => {
  const matcher = new LevenshteinMatcher();

  it('matches if input matches ANY of the expected variants', () => {
    expect(matcher.matches('color', ['color', 'colour'])).toBe(true);
    expect(matcher.matches('colour', ['color', 'colour'])).toBe(true);
  });

  it('returns false if input matches none of the variants', () => {
    expect(matcher.matches('purple', ['red', 'blue', 'green'])).toBe(false);
  });

  it('honors per-variant length budget independently', () => {
    // 'beauttiful' (10 chars) vs 'beautiful' (9 chars) — budget=1, distance=1 → match.
    // 'beauttiful' vs 'cat' (3 chars) — budget=0, distance huge → no match.
    expect(matcher.matches('beauttiful', ['cat', 'beautiful'])).toBe(true);
  });
});

describe('LevenshteinMatcher with custom budget', () => {
  it('honors a stricter budget function', () => {
    const strict = new LevenshteinMatcher({ budgetByLength: () => 0 });
    expect(strict.matches('beautifu', 'beautiful')).toBe(false);
  });

  it('honors a looser budget function', () => {
    const loose = new LevenshteinMatcher({ budgetByLength: () => 5 });
    expect(loose.matches('cat', 'cats')).toBe(true);
  });
});

describe('AnswerNormalizer interface compatibility', () => {
  it('LevenshteinMatcher is assignable to AnswerNormalizer', () => {
    const normalizer: AnswerNormalizer = new LevenshteinMatcher();
    expect(typeof normalizer.normalize).toBe('function');
    expect(typeof normalizer.matches).toBe('function');
  });

  it('createLevenshteinMatcher() returns an AnswerNormalizer', () => {
    const normalizer: AnswerNormalizer = createLevenshteinMatcher();
    expect(normalizer.matches('hi', 'hi')).toBe(true);
  });
});
