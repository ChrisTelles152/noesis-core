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
export declare const DEFAULT_BUDGET_BY_LENGTH: (length: number) => number;
/**
 * Levenshtein-distance answer matcher with length-bucketed typo tolerance.
 *
 * This is the universal default. Pack-specific normalizers typically wrap it,
 * doing pack-specific preprocessing (e.g., expand contractions) and then
 * delegating to LevenshteinMatcher for the actual comparison.
 */
export declare class LevenshteinMatcher implements AnswerNormalizer {
    private readonly budgetByLength;
    private readonly stripDiacriticsEnabled;
    private readonly lowercaseEnabled;
    constructor(config?: LevenshteinMatcherConfig);
    normalize(input: string): string;
    matches(input: string, expected: string | string[]): boolean;
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
export declare function levenshtein(a: string, b: string): number;
/**
 * Factory for the default matcher with no custom configuration.
 */
export declare function createLevenshteinMatcher(config?: LevenshteinMatcherConfig): LevenshteinMatcher;
//# sourceMappingURL=AnswerNormalizer.d.ts.map