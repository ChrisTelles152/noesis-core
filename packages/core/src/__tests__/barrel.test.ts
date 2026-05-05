/**
 * Barrel completeness test (H-1.E.3)
 *
 * Locks in that every module added in 0.3.0 (and every prior module) is
 * reachable through the top-level package entry. If a future refactor
 * forgets to re-export a module from src/index.ts, this test fires before
 * the missing-export ships to consumers.
 *
 * Imports are intentionally *from the package root* (../index.js), not
 * from the module subpath — that's the contract consumers depend on.
 */

import { describe, it, expect } from 'vitest';
import * as core from '../index.js';

describe('Top-level barrel — 0.2.0 surface (existing modules)', () => {
  it('exports SkillGraphImpl + factories', () => {
    expect(typeof (core as { createSkillGraph?: unknown }).createSkillGraph).toBe('function');
    expect((core as { SkillGraphImpl?: unknown }).SkillGraphImpl).toBeDefined();
  });

  it('exports BKTEngine + factories', () => {
    expect(typeof (core as { createBKTEngine?: unknown }).createBKTEngine).toBe('function');
    expect((core as { DEFAULT_BKT_PARAMS?: unknown }).DEFAULT_BKT_PARAMS).toBeDefined();
  });

  it('exports FSRSScheduler + factories', () => {
    expect(typeof (core as { createFSRSScheduler?: unknown }).createFSRSScheduler).toBe(
      'function'
    );
    expect((core as { DEFAULT_FSRS_PARAMS?: unknown }).DEFAULT_FSRS_PARAMS).toBeDefined();
  });

  it('exports SessionPlannerImpl + DEFAULT_SESSION_CONFIG', () => {
    expect(typeof (core as { createSessionPlanner?: unknown }).createSessionPlanner).toBe(
      'function'
    );
    expect((core as { DEFAULT_SESSION_CONFIG?: unknown }).DEFAULT_SESSION_CONFIG).toBeDefined();
  });

  it('exports NoesisCoreEngineImpl + factories + getLearnerMetrics', () => {
    expect(typeof (core as { createDeterministicEngine?: unknown }).createDeterministicEngine).toBe(
      'function'
    );
    expect(typeof (core as { createSystemEngine?: unknown }).createSystemEngine).toBe('function');
    expect(typeof (core as { createNoesisCoreEngine?: unknown }).createNoesisCoreEngine).toBe(
      'function'
    );
    expect(typeof (core as { getLearnerMetrics?: unknown }).getLearnerMetrics).toBe('function');
  });

  it('exports event factories + ClockFn / IdGeneratorFn types via runtime', () => {
    expect(
      typeof (core as { createEventFactoryContext?: unknown }).createEventFactoryContext
    ).toBe('function');
    expect(typeof (core as { createPracticeEvent?: unknown }).createPracticeEvent).toBe(
      'function'
    );
  });

  it('exports persistence interfaces + InMemoryStateStore', () => {
    expect((core as { InMemoryStateStore?: unknown }).InMemoryStateStore).toBeDefined();
  });
});

