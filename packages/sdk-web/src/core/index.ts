/**
 * Core Engine Integration
 *
 * Provides access to @noesis-edu/core through sdk-web.
 */

export {
  CoreEngineAdapter,
  createCoreEngineAdapter,
  localStorageTransport,
  httpTransport,
  type CoreAdapterConfig,
  type PersistenceTransport,
  type PersistOptions,
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
} from '@noesis-edu/core';
