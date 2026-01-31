/**
 * MasteryTracker Tests
 *
 * Tests for the MasteryTracker class that handles learning objective tracking
 * and spaced repetition recommendations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MasteryTracker } from '../policies/mastery';

describe('MasteryTracker', () => {
  let tracker: MasteryTracker;

  beforeEach(() => {
    tracker = new MasteryTracker();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const t = new MasteryTracker();
      expect(t.getMasteryData()).toEqual([]);
    });

    it('should accept custom options', () => {
      const t = new MasteryTracker({
        threshold: 0.9,
        spacingFactor: 3.0,
      });
      expect(t.getMasteryData()).toEqual([]);
    });

    it('should initialize with initial objectives', () => {
      const t = new MasteryTracker({
        initialObjectives: [
          { id: 'obj-1', name: 'Objective 1' },
          { id: 'obj-2', name: 'Objective 2' },
        ],
      });
      const data = t.getMasteryData();
      expect(data).toHaveLength(2);
      expect(data[0].id).toBe('obj-1');
      expect(data[1].id).toBe('obj-2');
    });
  });

  describe('initialize', () => {
    it('should initialize objectives correctly', () => {
      tracker.initialize({
        objectives: [
          { id: 'math-1', name: 'Addition' },
          { id: 'math-2', name: 'Subtraction' },
        ],
      });

      const data = tracker.getMasteryData();
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({
        id: 'math-1',
        name: 'Addition',
        progress: 0,
        attempts: 0,
        lastReviewed: null,
        nextReviewDue: null,
        isReviewDue: false,
        status: 'not-started',
      });
    });

    it('should accept custom threshold and spacing factor', () => {
      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
        threshold: 0.9,
        spacingFactor: 3.0,
      });

      // Record a high result
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });

      // Check if threshold affects status (0.7 * 1.0 = 0.7, below 0.9 threshold)
      const data = tracker.getMasteryData();
      expect(data[0].status).toBe('in-progress'); // Not mastered with 0.9 threshold
    });

    it('should register callback', () => {
      const callback = vi.fn();
      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
        onMasteryUpdate: callback,
      });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('recordEvent', () => {
    beforeEach(() => {
      tracker.initialize({
        objectives: [
          { id: 'obj-1', name: 'Objective 1' },
          { id: 'obj-2', name: 'Objective 2' },
        ],
      });
    });

    it('should update progress on first attempt', () => {
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });

      const data = tracker.getMasteryData();
      const obj = data.find(o => o.id === 'obj-1')!;

      expect(obj.progress).toBe(0.7); // First attempt: 1.0 * 0.7
      expect(obj.attempts).toBe(1);
      expect(obj.status).toBe('in-progress');
      expect(obj.lastReviewed).not.toBeNull();
      expect(obj.nextReviewDue).not.toBeNull();
    });

    it('should use weighted average for subsequent attempts', () => {
      // First attempt
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      const firstProgress = tracker.getObjectiveProgress('obj-1');

      // Second attempt
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      const secondProgress = tracker.getObjectiveProgress('obj-1');

      // Progress should increase but weighted
      expect(secondProgress!).toBeGreaterThan(firstProgress!);
      expect(secondProgress!).toBeLessThanOrEqual(1.0);
    });

    it('should handle failed attempts', () => {
      // First successful attempt
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      const initialProgress = tracker.getObjectiveProgress('obj-1');

      // Failed attempt
      tracker.recordEvent({ objectiveId: 'obj-1', result: 0 });
      const afterFail = tracker.getObjectiveProgress('obj-1');

      expect(afterFail!).toBeLessThan(initialProgress!);
    });

    it('should consider confidence in weight', () => {
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      const _highConfProgress = tracker.getObjectiveProgress('obj-1');

      // Reset and try with low confidence
      tracker.initialize({
        objectives: [{ id: 'obj-2', name: 'Objective 2' }],
      });
      tracker.recordEvent({ objectiveId: 'obj-2', result: 1.0 });

      // First attempt doesn't consider confidence for initial setting
      // But subsequent attempts would
    });

    it('should constrain progress to 0-1 range', () => {
      // Try to exceed 1.0
      for (let i = 0; i < 20; i++) {
        tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      }

      const progress = tracker.getObjectiveProgress('obj-1');
      expect(progress).toBeLessThanOrEqual(1.0);

      // Try to go below 0
      for (let i = 0; i < 20; i++) {
        tracker.recordEvent({ objectiveId: 'obj-1', result: 0 });
      }

      const lowProgress = tracker.getObjectiveProgress('obj-1');
      expect(lowProgress).toBeGreaterThanOrEqual(0);
    });

    it('should update status based on threshold', () => {
      // Default threshold is 0.8
      // Progress after one successful attempt: 0.7 (below threshold)
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      expect(tracker.getMasteryData().find(o => o.id === 'obj-1')!.status).toBe('in-progress');

      // Multiple successful attempts should eventually reach mastery
      for (let i = 0; i < 10; i++) {
        tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      }

      const obj = tracker.getMasteryData().find(o => o.id === 'obj-1')!;
      expect(obj.status).toBe('mastered');
    });

    it('should ignore unknown objective ids', () => {
      // Should not throw
      tracker.recordEvent({ objectiveId: 'unknown', result: 1.0 });

      // Data should remain unchanged
      const data = tracker.getMasteryData();
      expect(data.every(o => o.attempts === 0)).toBe(true);
    });

    it('should set next review time', () => {
      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });

      const obj = tracker.getMasteryData().find(o => o.id === 'obj-1')!;
      expect(obj.nextReviewDue).not.toBeNull();
      expect(obj.nextReviewDue!).toBeGreaterThan(Date.now());
    });
  });

  describe('getReviewRecommendations', () => {
    beforeEach(() => {
      tracker.initialize({
        objectives: [
          { id: 'obj-1', name: 'Objective 1' },
          { id: 'obj-2', name: 'Objective 2' },
          { id: 'obj-3', name: 'Objective 3' },
        ],
      });
    });

    it('should prioritize due reviews', () => {
      // Record events and manipulate nextReviewDue
      tracker.recordEvent({ objectiveId: 'obj-1', result: 0.5 });
      tracker.recordEvent({ objectiveId: 'obj-2', result: 0.5 });

      // Make obj-1 overdue by setting its nextReviewDue in the past
      const data = tracker.getMasteryData();
      const obj1 = data.find(o => o.id === 'obj-1')!;
      obj1.nextReviewDue = Date.now() - 1000; // In the past

      const recommendations = tracker.getReviewRecommendations();

      // obj-1 should be marked as due and come first
      expect(recommendations[0].id).toBe('obj-1');
      expect(recommendations[0].isReviewDue).toBe(true);
    });

    it('should recommend in-progress items when nothing is due', () => {
      // Create some progress
      tracker.recordEvent({ objectiveId: 'obj-1', result: 0.3 });
      tracker.recordEvent({ objectiveId: 'obj-2', result: 0.6 });

      const recommendations = tracker.getReviewRecommendations();

      // Should get in-progress items sorted by progress (highest first)
      expect(recommendations.length).toBeGreaterThan(0);
      const inProgress = recommendations.filter(r => r.status === 'in-progress');
      if (inProgress.length >= 2) {
        expect(inProgress[0].progress).toBeGreaterThanOrEqual(inProgress[1].progress);
      }
    });

    it('should recommend not-started items when no in-progress', () => {
      const recommendations = tracker.getReviewRecommendations();

      // All objectives are not-started
      expect(recommendations.every(r => r.status === 'not-started')).toBe(true);
      expect(recommendations.length).toBe(3);
    });

    it('should fall back to mastered items', () => {
      // Master all objectives
      for (const id of ['obj-1', 'obj-2', 'obj-3']) {
        for (let i = 0; i < 15; i++) {
          tracker.recordEvent({ objectiveId: id, result: 1.0 });
        }
      }

      // All should be mastered now
      const data = tracker.getMasteryData();
      expect(data.every(o => o.status === 'mastered')).toBe(true);

      // Wait a bit and get recommendations
      const recommendations = tracker.getReviewRecommendations();
      expect(recommendations.length).toBe(3);
    });
  });

  describe('onMasteryUpdate', () => {
    it('should register callback and call it on updates', () => {
      const callback = vi.fn();
      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
      });
      tracker.onMasteryUpdate(callback);

      // Clear previous calls from initialize
      callback.mockClear();

      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: 'obj-1' }),
      ]));
    });

    it('should support multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
      });
      tracker.onMasteryUpdate(callback1);
      tracker.onMasteryUpdate(callback2);

      callback1.mockClear();
      callback2.mockClear();

      tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();

      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
      });
      tracker.onMasteryUpdate(errorCallback);
      tracker.onMasteryUpdate(normalCallback);

      // Should not throw
      expect(() => {
        tracker.recordEvent({ objectiveId: 'obj-1', result: 1.0 });
      }).not.toThrow();

      // Normal callback should still be called
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('getMasteryData', () => {
    it('should return copy of objectives array', () => {
      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
      });

      const data1 = tracker.getMasteryData();
      const data2 = tracker.getMasteryData();

      // Should be different array references
      expect(data1).not.toBe(data2);
    });
  });

  describe('getObjectiveProgress', () => {
    beforeEach(() => {
      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
      });
    });

    it('should return progress for existing objective', () => {
      tracker.recordEvent({ objectiveId: 'obj-1', result: 0.8 });

      const progress = tracker.getObjectiveProgress('obj-1');
      expect(progress).toBeGreaterThan(0);
    });

    it('should return null for non-existent objective', () => {
      const progress = tracker.getObjectiveProgress('unknown');
      expect(progress).toBeNull();
    });
  });

  describe('spaced repetition algorithm', () => {
    beforeEach(() => {
      tracker.initialize({
        objectives: [{ id: 'obj-1', name: 'Test' }],
        spacingFactor: 2.5,
      });
    });

    it('should schedule shorter intervals for lower progress', () => {
      tracker.recordEvent({ objectiveId: 'obj-1', result: 0.3 });
      const lowProgressObj = tracker.getMasteryData().find(o => o.id === 'obj-1')!;
      const lowProgressInterval = lowProgressObj.nextReviewDue! - Date.now();

      // Reset and try high progress
      tracker.initialize({
        objectives: [{ id: 'obj-2', name: 'Test 2' }],
      });

      // Build up high progress
      for (let i = 0; i < 15; i++) {
        tracker.recordEvent({ objectiveId: 'obj-2', result: 1.0 });
      }

      const highProgressObj = tracker.getMasteryData().find(o => o.id === 'obj-2')!;
      const highProgressInterval = highProgressObj.nextReviewDue! - Date.now();

      // Higher progress should have longer interval
      expect(highProgressInterval).toBeGreaterThan(lowProgressInterval);
    });
  });
});
