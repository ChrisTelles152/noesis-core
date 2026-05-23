/**
 * Answer Matching Module
 *
 * Universal AnswerNormalizer interface + Levenshtein-based default
 * implementation. Subject packs supply their own normalizers for
 * language- or domain-specific preprocessing.
 */
export { LevenshteinMatcher, createLevenshteinMatcher, levenshtein, DEFAULT_BUDGET_BY_LENGTH, } from './AnswerNormalizer.js';
//# sourceMappingURL=index.js.map