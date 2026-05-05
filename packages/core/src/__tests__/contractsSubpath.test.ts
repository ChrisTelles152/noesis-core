/**
 * Contracts subpath test (H-1.E.4)
 *
 * Verifies that `@noesis-edu/core/contracts` exposes a stable types-only
 * surface for pack manifest authors. Tests cover:
 *
 *   1. Importing types compiles cleanly (the test file itself is the proof —
 *      if the contracts subpath is missing or wrong-shaped, this file fails
 *      to type-check via `npm run typecheck`).
 *
 *   2. The contracts module exports zero runtime values (it's types-only,
 *      so the runtime `import * as` should yield an empty exports object).
 */

import { describe, it, expect } from 'vitest';
import type {
  // Constitution
  Skill,
  SkillGraph,
  SessionConfig,
  PracticeEvent,
  // Engine
  LearnerMetrics,
  LearnerMetricsOptions,
  // BKT
  BKTParams,
  ChannelId,
  ChannelBKTConfig,
  MultiChannelBKTConfig,
  ChannelSkillProbability,
  // Mastery
  MasteryLayer,
  LayeredMasteryConfig,
  // Planning
  SessionBudgetConfig,
  SessionPlan,
  PlannerSnapshot,
  // Session lifecycle
  SessionRecord,
  // Logging
  SessionMetrics,
  // Fatigue
  FatigueConfig,
  FatigueSignal,
  // Calibration
  EloCalibratorConfig,
  // Answer
  AnswerNormalizer,
  // Engine config overrides
  EngineConfigOverrides,
  Channel,
  // Persistence
  NoesisStateStore,
  OptimisticLockingStore,
  VersionedValue,
} from '../contracts.js';

describe('contracts subpath — runtime emptiness', () => {
  it('contracts.ts emits zero runtime exports (types-only)', async () => {
    // Importing the module dynamically; .keys() on the namespace should be empty
    // because every export is `export type { ... }`.
    const contracts = await import('../contracts.js');
    expect(Object.keys(contracts)).toEqual([]);
  });
});

describe('contracts subpath — type-shape sanity (compile-time)', () => {
  // These tests don't assert runtime behavior — they assert that the imported
  // types are usable as types. If a type is missing from the subpath, the
  // file fails to compile and the test never runs.
  it('Skill / SkillGraph types are usable', () => {
    const skill: Skill = { id: 'a', name: 'A', prerequisites: [] };
    expect(skill.id).toBe('a');
    // SkillGraph is an interface — declared, not instantiated here.
    const stub: Partial<SkillGraph> = {};
    expect(stub).toBeDefined();
  });

  it('SessionConfig / PracticeEvent types are usable', () => {
    const cfg: Partial<SessionConfig> = { targetItems: 18 };
    expect(cfg.targetItems).toBe(18);
    const evt: Partial<PracticeEvent> = { type: 'practice', correct: true };
    expect(evt.correct).toBe(true);
  });

  it('LearnerMetrics + LearnerMetricsOptions types are usable', () => {
    const opts: LearnerMetricsOptions = {};
    expect(opts).toEqual({});
    const m: Partial<LearnerMetrics> = { learnerId: 'u', timestamp: 0 };
    expect(m.learnerId).toBe('u');
  });

  it('BKT types are usable (single + multi-channel)', () => {
    const bkt: BKTParams = { pInit: 0.3, pLearn: 0.1, pSlip: 0.1, pGuess: 0.2 };
    expect(bkt.pInit).toBe(0.3);
    const ch: ChannelBKTConfig = { ...bkt };
    const channelId: ChannelId = 'recog_mc';
    const mc: MultiChannelBKTConfig = { channels: { [channelId]: ch } };
    expect(mc.channels.recog_mc.pInit).toBe(0.3);
    const csp: Partial<ChannelSkillProbability> = { skillId: 's', channel: 'cloze' };
    expect(csp.channel).toBe('cloze');
  });

  it('Mastery types are usable', () => {
    const layer: MasteryLayer = 'mastered';
    expect(layer).toBe('mastered');
    const cfg: Partial<LayeredMasteryConfig> = {};
    expect(cfg).toEqual({});
  });

  it('Planning types are usable', () => {
    const budget: Partial<SessionBudgetConfig> = { defaultBudget: 20 };
    expect(budget.defaultBudget).toBe(20);
    const plan: Partial<SessionPlan> = { budget: 18 };
    expect(plan.budget).toBe(18);
    const snap: Partial<PlannerSnapshot> = { version: '1.0.0' };
    expect(snap.version).toBe('1.0.0');
  });

  it('Session + Logging + Fatigue + Calibration types are usable', () => {
    const rec: Partial<SessionRecord> = { sessionId: 's' };
    expect(rec.sessionId).toBe('s');
    const m: Partial<SessionMetrics> = { totalAttempts: 0 };
    expect(m.totalAttempts).toBe(0);
    const f: Partial<FatigueConfig> = { windowSize: 10 };
    expect(f.windowSize).toBe(10);
    const sig: FatigueSignal = 'none';
    expect(sig).toBe('none');
    const e: Partial<EloCalibratorConfig> = { defaultRating: 1200 };
    expect(e.defaultRating).toBe(1200);
  });

  it('Answer + EngineConfigOverrides + Persistence types are usable', () => {
    const stubNorm: Partial<AnswerNormalizer> = {};
    expect(stubNorm).toEqual({});
    const o: EngineConfigOverrides = { session: { targetItems: 15 } };
    expect(o.session?.targetItems).toBe(15);
    const ch: Channel = 'cloze';
    expect(ch).toBe('cloze');
    const store: Partial<NoesisStateStore> = {};
    expect(store).toEqual({});
    const oStore: Partial<OptimisticLockingStore<string, number>> = {};
    expect(oStore).toEqual({});
    const vv: VersionedValue<number> = { value: 42, version: 1 };
    expect(vv.value).toBe(42);
  });
});
