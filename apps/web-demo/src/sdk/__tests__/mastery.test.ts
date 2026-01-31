import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MasteryTracker } from '../mastery';

describe('MasteryTracker', () => {
  let tracker: MasteryTracker;

  beforeEach(() => {
    tracker = new MasteryTracker({}, false);
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const data = tracker.getMasteryData();
      expect(data).toEqual([]);
    });

    it('should initialize with custom threshold', () => {
      const customTracker = new MasteryTracker({ threshold: 0.9 }, false);
      expect(customTracker).toBeDefined();
    });

    it('should initialize with provided objectives', () => {
      const objectives = [
        { id: 'obj1', name: 'Objective 1' },
        { id: 'obj2', name: 'Objective 2' },
      ];
      const customTracker = new MasteryTracker({ initialObjectives: objectives }, false);
      const data = customTracker.getMasteryData();
      expect(data).toHaveLength(2);
      expect(data[0].id).toBe('obj1');
      expect(data[0].progress).toBe(0);
      expect(data[0].status).toBe('not-started');
    });
  });

  describe('initialize', () => {
    it('should set up objectives correctly', () => {
      tracker.initialize({
        objectives: [
          { id: 'math', name: 'Mathematics' },
          { id: 'science', name: 'Science' },
        ],
      });

      const data = tracker.getMasteryData();
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('Mathematics');
      expect(data[1].name).toBe('Science');
    });

    it('should reset progress for all objectives', () => {
      tracker.initialize({
        objectives: [{ id: 'test', name: 'Test Objective' }],
      });

      const data = tracker.getMasteryData();
      expect(data[0].progress).toBe(0);
      expect(data[0].attempts).toBe(0);
      expect(data[0].lastReviewed).toBeNull();
      expect(data[0].nextReviewDue).toBeNull();
      expect(data[0].isReviewDue).toBe(false);
    });

    it('should override threshold if provided', () => {
      tracker.initialize({
        objectives: [{ id: 'test', name: 'Test' }],
        threshold: 0.95,
      });

      // Record high result
      tracker.recordEvent({ objectiveId: 'test', result: 0.96 });
      const data = tracker.getMasteryData();
      // With threshold 0.95, progress of ~0.67 shouldn't be mastered
      expect(data[0].status).not.toBe('mastered');
    });
  });

  describe('recordEvent', () => {
    beforeEach(() => {
      tracker.initialize({
        objectives: [{ id: 'obj1', name: 'Test Objective' }],
      });
    });

    it('should update progress on first attempt', () => {
      tracker.recordEvent({ objectiveId: 'obj1', result: 1.0 });

      const data = tracker.getMasteryData();
      expect(data[0].progress).toBe(0.7); // First attempt: result * 0.7
      expect(data[0].attempts).toBe(1);
      expect(data[0].status).toBe('in-progress');
    });

    it('should apply weighted average on subsequent attempts', () => {
      tracker.recordEvent({ objectiveId: 'obj1', result: 1.0 });
      tracker.recordEvent({ objectiveId: 'obj1', result: 1.0 });

      const data = tracker.getMasteryData();
      // Second attempt: (0.7 * 0.7) + (1.0 * 0.3 * 1.0) = 0.79
      expect(data[0].progress).toBeCloseTo(0.79, 2);
      expect(data[0].attempts).toBe(2);
    });

    it('should respect confidence parameter', () => {
      tracker.recordEvent({ objectiveId: 'obj1', result: 1.0 });
      tracker.recordEvent({ objectiveId: 'obj1', result: 1.0, confidence: 0.5 });

      const data = tracker.getMasteryData();
      // Second attempt with 0.5 confidence: (0.7 * 0.7) + (1.0 * 0.3 * 0.5) = 0.64
      expect(data[0].progress).toBeCloseTo(0.64, 2);
    });

    it('should mark as mastered when threshold reached', () => {
      // Need multiple high-result attempts to reach 0.8
      for (let i = 0; i < 5; i++) {
        tracker.recordEvent({ objectiveId: 'obj1', result: 1.0 });
      }

      const data = tracker.getMasteryData();
      expect(data[0].status).toBe('mastered');
    });

    it('should update lastReviewed timestamp', () => {
      const beforeTime = Date.now();
      tracker.recordEvent({ objectiveId: 'obj1', result: 0.8 });
      const afterTime = Date.now();

      const data = tracker.getMasteryData();
      expect(data[0].lastReviewed).toBeGreaterThanOrEqual(beforeTime);
      expect(data[0].lastReviewed).toBeLessThanOrEqual(afterTime);
    });

    it('should set nextReviewDue based on spaced repetition', () => {
      tracker.recordEvent({ objectiveId: 'obj1', result: 0.8 });

      const data = tracker.getMasteryData();
      expect(data[0].nextReviewDue).toBeGreaterThan(Date.now());
    });

    it('should ignore events for unknown objectives', () => {
      tracker.recordEvent({ objectiveId: 'unknown', result: 1.0 });

      const data = tracker.getMasteryData();
      expect(data).toHaveLength(1);
      expect(data[0].attempts).toBe(0);
    });

    it('should constrain progress to 0-1 range', () => {
      // Even with very high results, progress should not exceed 1
      for (let i = 0; i < 20; i++) {
        tracker.recordEvent({ objectiveId: 'obj1', result: 1.0 });
      }

      const data = tracker.getMasteryData();
      expect(data[0].progress).toBeLessThanOrEqual(1);
      expect(data[0].progress).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getReviewRecommendations', () => {
    beforeEach(() => {
      tracker.initialize({
        objectives: [
          { id: 'obj1', name: 'Objective 1' },
          { id: 'obj2', name: 'Objective 2' },
          { id: 'obj3', name: 'Objective 3' },
        ],
      });
    });

    it('should return not-started objectives first when nothing else is available', () => {
      const recommendations = tracker.getReviewRecommendations();

      expect(recommendations).toHaveLength(3);
      expect(recommendations[0].status).toBe('not-started');
    });

    it('should prioritize in-progress objectives over not-started', () => {
      tracker.recordEvent({ objectiveId: 'obj2', result: 0.5 });

      const recommendations = tracker.getReviewRecommendations();

      // Implementation returns only in-progress items when available (not mixed with not-started)
      // So all returned items should be in-progress
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.every((r) => r.status === 'in-progress')).toBe(true);
      expect(recommendations[0].id).toBe('obj2');
    });

    it('should sort in-progress by progress descending', () => {
      tracker.recordEvent({ objectiveId: 'obj1', result: 0.3 });
      tracker.recordEvent({ objectiveId: 'obj2', result: 0.7 });

      const recommendations = tracker.getReviewRecommendations();
      const inProgress = recommendations.filter((r) => r.status === 'in-progress');

      expect(inProgress[0].progress).toBeGreaterThan(inProgress[1].progress);
    });
  });

  describe('getObjectiveProgress', () => {
    beforeEach(() => {
      tracker.initialize({
        objectives: [{ id: 'obj1', name: 'Test' }],
      });
    });

    it('should return progress for existing objective', () => {
      tracker.recordEvent({ objectiveId: 'obj1', result: 1.0 });
      const progress = tracker.getObjectiveProgress('obj1');

      expect(progress).toBe(0.7);
    });

    it('should return null for non-existent objective', () => {
      const progress = tracker.getObjectiveProgress('unknown');

      expect(progress).toBeNull();
    });
  });

  describe('onMasteryUpdate', () => {
    it('should call callback when mastery data changes', () => {
      const callback = vi.fn();
      tracker.initialize({
        objectives: [{ id: 'obj1', name: 'Test' }],
      });
      tracker.onMasteryUpdate(callback);

      tracker.recordEvent({ objectiveId: 'obj1', result: 0.8 });

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'obj1' })])
      );
    });

    it('should support multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      tracker.initialize({
        objectives: [{ id: 'obj1', name: 'Test' }],
      });
      tracker.onMasteryUpdate(callback1);
      tracker.onMasteryUpdate(callback2);

      tracker.recordEvent({ objectiveId: 'obj1', result: 0.8 });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();

      tracker.initialize({
        objectives: [{ id: 'obj1', name: 'Test' }],
      });
      tracker.onMasteryUpdate(errorCallback);
      tracker.onMasteryUpdate(normalCallback);

      // Should not throw and should still call the normal callback
      expect(() => {
        tracker.recordEvent({ objectiveId: 'obj1', result: 0.8 });
      }).not.toThrow();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('getMasteryData', () => {
    it('should return a copy of the objectives array', () => {
      tracker.initialize({
        objectives: [{ id: 'obj1', name: 'Test' }],
      });

      const data1 = tracker.getMasteryData();
      const data2 = tracker.getMasteryData();

      expect(data1).not.toBe(data2);
      expect(data1).toEqual(data2);
    });
  });
});
