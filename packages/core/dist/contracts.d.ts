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
export type { Skill, SkillGraph, SkillGraphValidationResult, SkillGraphError, SkillProbability, LearnerModel, LearnerModelEngine, MemoryState, MemoryScheduler, SessionConfig, SessionAction, SessionPlanner, TransferTest, TransferTestResult, TransferGate, DiagnosticEngine, ItemSkillMapping, NoesisCoreEngine, NoesisEvent, PracticeEvent, DiagnosticEvent, TransferTestEvent, SessionEvent, ImplicitCreditEvent, CognitiveStateVector, CognitiveStateEvent, StageCompletedEvent, CanonicalStage, } from './constitution.js';
export type { CoreEngineConfig, RatingConfig, LearnerProgress, LearnerMetrics, LearnerMetricsOptions, } from './engine/index.js';
export type { NoesisStateStore, OptimisticLockingStore, VersionedValue, UpdateWithRetryOptions, } from './persistence/index.js';
export type { BKTParams } from './learner/index.js';
export type { ChannelId, ChannelBKTConfig, SkillCategoryModifier, DrillingDiscountConfig, MultiChannelBKTConfig, ChannelSkillProbability, BKTAttemptResult, BKTComputeResult, } from './learner/index.js';
export type { FSRSParams } from './memory/index.js';
export type { MasteryLayer, LayeredMasteryConfig, ChannelStatus, SkillStatus, SkillChannelMapping, PackMasterySummary, } from './mastery/index.js';
export type { SessionPlannerConfig, PlannerState, SessionStats, SessionBudgetConfig, ReviewCandidate, ErrorCandidate, NewItemCandidate, SessionPlanInput, SessionPlan, PlannerSnapshot, BuildSnapshotArgs, } from './planning/index.js';
export type { SessionRecord, CreateSessionArgs } from './session/index.js';
export type { AttemptRecord, ChannelMetrics, SkillMetrics, SessionMetrics, } from './logging/index.js';
export type { FatigueConfig, FatigueSignal } from './fatigue/index.js';
export type { EloCalibratorConfig, EloUpdateResult } from './calibration/index.js';
export type { ItemAttempt, ItemHistoryConfig, ItemMasteryInfo } from './history/index.js';
export type { AnswerNormalizer, LevenshteinMatcherConfig } from './answer/index.js';
export type { Channel, ChannelBKTOverrides, ChannelResponseTimeOverrides, EngineConfigOverrides, EngineConfigValidationError, } from './config/index.js';
//# sourceMappingURL=contracts.d.ts.map