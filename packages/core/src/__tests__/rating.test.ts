import { describe, it, expect } from 'vitest';
import { computeRating, DEFAULT_RATING_CONFIG } from '../engine/NoesisCoreEngineImpl.js';
import type { PracticeEvent } from '../constitution.js';

function makePracticeEvent(overrides: Partial<PracticeEvent> = {}): PracticeEvent {
  return {
    id: 'evt-1',
    type: 'practice',
    learnerId: 'learner-1',
    sessionId: 'session-1',
    timestamp: Date.now(),
    skillId: 'skill-1',
    itemId: 'item-1',
    correct: true,
    responseTimeMs: 5000,
    ...overrides,
  };
}

describe('computeRating', () => {
  describe('incorrect answers', () => {
    it('should return 1 (Again) for incorrect answer regardless of confidence', () => {
      expect(computeRating(makePracticeEvent({ correct: false }))).toBe(1);
      expect(computeRating(makePracticeEvent({ correct: false, confidence: 0.9 }))).toBe(1);
      expect(computeRating(makePracticeEvent({ correct: false, responseTimeMs: 100 }))).toBe(1);
    });
  });

  describe('correct answers with confidence', () => {
    it('should return 2 (Hard) for low confidence', () => {
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.2 }))).toBe(2);
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.39 }))).toBe(2);
    });

    it('should return 3 (Good) for medium confidence', () => {
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.5 }))).toBe(3);
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.7 }))).toBe(3);
    });

    it('should return 4 (Easy) for high confidence + fast response', () => {
      expect(computeRating(makePracticeEvent({
        correct: true,
        confidence: 0.9,
        responseTimeMs: 3000, // < 10000 * 0.5 = 5000
      }))).toBe(4);
    });

    it('should return 3 (Good) for high confidence but slow response', () => {
      // High confidence but slow — not "easy", just "good"
      expect(computeRating(makePracticeEvent({
        correct: true,
        confidence: 0.9,
        responseTimeMs: 8000, // > 5000 threshold but < 20000 "hard" threshold
      }))).toBe(3);
    });
  });

  describe('correct answers with response time only (no confidence)', () => {
    it('should return 2 (Hard) for very slow response', () => {
      expect(computeRating(makePracticeEvent({
        correct: true,
        confidence: undefined,
        responseTimeMs: 25000, // > 10000 * 2.0 = 20000
      }))).toBe(2);
    });

    it('should return 3 (Good) for normal response time', () => {
      expect(computeRating(makePracticeEvent({
        correct: true,
        confidence: undefined,
        responseTimeMs: 8000,
      }))).toBe(3);
    });
  });

  describe('fallback behavior (no confidence, no responseTime)', () => {
    it('should return 3 (Good) for correct with no metadata', () => {
      expect(computeRating(makePracticeEvent({
        correct: true,
        confidence: undefined,
        responseTimeMs: undefined,
      }))).toBe(3);
    });

    it('should return 1 (Again) for incorrect with no metadata', () => {
      expect(computeRating(makePracticeEvent({
        correct: false,
        confidence: undefined,
        responseTimeMs: undefined,
      }))).toBe(1);
    });
  });

  describe('custom config', () => {
    it('should respect custom thresholds', () => {
      const strictConfig = {
        ...DEFAULT_RATING_CONFIG,
        hardConfidenceThreshold: 0.6,
        easyConfidenceThreshold: 0.95,
      };

      // Confidence 0.5 is "hard" with strict config but "good" with default
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.5 }), strictConfig)).toBe(2);
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.5 }))).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle confidence at exact thresholds', () => {
      // At hardConfidenceThreshold (0.4) — should be hard (strict less-than)
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.4 }))).toBe(3);
      // Just below
      expect(computeRating(makePracticeEvent({ correct: true, confidence: 0.399 }))).toBe(2);
    });

    it('should handle responseTimeMs of 0 as no data', () => {
      // responseTimeMs=0 should be treated as absent (guard: > 0)
      expect(computeRating(makePracticeEvent({
        correct: true,
        confidence: undefined,
        responseTimeMs: 0,
      }))).toBe(3);
    });
  });
});
