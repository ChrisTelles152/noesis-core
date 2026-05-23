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
 * Default edit-distance budget: stricter for short answers, looser for long.
 */
export const DEFAULT_BUDGET_BY_LENGTH = (length) => {
    if (length <= 5)
        return 0;
    if (length <= 25)
        return 1;
    return 2;
};
/**
 * Levenshtein-distance answer matcher with length-bucketed typo tolerance.
 *
 * This is the universal default. Pack-specific normalizers typically wrap it,
 * doing pack-specific preprocessing (e.g., expand contractions) and then
 * delegating to LevenshteinMatcher for the actual comparison.
 */
export class LevenshteinMatcher {
    budgetByLength;
    stripDiacriticsEnabled;
    lowercaseEnabled;
    constructor(config = {}) {
        this.budgetByLength = config.budgetByLength ?? DEFAULT_BUDGET_BY_LENGTH;
        this.stripDiacriticsEnabled = config.stripDiacritics ?? true;
        this.lowercaseEnabled = config.lowercase ?? true;
    }
    normalize(input) {
        let s = input;
        if (this.lowercaseEnabled)
            s = s.toLowerCase();
        if (this.stripDiacriticsEnabled) {
            // NFD splits combined characters (e.g., "é" → "e" + combining accent)
            // then we strip the combining marks (Unicode category Mn).
            s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
        }
        // Collapse internal whitespace and trim.
        return s.replace(/\s+/g, ' ').trim();
    }
    matches(input, expected) {
        const normalizedInput = this.normalize(input);
        const candidates = Array.isArray(expected) ? expected : [expected];
        for (const candidate of candidates) {
            const normalizedExpected = this.normalize(candidate);
            const budget = this.budgetByLength(Math.max(normalizedInput.length, normalizedExpected.length));
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
export function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    // Ensure a is the shorter string to minimize memory.
    if (a.length > b.length) {
        const tmp = a;
        a = b;
        b = tmp;
    }
    const m = a.length;
    const n = b.length;
    // Two-row DP.
    let prev = new Array(m + 1);
    let curr = new Array(m + 1);
    for (let i = 0; i <= m; i++)
        prev[i] = i;
    for (let j = 1; j <= n; j++) {
        curr[0] = j;
        for (let i = 1; i <= m; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[i] = Math.min(prev[i] + 1, // deletion
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
export function createLevenshteinMatcher(config) {
    return new LevenshteinMatcher(config);
}
//# sourceMappingURL=AnswerNormalizer.js.map