/**
 * Diagnostic Engine Module
 *
 * Provides diagnostic assessment for cold-start learner placement.
 */

export type {
  DiagnosticEngine,
  ItemSkillMapping,
} from '../constitution';

export {
  DiagnosticEngineImpl,
  createDiagnosticEngine,
  DEFAULT_DIAGNOSTIC_CONFIG,
  type DiagnosticConfig,
  type DiagnosticSummary,
} from './DiagnosticEngineImpl';
