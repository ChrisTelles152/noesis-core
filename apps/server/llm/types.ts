/**
 * LLM Provider Types
 * Abstraction layer for multiple LLM providers
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LLMCompletionResult {
  content: string;
  finishReason: 'stop' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: string;
  model: string;
}

export interface LLMProvider {
  name: string;
  isConfigured(): boolean;
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>;
}

export type LLMProviderType = 'openai' | 'anthropic' | 'ollama' | 'fallback';

export interface LLMConfig {
  provider: LLMProviderType;
  openai?: {
    apiKey: string;
    model?: string;
  };
  anthropic?: {
    apiKey: string;
    model?: string;
  };
  ollama?: {
    baseUrl: string;
    model?: string;
  };
}
