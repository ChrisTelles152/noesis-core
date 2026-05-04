/**
 * AnswerNormalizer
 *
 * Universal answer-matching infrastructure. Subject content packs implement
 * this interface to layer language- or domain-specific normalization on top
 * of the universal Levenshtein matcher.
 *
 * Examples (live in pack code, not core):
 *   - EnglishAnswerNormalizer expands contractions ("won't" → "will not")
 *     before matching.
 *   - FrenchAnswerNormalizer strips diacritics on tokens longer than 2 chars.
 *   - MathAnswerNormalizer parses fractions and simplifies ("4/8" → "1/2").
 *
 * DETERMINISM: all methods must be pure. Same input → same output. No I/O,
 * no clock, no random.
 */

/**
 * Normalize an answer string before comparison.
 *
 * Default behavior (LevenshteinMatcher): Unicode NFD normalize, lowercase,
 * trim, collapse internal whitespace. Pack-specific normalizers extend this.
 */
export interface AnswerNormalizer {
  /**
   * Canonicalize an answer string.
   *
   * @param input  Raw learner input.
   * @returns      Normalized form suitable for matching.
   */
  normalize(input: string): string;

  /**
   * Test whether an input answer matches one or more expected answers.
   *
   * Implementations decide their tolerance policy (typo budget, accent
   * stripping, contraction expansion, numeric parsing, etc.). The default
   * LevenshteinMatcher uses a length-bucketed edit-distance budget.
   *
   * @param input     Raw learner input.
   * @param expected  Single expected string OR a list of acceptable answers.
   * @returns         true if input is considered a match for any expected.
   */
  matches(input: string, expected: string | string[]): boolean;
}

/**
 * Configuration for the default LevenshteinMatcher.
 */
export interface LevenshteinMatcherConfig {
  /**
   * Edit-distance budget by expected-answer length.
   * Defaults: ≤5 chars → 0 edits, 6–25 → 1 edit, >25 → 2 edits.
   *
   * The budget is applied to the LONGER of (input, expected) length
   * after normalization.
   */
  budgetByLength?: (length: number) => number;

  /**
   * Whether to strip diacritics during normalization.
   * Default: true. Set false for normalizers where diacritics carry meaning
   * (e.g., a French normalizer that wants to preserve accents on short tokens).
   */
  stripDiacritics?: boolean;

  /**
   * Whether to lowercase during normalization.
   * Default: true. Set false for case-sensitive matching.
   */
  lowercase?: boolean;
}

/**
 * Default edit-distance budget: stricter for short answers, looser for long.
 */
export const DEFAULT_BUDGET_BY_LENGTH = (length: number): number => {
  if (length <= 5) return 0;
  if (length <= 25) return 1;
  return 2;
};

/**
 * Levenshtein-distance answer matcher with length-bucketed typo tolerance.
 *
 * This is the universal default. Pack-specific normalizers typically wrap it,
 * doing pack-specific preprocessing (e.g., expand contractions) and then
 * delegating to LevenshteinMatcher for the actual comparison.
 */
export class LevenshteinMatcher implements AnswerNormalizer {
  private readonly budgetByLength: (length: number) => number;
  private readonly stripDiacriticsEnabled: boolean;
  private readonly lowercaseEnabled: boolean;

  constructor(config: LevenshteinMatcherConfig = {}) {
    this.budgetByLength = config.budgetByLength ?? DEFAULT_BUDGET_BY_LENGTH;
    this.stripDiacriticsEnabled = config.stripDiacritics ?? true;
    this.lowercaseEnabled = config.lowercase ?? true;
  }

  normalize(input: string): string {
    let s = input;
    if (this.lowercaseEnabled) s = s.toLowerCase();
    if (this.stripDiacriticsEnabled) {
      // NFD splits combined characters (e.g., "é" → "e" + combining accent)
      // then we strip the combining marks (Unicode category Mn).
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    // Collapse internal whitespace and trim.
    return s.replace(/\s+/g, ' ').trim();
  }

  matches(input: string, expected: string | string[]): boolean {
    const normalizedInput = this.normalize(input);
    const candidates = Array.isArray(expected) ? expected : [expected];
    for (const candidate of candidates) {
      const normalizedExpected = this.normalize(candidate);
      const budget = this.budgetByLength(
        Math.max(normalizedInput.length, normalizedExpected.length)
      );
      if (levenshtein(normalizedInput, normalizedExpected) <= budget) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Pure Levenshtein edit-distance computation.
 *
 * Wagner–Fischer two-row dynamic programming: O(m*n) time, O(min(m,n)) space.
 *
 * Counts insertions, deletions, and substitutions as 1 each. Does not handle
 * transpositions (use Damerau–Levenshtein for that — reasonable future addition
 * but not currently needed by any vertical).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string to minimize memory.
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const m = a.length;
  const n = b.length;

  // Two-row DP.
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost // substitution
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[m];
}

/**
 * Factory for the default matcher with no custom configuration.
 */
export function createLevenshteinMatcher(config?: LevenshteinMatcherConfig): LevenshteinMatcher {
  return new LevenshteinMatcher(config);
}
