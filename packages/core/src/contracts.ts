/**
 * @noesis-edu/core/contracts — types-only subpath
 *
 * Re-exports every type contract pack manifests and integration shims need,
 * with no runtime values (no functions, no classes, no constants).
 *
 * Why this exists: pack manifest packages (`@noesis-content/math-br`,
 * `@noesis-content/eng`, `@noesis-content/delf-fr`) need to declare
 * `EngineConfigOverrides`, `PackManifest`, `ChannelId`, etc. without pulling
 * the full `@noesis-edu/core` runtime into their bundles. Importing from
 * this subpath lets bundlers tree-shake the runtime away entirely — the
 * contracts.js file is essentially empty, since TypeScript erases all
 * type-only exports at compile time.
 *
 * Usage:
 *   import type { ChannelId, EngineConfigOverrides } from '@noesis-edu/core/contracts';
 *
 * Stable: any addition or removal here is a semver-breaking change.
 */

// ---------- Constitution: canonical types ----------
export type {
  Skill,
  SkillGraph,
  SkillGraphValidationResult,
  SkillGraphError,
  SkillProbability,
  LearnerModel,
  LearnerModelEngine,
  MemoryState,
  MemoryScheduler,
  SessionConfig,
  SessionAction,
  SessionPlanner,
  TransferTest,
  TransferTestResult,
  TransferGate,
  DiagnosticEngine,
  ItemSkillMapping,
  NoesisCoreEngine,
  NoesisEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
  ImplicitCreditEvent,
  CognitiveStateVector,
  CognitiveStateEvent,
  StageCompletedEvent,
  CanonicalStage,
} from './constitution.js';

// ---------- Engine config + factory shapes ----------
export type {
  CoreEngineConfig,
  RatingConfig,
  LearnerProgress,
  LearnerMetrics,
  LearnerMetricsOptions,
} from './engine/index.js';

// ---------- Persistence interfaces ----------
export type {
  NoesisStateStore,
  OptimisticLockingStore,
  VersionedValue,
  UpdateWithRetryOptions,
} from './persistence/index.js';

// ---------- BKT (single-channel) ----------
export type { BKTParams } from './learner/index.js';

// ---------- BKT (multi-channel) ----------
export type {
  ChannelId,
  ChannelBKTConfig,
  SkillCategoryModifier,
  DrillingDiscountConfig,
  MultiChannelBKTConfig,
  ChannelSkillProbability,
  BKTAttemptResult,
  BKTComputeResult,
} from './learner/index.js';

// ---------- FSRS ----------
export type { FSRSParams } from './memory/index.js';

// ---------- Layered mastery ----------
export type {
  MasteryLayer,
  LayeredMasteryConfig,
  ChannelStatus,
  SkillStatus,
  SkillChannelMapping,
  PackMasterySummary,
} from './mastery/index.js';

// ---------- Planning (single-action SessionPlanner already in constitution above) ----------
export type {
  SessionPlannerConfig,
  PlannerState,
  SessionStats,
  SessionBudgetConfig,
  ReviewCandidate,
  ErrorCandidate,
  NewItemCandidate,
  SessionPlanInput,
  SessionPlan,
  PlannerSnapshot,
  BuildSnapshotArgs,
} from './planning/index.js';

// ---------- Session lifecycle ----------
export type { SessionRecord, CreateSessionArgs } from './session/index.js';

// ---------- Logging / metrics ----------
export type {
  AttemptRecord,
  ChannelMetrics,
  SkillMetrics,
  SessionMetrics,
} from './logging/index.js';

// ---------- Fatigue ----------
export type { FatigueConfig, FatigueSignal } from './fatigue/index.js';

// ---------- Calibration ----------
export type { EloCalibratorConfig, EloUpdateResult } from './calibration/index.js';

// ---------- Item history ----------
export type { ItemAttempt, ItemHistoryConfig, ItemMasteryInfo } from './history/index.js';

// ---------- Answer normalizer ----------
export type {
  AnswerNormalizer,
  LevenshteinMatcherConfig,
} from './answer/index.js';

// ---------- Engine config overrides (the pack-tuning surface) ----------
export type {
  Channel,
  ChannelBKTOverrides,
  ChannelResponseTimeOverrides,
  EngineConfigOverrides,
  EngineConfigValidationError,
} from './config/index.js';
