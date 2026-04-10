/**
 * Core Engine Module
 *
 * Provides the unified Noesis Core Engine interface.
 */

export type { NoesisCoreEngine } from '../constitution.js';

export {
  NoesisCoreEngineImpl,
  createNoesisCoreEngine,
  createDeterministicEngine,
  computeRating,
  DEFAULT_RATING_CONFIG,
  type CoreEngineConfig,
  type RatingConfig,
  type LearnerProgress,
} from './NoesisCoreEngineImpl.js';

// Metrics extraction
export { getLearnerMetrics, type LearnerMetrics } from './metrics.js';
