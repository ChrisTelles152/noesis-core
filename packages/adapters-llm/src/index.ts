/**
 * @noesis/adapters-llm
 *
 * LLM integration adapters for the Noesis learning system.
 *
 * This package provides:
 * - Client-side orchestration (for browser apps)
 * - Server-side LLM providers (OpenAI, Anthropic, Fallback)
 * - LLM Manager with automatic fallback
 *
 * LLM integration is OPTIONAL. The core Noesis learning loop does not require
 * LLM-based recommendations. LLMs provide supplementary personalization.
 *
 * @packageDocumentation
 */

// Client-side orchestration (for browser apps calling API)
export { Orchestrator } from './orchestration';

// Server-side LLM manager and providers
export { LLMManager, getLLMManager, resetLLMManager } from './manager';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { FallbackProvider } from './providers/fallback';

// Types
export type {
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMProvider,
  LLMProviderType,
  LLMConfig,
} from './types';

// Re-export orchestration types for convenience
export type {
  OrchestratorRequest,
  OrchestratorResponse,
  EngagementRequest,
  EngagementResponse,
  LearnerState,
} from './orchestration-types';
