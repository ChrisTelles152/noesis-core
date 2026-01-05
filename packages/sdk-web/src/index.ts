/**
 * @noesis/sdk-web
 *
 * Web-friendly facade for the Noesis learning system.
 *
 * This package provides a unified SDK interface that integrates:
 * - Attention tracking (via @noesis/adapters-attention-web)
 * - LLM orchestration (via @noesis/adapters-llm)
 * - Mastery tracking (reference policy implementation)
 * - Core learning engine (via @noesis/core)
 *
 * This is a convenience wrapper for web applications. The core learning
 * engine (@noesis/core) can be used directly for more control.
 *
 * @packageDocumentation
 */

export { NoesisSDK } from './NoesisSDK';
export { MasteryTracker } from './policies/mastery';

// Core engine integration
export {
  CoreEngineAdapter,
  createCoreEngineAdapter,
  type CoreAdapterConfig,
} from './core';

// Re-export commonly used core types for convenience
export type {
  Skill,
  SkillGraph,
  SessionConfig,
  SessionAction,
  NoesisEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
  LearnerProgress,
} from '@noesis/core';

// Re-export types
export type {
  NoesisSDKOptions,
  ModuleType,
  LearnerState,
  AttentionData,
  MasteryData,
  LearningObjective,
  LearningEvent,
  MasteryOptions,
  OrchestratorRequest,
  OrchestratorResponse,
} from './types';