describe('Top-level barrel — 0.3.0 additions (every new module reachable)', () => {
  it('config: EngineConfigOverrides validators + Channel types', () => {
    expect(
      typeof (core as { validateEngineConfigOverrides?: unknown }).validateEngineConfigOverrides
    ).toBe('function');
    expect(
      typeof (core as { assertValidEngineConfigOverrides?: unknown })
        .assertValidEngineConfigOverrides
    ).toBe('function');
  });

  it('answer: AnswerNormalizer + LevenshteinMatcher + levenshtein()', () => {
    expect((core as { LevenshteinMatcher?: unknown }).LevenshteinMatcher).toBeDefined();
    expect(
      typeof (core as { createLevenshteinMatcher?: unknown }).createLevenshteinMatcher
    ).toBe('function');
    expect(typeof (core as { levenshtein?: unknown }).levenshtein).toBe('function');
    expect(
      (core as { DEFAULT_BUDGET_BY_LENGTH?: unknown }).DEFAULT_BUDGET_BY_LENGTH
    ).toBeDefined();
  });

  it('fatigue: FatigueDetector + factory + DEFAULT_FATIGUE_CONFIG', () => {
    expect((core as { FatigueDetector?: unknown }).FatigueDetector).toBeDefined();
    expect(typeof (core as { createFatigueDetector?: unknown }).createFatigueDetector).toBe(
      'function'
    );
    expect((core as { DEFAULT_FATIGUE_CONFIG?: unknown }).DEFAULT_FATIGUE_CONFIG).toBeDefined();
  });

  it('calibration: EloDifficultyCalibrator + factory + pure helpers', () => {
    expect(
      (core as { EloDifficultyCalibrator?: unknown }).EloDifficultyCalibrator
    ).toBeDefined();
    expect(
      typeof (core as { createEloDifficultyCalibrator?: unknown }).createEloDifficultyCalibrator
    ).toBe('function');
    expect(typeof (core as { expectedProbability?: unknown }).expectedProbability).toBe(
      'function'
    );
    expect(typeof (core as { updateRatings?: unknown }).updateRatings).toBe('function');
    expect((core as { DEFAULT_ELO_CONFIG?: unknown }).DEFAULT_ELO_CONFIG).toBeDefined();
  });

  it('history: ItemHistoryAggregator + factory', () => {
    expect((core as { ItemHistoryAggregator?: unknown }).ItemHistoryAggregator).toBeDefined();
    expect(
      typeof (core as { createItemHistoryAggregator?: unknown }).createItemHistoryAggregator
    ).toBe('function');
    expect(
      (core as { DEFAULT_ITEM_HISTORY_CONFIG?: unknown }).DEFAULT_ITEM_HISTORY_CONFIG
    ).toBeDefined();
  });

  it('learner (MCBKT): MultiChannelBKTEngine + helpers', () => {
    expect((core as { MultiChannelBKTEngine?: unknown }).MultiChannelBKTEngine).toBeDefined();
    expect(
      typeof (core as { createMultiChannelBKTEngine?: unknown }).createMultiChannelBKTEngine
    ).toBe('function');
    expect(typeof (core as { calculateBKTUpdate?: unknown }).calculateBKTUpdate).toBe('function');
    expect(typeof (core as { applyCategoryModifier?: unknown }).applyCategoryModifier).toBe(
      'function'
    );
    expect(typeof (core as { utcDateString?: unknown }).utcDateString).toBe('function');
    expect(
      (core as { DEFAULT_DRILLING_DISCOUNT?: unknown }).DEFAULT_DRILLING_DISCOUNT
    ).toBeDefined();
  });

  it('mastery: LayeredMasteryModel + helpers', () => {
    expect((core as { LayeredMasteryModel?: unknown }).LayeredMasteryModel).toBeDefined();
    expect(
      typeof (core as { createLayeredMasteryModel?: unknown }).createLayeredMasteryModel
    ).toBe('function');
    expect(
      typeof (core as { makeChannelMapping?: unknown }).makeChannelMapping
    ).toBe('function');
    expect(
      (core as { DEFAULT_LAYERED_MASTERY_CONFIG?: unknown }).DEFAULT_LAYERED_MASTERY_CONFIG
    ).toBeDefined();
    expect((core as { NO_CHANNEL_MAPPING?: unknown }).NO_CHANNEL_MAPPING).toBeDefined();
  });

  it('planning (BudgetedSessionPlanner): factory + defaults', () => {
    expect(
      (core as { BudgetedSessionPlanner?: unknown }).BudgetedSessionPlanner
    ).toBeDefined();
    expect(
      typeof (core as { createBudgetedSessionPlanner?: unknown }).createBudgetedSessionPlanner
    ).toBe('function');
    expect(
      (core as { DEFAULT_SESSION_BUDGET_CONFIG?: unknown }).DEFAULT_SESSION_BUDGET_CONFIG
    ).toBeDefined();
  });

  it('planning (PlannerSnapshot): build + replay + serialize', () => {
    expect(
      typeof (core as { buildPlannerSnapshot?: unknown }).buildPlannerSnapshot
    ).toBe('function');
    expect(typeof (core as { planFromSnapshot?: unknown }).planFromSnapshot).toBe('function');
    expect(
      typeof (core as { serializePlannerSnapshot?: unknown }).serializePlannerSnapshot
    ).toBe('function');
    expect(
      typeof (core as { deserializePlannerSnapshot?: unknown }).deserializePlannerSnapshot
    ).toBe('function');
    expect(
      (core as { PLANNER_SNAPSHOT_VERSION?: unknown }).PLANNER_SNAPSHOT_VERSION
    ).toBeDefined();
  });

  it('session: SessionLifecycleManager + factory', () => {
    expect(
      (core as { SessionLifecycleManager?: unknown }).SessionLifecycleManager
    ).toBeDefined();
    expect(
      typeof (core as { createSessionLifecycleManager?: unknown }).createSessionLifecycleManager
    ).toBe('function');
  });

  it('persistence (OptimisticLockingStateStore): interface + memory impl + retry', () => {
    expect(
      (core as { OptimisticLockConflictError?: unknown }).OptimisticLockConflictError
    ).toBeDefined();
    expect(
      (core as { InMemoryOptimisticStore?: unknown }).InMemoryOptimisticStore
    ).toBeDefined();
    expect(
      typeof (core as { createInMemoryOptimisticStore?: unknown })
        .createInMemoryOptimisticStore
    ).toBe('function');
    expect(typeof (core as { updateWithRetry?: unknown }).updateWithRetry).toBe('function');
  });

  it('logging: SessionMetricsLogger + computeSessionMetrics', () => {
    expect((core as { SessionMetricsLogger?: unknown }).SessionMetricsLogger).toBeDefined();
    expect(
      typeof (core as { createSessionMetricsLogger?: unknown }).createSessionMetricsLogger
    ).toBe('function');
    expect(
      typeof (core as { computeSessionMetrics?: unknown }).computeSessionMetrics
    ).toBe('function');
  });
});

describe('Top-level barrel — VERSION', () => {
  it('exports a non-empty VERSION string', () => {
    expect(typeof (core as { VERSION?: unknown }).VERSION).toBe('string');
    expect((core as { VERSION: string }).VERSION.length).toBeGreaterThan(0);
  });
});
