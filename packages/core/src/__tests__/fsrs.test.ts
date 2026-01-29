/**
 * FSRS Scheduler Tests
 *
 * Tests for Free Spaced Repetition Scheduler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FSRSScheduler,
  createFSRSScheduler,
  DEFAULT_FSRS_PARAMS,
} from '../memory/FSRSScheduler.js';
import type { MemoryState } from '../constitution.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('FSRSScheduler', () => {
  let scheduler: FSRSScheduler;
  let mockClock: () => number;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000000000; // Fixed timestamp for tests
    mockClock = () => currentTime;
    scheduler = createFSRSScheduler({}, mockClock);
  });

  describe('createState', () => {
    it('should create initial state with default values', () => {
      const state = scheduler.createState('skill-a');

      expect(state.skillId).toBe('skill-a');
      expect(state.stability).toBe(DEFAULT_FSRS_PARAMS.initialStability[2]); // Good rating default
      expect(state.difficulty).toBe(DEFAULT_FSRS_PARAMS.initialDifficulty);
      expect(state.lastReview).toBe(currentTime);
      expect(state.nextReview).toBe(currentTime); // Due immediately
      expect(state.successCount).toBe(0);
      expect(state.failureCount).toBe(0);
      expect(state.state).toBe('new');
    });
  });

  describe('scheduleReview', () => {
    it('should transition from new to learning on first failure', () => {
      const state = scheduler.createState('skill-a');
      const updated = scheduler.scheduleReview(state, false, 1);

      expect(updated.state).toBe('learning');
      expect(updated.failureCount).toBe(1);
      expect(updated.successCount).toBe(0);
    });

    it('should transition from new to review on good recall', () => {
      const state = scheduler.createState('skill-a');
      const updated = scheduler.scheduleReview(state, true, 3);

      expect(updated.state).toBe('review');
      expect(updated.successCount).toBe(1);
    });

    it('should stay in learning on hard recall', () => {
      const state = scheduler.createState('skill-a');
      const updated = scheduler.scheduleReview(state, true, 2);

      expect(updated.state).toBe('learning');
    });

    it('should transition to relearning on failure in review state', () => {
      let state = scheduler.createState('skill-a');
      // First pass to get to review state
      state = scheduler.scheduleReview(state, true, 3);
      expect(state.state).toBe('review');

      // Now fail
      currentTime += MS_PER_DAY;
      state = scheduler.scheduleReview(state, false, 1);

      expect(state.state).toBe('relearning');
    });

    it('should increase stability on successful recall', () => {
      let state = scheduler.createState('skill-a');
      const initialStability = state.stability;

      // Good recall
      state = scheduler.scheduleReview(state, true, 3);

      // Move forward and do another good recall
      currentTime += MS_PER_DAY * 2;
      const beforeReview = state.stability;
      state = scheduler.scheduleReview(state, true, 3);

      expect(state.stability).toBeGreaterThan(beforeReview);
    });

    it('should reset stability on failure (rating 1)', () => {
      let state = scheduler.createState('skill-a');

      // Build up some stability
      state = scheduler.scheduleReview(state, true, 4); // Easy
      currentTime += MS_PER_DAY * 5;
      state = scheduler.scheduleReview(state, true, 4); // Easy again

      const highStability = state.stability;
      expect(highStability).toBeGreaterThan(5);

      // Now fail
      currentTime += MS_PER_DAY * 10;
      state = scheduler.scheduleReview(state, false, 1);

      expect(state.stability).toBe(DEFAULT_FSRS_PARAMS.initialStability[0]);
      expect(state.stability).toBeLessThan(highStability);
    });

    it('should update difficulty based on rating', () => {
      let state = scheduler.createState('skill-a');
      const initialDifficulty = state.difficulty;

      // Hard recall increases difficulty
      state = scheduler.scheduleReview(state, true, 2);
      expect(state.difficulty).toBeGreaterThan(initialDifficulty);

      // Easy recall decreases difficulty
      currentTime += MS_PER_DAY;
      const midDifficulty = state.difficulty;
      state = scheduler.scheduleReview(state, true, 4);
      expect(state.difficulty).toBeLessThan(midDifficulty);
    });

    it('should clamp difficulty between 0.1 and 0.9', () => {
      let state = scheduler.createState('skill-a');

      // Many hard recalls to maximize difficulty
      for (let i = 0; i < 20; i++) {
        state = scheduler.scheduleReview(state, true, 2);
        currentTime += MS_PER_DAY;
      }
      expect(state.difficulty).toBeLessThanOrEqual(0.9);

      // Many easy recalls to minimize difficulty
      for (let i = 0; i < 40; i++) {
        state = scheduler.scheduleReview(state, true, 4);
        currentTime += MS_PER_DAY;
      }
      expect(state.difficulty).toBeGreaterThanOrEqual(0.1);
    });

    it('should schedule next review in the future', () => {
      const state = scheduler.createState('skill-a');
      const updated = scheduler.scheduleReview(state, true, 3);

      expect(updated.nextReview).toBeGreaterThan(currentTime);
    });

    it('should respect maxInterval', () => {
      const shortMaxScheduler = createFSRSScheduler({ maxInterval: 30 }, mockClock);
      let state = shortMaxScheduler.createState('skill-a');

      // Build up high stability that would normally result in long interval
      for (let i = 0; i < 10; i++) {
        state = shortMaxScheduler.scheduleReview(state, true, 4);
        currentTime += MS_PER_DAY * 30;
      }

      const intervalDays = (state.nextReview - currentTime) / MS_PER_DAY;
      expect(intervalDays).toBeLessThanOrEqual(30);
    });

    it('should update lastReview timestamp', () => {
      const state = scheduler.createState('skill-a');
      currentTime += MS_PER_DAY * 5;
      const updated = scheduler.scheduleReview(state, true, 3);

      expect(updated.lastReview).toBe(currentTime);
    });
  });

  describe('getDueSkills', () => {
    it('should return skills that are due', () => {
      const state1 = scheduler.createState('skill-a');
      const state2 = scheduler.createState('skill-b');

      // Both are due immediately after creation
      const due = scheduler.getDueSkills([state1, state2], currentTime);

      expect(due).toHaveLength(2);
    });

    it('should not return skills not yet due', () => {
      let state = scheduler.createState('skill-a');
      state = scheduler.scheduleReview(state, true, 3);

      // Check at current time - should not be due yet (nextReview is in future)
      const due = scheduler.getDueSkills([state], currentTime);
      expect(due).toHaveLength(0);
    });

    it('should sort by most overdue first', () => {
      const now = currentTime;

      const state1: MemoryState = {
        skillId: 'skill-a',
        stability: 1,
        difficulty: 0.5,
        lastReview: now - MS_PER_DAY * 5,
        nextReview: now - MS_PER_DAY * 2, // 2 days overdue
        successCount: 1,
        failureCount: 0,
        state: 'review',
      };

      const state2: MemoryState = {
        skillId: 'skill-b',
        stability: 1,
        difficulty: 0.5,
        lastReview: now - MS_PER_DAY * 10,
        nextReview: now - MS_PER_DAY * 5, // 5 days overdue (more overdue)
        successCount: 1,
        failureCount: 0,
        state: 'review',
      };

      const due = scheduler.getDueSkills([state1, state2], now);

      expect(due[0].skillId).toBe('skill-b'); // More overdue first
      expect(due[1].skillId).toBe('skill-a');
    });

    it('should use skillId as tie-breaker for determinism', () => {
      const now = currentTime;

      const stateZ: MemoryState = {
        skillId: 'zebra',
        stability: 1,
        difficulty: 0.5,
        lastReview: now - MS_PER_DAY,
        nextReview: now - MS_PER_DAY, // Same overdue
        successCount: 1,
        failureCount: 0,
        state: 'review',
      };

      const stateA: MemoryState = {
        skillId: 'apple',
        stability: 1,
        difficulty: 0.5,
        lastReview: now - MS_PER_DAY,
        nextReview: now - MS_PER_DAY, // Same overdue
        successCount: 1,
        failureCount: 0,
        state: 'review',
      };

      const due = scheduler.getDueSkills([stateZ, stateA], now);

      // Alphabetical order for tie-breaker
      expect(due[0].skillId).toBe('apple');
      expect(due[1].skillId).toBe('zebra');
    });
  });

  describe('getRetention', () => {
    it('should return 1.0 immediately after review', () => {
      const state = scheduler.createState('skill-a');
      const retention = scheduler.getRetention(state, currentTime);

      expect(retention).toBe(1.0);
    });

    it('should decrease over time', () => {
      const state = scheduler.createState('skill-a');

      const retention1 = scheduler.getRetention(state, currentTime + MS_PER_DAY);
      const retention2 = scheduler.getRetention(state, currentTime + MS_PER_DAY * 10);
      const retention3 = scheduler.getRetention(state, currentTime + MS_PER_DAY * 30);

      expect(retention1).toBeLessThan(1.0);
      expect(retention2).toBeLessThan(retention1);
      expect(retention3).toBeLessThan(retention2);
    });

    it('should decay slower with higher stability', () => {
      const lowStabilityState: MemoryState = {
        skillId: 'skill-a',
        stability: 1,
        difficulty: 0.5,
        lastReview: currentTime,
        nextReview: currentTime + MS_PER_DAY,
        successCount: 0,
        failureCount: 0,
        state: 'new',
      };

      const highStabilityState: MemoryState = {
        skillId: 'skill-b',
        stability: 10,
        difficulty: 0.5,
        lastReview: currentTime,
        nextReview: currentTime + MS_PER_DAY * 10,
        successCount: 0,
        failureCount: 0,
        state: 'new',
      };

      const checkTime = currentTime + MS_PER_DAY * 5;
      const lowRetention = scheduler.getRetention(lowStabilityState, checkTime);
      const highRetention = scheduler.getRetention(highStabilityState, checkTime);

      expect(highRetention).toBeGreaterThan(lowRetention);
    });
  });

  describe('serialize/deserialize', () => {
    it('should round-trip states correctly', () => {
      const states = [
        scheduler.createState('skill-a'),
        scheduler.createState('skill-b'),
      ];

      // Modify one state
      states[0] = scheduler.scheduleReview(states[0], true, 4);

      const serialized = scheduler.serializeStates(states);
      const deserialized = scheduler.deserializeStates(serialized);

      expect(deserialized).toHaveLength(2);
      expect(deserialized[0].skillId).toBe('skill-a');
      expect(deserialized[0].successCount).toBe(1);
      expect(deserialized[1].skillId).toBe('skill-b');
    });

    it('should serialize to valid JSON', () => {
      const states = [scheduler.createState('skill-a')];
      const serialized = scheduler.serializeStates(states);

      expect(() => JSON.parse(serialized)).not.toThrow();
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      const states = [
        scheduler.createState('skill-a'),
        scheduler.createState('skill-b'),
        scheduler.createState('skill-c'),
      ];

      // Put one in learning state
      states[1] = scheduler.scheduleReview(states[1], true, 2);

      // Put one in review state
      states[2] = scheduler.scheduleReview(states[2], true, 3);

      const stats = scheduler.getStatistics(states, currentTime);

      expect(stats.totalItems).toBe(3);
      expect(stats.itemsByState.new).toBe(1);
      expect(stats.itemsByState.learning).toBe(1);
      expect(stats.itemsByState.review).toBe(1);
    });

    it('should calculate average retention', () => {
      const states = [scheduler.createState('skill-a')];
      const stats = scheduler.getStatistics(states, currentTime);

      expect(stats.averageRetention).toBe(1.0); // Just created
    });

    it('should count due items', () => {
      const states = [
        scheduler.createState('skill-a'), // Due immediately
        scheduler.createState('skill-b'), // Due immediately
      ];

      // Schedule one for later
      states[1] = scheduler.scheduleReview(states[1], true, 4);

      const stats = scheduler.getStatistics(states, currentTime);

      expect(stats.dueItems).toBe(1); // Only skill-a is due
    });

    it('should handle empty states array', () => {
      const stats = scheduler.getStatistics([], currentTime);

      expect(stats.totalItems).toBe(0);
      expect(stats.dueItems).toBe(0);
      expect(stats.averageRetention).toBe(0);
    });
  });

  describe('rating effects', () => {
    it('should give longer intervals for easy ratings', () => {
      let stateHard = scheduler.createState('skill-hard');
      let stateEasy = scheduler.createState('skill-easy');

      stateHard = scheduler.scheduleReview(stateHard, true, 2);
      stateEasy = scheduler.scheduleReview(stateEasy, true, 4);

      const intervalHard = stateHard.nextReview - currentTime;
      const intervalEasy = stateEasy.nextReview - currentTime;

      expect(intervalEasy).toBeGreaterThan(intervalHard);
    });

    it('should give shorter intervals for hard ratings', () => {
      let stateHard = scheduler.createState('skill-hard');
      let stateGood = scheduler.createState('skill-good');

      stateHard = scheduler.scheduleReview(stateHard, true, 2);
      stateGood = scheduler.scheduleReview(stateGood, true, 3);

      const intervalHard = stateHard.nextReview - currentTime;
      const intervalGood = stateGood.nextReview - currentTime;

      expect(intervalGood).toBeGreaterThan(intervalHard);
    });
  });

  describe('determinism', () => {
    it('should produce identical results for same inputs', () => {
      const state1 = scheduler.createState('skill-a');
      const state2 = scheduler.createState('skill-a');

      const result1 = scheduler.scheduleReview(state1, true, 3);
      const result2 = scheduler.scheduleReview(state2, true, 3);

      expect(result1.stability).toBe(result2.stability);
      expect(result1.difficulty).toBe(result2.difficulty);
      expect(result1.nextReview).toBe(result2.nextReview);
    });
  });

  describe('custom parameters', () => {
    it('should use custom requestedRetention', () => {
      const highRetentionScheduler = createFSRSScheduler({ requestedRetention: 0.95 }, mockClock);
      const lowRetentionScheduler = createFSRSScheduler({ requestedRetention: 0.80 }, mockClock);

      let highState = highRetentionScheduler.createState('skill-a');
      let lowState = lowRetentionScheduler.createState('skill-a');

      highState = highRetentionScheduler.scheduleReview(highState, true, 3);
      lowState = lowRetentionScheduler.scheduleReview(lowState, true, 3);

      // Higher requested retention = shorter intervals
      const highInterval = highState.nextReview - currentTime;
      const lowInterval = lowState.nextReview - currentTime;

      expect(highInterval).toBeLessThan(lowInterval);
    });

    it('should use custom initial stability', () => {
      const customScheduler = createFSRSScheduler({
        initialStability: [0.1, 0.5, 1.0, 2.0],
      }, mockClock);

      const state = customScheduler.createState('skill-a');

      // Default uses Good rating (index 2) for initial stability
      expect(state.stability).toBe(1.0);
    });
  });
});
