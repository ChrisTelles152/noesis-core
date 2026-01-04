/**
 * Core Engine Module
 *
 * Provides the unified Noesis Core Engine interface.
 */

export type {
  NoesisCoreEngine,
} from '../constitution';

export {
  NoesisCoreEngineImpl,
  createNoesisCoreEngine,
  createDeterministicEngine,
  type CoreEngineConfig,
  type LearnerProgress,
} from './NoesisCoreEngineImpl';
