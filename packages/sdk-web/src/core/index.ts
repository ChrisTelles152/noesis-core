/**
 * Core Engine Integration
 *
 * Provides access to @noesis/core through sdk-web.
 */

export {
  CoreEngineAdapter,
  createCoreEngineAdapter,
  type CoreAdapterConfig,
} from './CoreEngineAdapter';

// Re-export commonly used types from core
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
  LearnerModel,
  MemoryState,
} from '@noesis/core';
