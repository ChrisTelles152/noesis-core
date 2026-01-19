/**
 * Learner Metrics Tests
 *
 * Tests for the getLearnerMetrics proof extraction function.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { getLearnerMetrics, type LearnerMetrics } from '../engine/metrics';
import { createSkillGraph, type Skill } from '../graph';
import { createDeterministicEngine } from '../engine';
import {
  createEventFactoryContext,
  createDeterministicIdGenerator,
  createPracticeEvent,
} from '../events';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createTestSkills(): Skill[] {
  return [
    { id: 'arithmetic', name: 'Basic Arithmetic', prerequisites: [] },
    { id: 'algebra', name: 'Algebra', prerequisites: ['arithmetic'] },
    { id: 'calculus', name: 'Calculus', prerequisites: ['algebra'] },
  ];
}

function createTestEngine(startTime: number = 0) {
  const graph = createSkillGraph();
  for (const skill of createTestSkills()) {
    graph.addSkill(skill);
  }
  return createDeterministicEngine(graph, {}, startTime);
}

// =============================================================================
// BASIC METRICS TESTS
// =============================================================================

describe('getLearnerMetrics', () => {
  const learnerId = 'test-learner';
  const sessionId = 'session-1';

  it('should return empty metrics for unknown learner', () => {
    const engine = createTestEngine(1000);
    const metrics = getLearnerMetrics(engine, 'unknown-learner');

    expect(metrics.learnerId).toBe('unknown-learner');
    expect(metrics.timestamp).toBe(1000);
    expect(Object.keys(metrics.masteryBySkill)).toHaveLength(0);
    expect(Object.keys(metrics.retentionBySkill)).toHaveLength(0);
    expect(metrics.nextReviews).toHaveLength(0);
    expect(metrics.averageMastery).toBe(0);
    expect(metrics.averageRetention).toBe(0);
    expect(metrics.skillsMastered).toBe(0);
    expect(metrics.skillsDue).toBe(0);
    expect(metrics.totalPracticeEvents).toBe(0);
  });

  it('should compute masteryBySkill from practice events', () => {
    const engine = createTestEngine(1000);
    const ctx = createEventFactoryContext(
      () => 1000,
      createDeterministicIdGenerator('evt')
    );

    // Process some practice events
    const event1 = createPracticeEvent(ctx, learnerId, sessionId, 'arithmetic', 'item-1', true, 500);
    const event2 = createPracticeEvent(ctx, learnerId, sessionId, 'arithmetic', 'item-2', true, 500);
    const event3 = createPracticeEvent(ctx, learnerId, sessionId, 'algebra', 'item-3', false, 500);

    engine.processEvent(event1);
    engine.processEvent(event2);
    engine.processEvent(event3);

    const metrics = getLearnerMetrics(engine, learnerId);

    // Should have mastery data for practiced skills
    expect(metrics.masteryBySkill).toHaveProperty('arithmetic');
    expect(metrics.masteryBySkill).toHaveProperty('algebra');
    expect(metrics.masteryBySkill['arithmetic']).toBeGreaterThan(0.3); // Started and improved
    expect(metrics.masteryBySkill['algebra']).toBeLessThan(0.5); // Failed, lower mastery
  });

  it('should compute retentionBySkill in valid range [0, 1]', () => {
    const startTime = 1000;
    const engine = createTestEngine(startTime);
    const ctx = createEventFactoryContext(
      () => startTime,
      createDeterministicIdGenerator('evt')
    );

    // Process a practice event
    const event = createPracticeEvent(ctx, learnerId, sessionId, 'arithmetic', 'item-1', true, 500);
    engine.processEvent(event);

    // Get metrics at same time (retention should be ~1.0)
    const metrics = getLearnerMetrics(engine, learnerId, startTime);

    expect(metrics.retentionBySkill).toHaveProperty('arithmetic');
    const retention = metrics.retentionBySkill['arithmetic'];
    expect(retention).toBeGreaterThanOrEqual(0);
    expect(retention).toBeLessThanOrEqual(1);
    expect(retention).toBeCloseTo(1.0, 1); // High retention immediately after review
  });

  it('should compute retention decay over time', () => {
    const startTime = 0;
    const engine = createTestEngine(startTime);
    const ctx = createEventFactoryContext(
      () => startTime,
      createDeterministicIdGenerator('evt')
    );

    // Process a practice event at time 0
    const event = createPracticeEvent(ctx, learnerId, sessionId, 'arithmetic', 'item-1', true, 500);
    engine.processEvent(event);

    // Get metrics at time 0
    const metricsNow = getLearnerMetrics(engine, learnerId, startTime);

    // Get metrics 30 days later (in milliseconds)
    const thirtyDaysLater = startTime + 30 * 24 * 60 * 60 * 1000;
    const metricsLater = getLearnerMetrics(engine, learnerId, thirtyDaysLater);

    // Retention should decrease over time
    expect(metricsLater.retentionBySkill['arithmetic']).toBeLessThan(
      metricsNow.retentionBySkill['arithmetic']
    );
    expect(metricsLater.retentionBySkill['arithmetic']).toBeGreaterThan(0);
    expect(metricsLater.retentionBySkill['arithmetic']).toBeLessThan(1);
  });

  it('should return due skills in nextReviews at chosen atTime', () => {
    const startTime = 0;
    const engine = createTestEngine(startTime);
    const ctx = createEventFactoryContext(
      () => startTime,
      createDeterministicIdGenerator('evt')
    );

    // Process practice events
    const event1 = createPracticeEvent(ctx, learnerId, sessionId, 'arithmetic', 'item-1', true, 500);
    const event2 = createPracticeEvent(ctx, learnerId, sessionId, 'algebra', 'item-2', true, 500);
    engine.processEvent(event1);
    engine.processEvent(event2);

    // Check at a time far in the future when skills should be due
    const farFuture = startTime + 365 * 24 * 60 * 60 * 1000; // 1 year later
    const metrics = getLearnerMetrics(engine, learnerId, farFuture);

    expect(metrics.nextReviews.length).toBeGreaterThan(0);
    expect(metrics.skillsDue).toBeGreaterThan(0);

    // All reviews should be overdue (positive overdueDays)
    for (const review of metrics.nextReviews) {
      expect(review.overdueDays).toBeGreaterThan(0);
      expect(review.dueAt).toBeLessThan(farFuture);
    }

    // Should be sorted by most overdue first
    for (let i = 1; i < metrics.nextReviews.length; i++) {
      expect(metrics.nextReviews[i - 1].overdueDays).toBeGreaterThanOrEqual(
        metrics.nextReviews[i].overdueDays
      );
    }
  });

  it('should compute averageMastery and averageRetention as finite numbers', () => {
    const engine = createTestEngine(1000);
    const ctx = createEventFactoryContext(
      () => 1000,
      createDeterministicIdGenerator('evt')
    );

    // Process multiple practice events
    for (let i = 0; i < 5; i++) {
      const event = createPracticeEvent(
        ctx,
        learnerId,
        sessionId,
        'arithmetic',
        `item-${i}`,
        true,
        500
      );
      engine.processEvent(event);
    }

    const event2 = createPracticeEvent(ctx, learnerId, sessionId, 'algebra', 'item-a', true, 500);
    engine.processEvent(event2);

    const metrics = getLearnerMetrics(engine, learnerId);

    expect(Number.isFinite(metrics.averageMastery)).toBe(true);
    expect(Number.isFinite(metrics.averageRetention)).toBe(true);
    expect(metrics.averageMastery).toBeGreaterThan(0);
    expect(metrics.averageMastery).toBeLessThanOrEqual(1);
    expect(metrics.averageRetention).toBeGreaterThan(0);
    expect(metrics.averageRetention).toBeLessThanOrEqual(1);
  });

  it('should count totalPracticeEvents correctly', () => {
    const engine = createTestEngine(1000);
    const ctx = createEventFactoryContext(
      () => 1000,
      createDeterministicIdGenerator('evt')
    );

    // Process 7 practice events
    for (let i = 0; i < 7; i++) {
      const event = createPracticeEvent(
        ctx,
        learnerId,
        sessionId,
        'arithmetic',
        `item-${i}`,
        i % 2 === 0, // Alternate correct/incorrect
        500
      );
      engine.processEvent(event);
    }

    const metrics = getLearnerMetrics(engine, learnerId);
    expect(metrics.totalPracticeEvents).toBe(7);
  });

  it('should compute estimatedEventsToFullMastery', () => {
    const engine = createTestEngine(1000);
    const ctx = createEventFactoryContext(
      () => 1000,
      createDeterministicIdGenerator('evt')
    );

    // Process one event to initialize a skill (but not master it)
    const event = createPracticeEvent(ctx, learnerId, sessionId, 'arithmetic', 'item-1', true, 500);
    engine.processEvent(event);

    const metrics = getLearnerMetrics(engine, learnerId);

    // Should have some estimate (skill is not mastered yet)
    expect(Number.isFinite(metrics.estimatedEventsToFullMastery)).toBe(true);
    expect(metrics.estimatedEventsToFullMastery).toBeGreaterThanOrEqual(0);
  });

  it('should respect custom atTime parameter', () => {
    const engine = createTestEngine(0);
    const customTime = 999999;

    const metrics = getLearnerMetrics(engine, learnerId, customTime);
    expect(metrics.timestamp).toBe(customTime);
  });

  it('should track multiple learners independently', () => {
    const engine = createTestEngine(1000);
    const ctx = createEventFactoryContext(
      () => 1000,
      createDeterministicIdGenerator('evt')
    );

    // Learner A: 3 correct events on arithmetic
    for (let i = 0; i < 3; i++) {
      const event = createPracticeEvent(ctx, 'learner-a', sessionId, 'arithmetic', `item-${i}`, true, 500);
      engine.processEvent(event);
    }

    // Learner B: 1 incorrect event on algebra
    const eventB = createPracticeEvent(ctx, 'learner-b', sessionId, 'algebra', 'item-x', false, 500);
    engine.processEvent(eventB);

    const metricsA = getLearnerMetrics(engine, 'learner-a');
    const metricsB = getLearnerMetrics(engine, 'learner-b');

    // Practice event counts are independent
    expect(metricsA.totalPracticeEvents).toBe(3);
    expect(metricsB.totalPracticeEvents).toBe(1);

    // Both learners have all skills initialized (BKT creates cold-start priors)
    // but their mastery values differ based on practice
    expect(metricsA.masteryBySkill).toHaveProperty('arithmetic');
    expect(metricsB.masteryBySkill).toHaveProperty('algebra');

    // Learner A's arithmetic mastery should be higher (3 correct)
    // Learner B's algebra mastery should be lower (1 incorrect)
    expect(metricsA.masteryBySkill['arithmetic']).toBeGreaterThan(
      metricsB.masteryBySkill['algebra']
    );

    // Memory states are independent
    expect(metricsA.retentionBySkill).toHaveProperty('arithmetic');
    expect(metricsB.retentionBySkill).toHaveProperty('algebra');
    expect(metricsA.retentionBySkill).not.toHaveProperty('algebra'); // Not practiced
    expect(metricsB.retentionBySkill).not.toHaveProperty('arithmetic'); // Not practiced
  });
});
