/**
 * LLM Provider Manager
 * Handles multi-provider support with automatic fallback
 */

import type { LLMProvider, LLMCompletionOptions, LLMCompletionResult, LLMProviderType, LLMLogger } from './types';
import { defaultLogger } from './types';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { FallbackProvider } from './providers/fallback';

export * from './types';

export interface LLMManagerOptions {
  preferredProvider?: LLMProviderType;
  logger?: LLMLogger;
}

export class LLMManager {
  private providers: Map<LLMProviderType, LLMProvider> = new Map();
  private preferredProvider: LLMProviderType;
  private fallbackProvider: FallbackProvider;
  private logger: LLMLogger;

  constructor(options: LLMManagerOptions = {}) {
    this.logger = options.logger || defaultLogger;

    // Initialize all providers
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('anthropic', new AnthropicProvider());
    this.fallbackProvider = new FallbackProvider();
    this.providers.set('fallback', this.fallbackProvider);

    // Determine preferred provider
    this.preferredProvider = options.preferredProvider || this.detectPreferredProvider();

    this.logger.info('LLM Manager initialized', { preferredProvider: this.preferredProvider });
    this.logProviderStatus();
  }

  /**
   * Detect which provider to use based on available API keys
   */
  private detectPreferredProvider(): LLMProviderType {
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    return 'fallback';
  }

  /**
   * Log the status of each provider
   */
  private logProviderStatus(): void {
    const entries = Array.from(this.providers.entries());
    for (const [name, provider] of entries) {
      const configured = provider.isConfigured();
      this.logger.info(`Provider status: ${name}`, { provider: name, configured });
    }
  }

  /**
   * Get the list of configured providers
   */
  getConfiguredProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isConfigured())
      .map(([name]) => name);
  }

  /**
   * Check if any real LLM provider is configured
   */
  hasLLMProvider(): boolean {
    return this.preferredProvider !== 'fallback';
  }

  /**
   * Get the currently active provider name
   */
  getActiveProvider(): string {
    return this.preferredProvider;
  }

  /**
   * Complete a prompt with automatic provider fallback
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const providersToTry: LLMProviderType[] = [
      this.preferredProvider,
      // Add fallback providers
      ...(['openai', 'anthropic', 'fallback'] as LLMProviderType[])
        .filter(p => p !== this.preferredProvider),
    ];

    let lastError: Error | null = null;

    for (const providerName of providersToTry) {
      const provider = this.providers.get(providerName);

      if (!provider || !provider.isConfigured()) {
        continue;
      }

      try {
        const result = await provider.complete(options);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Provider failed: ${providerName}`, { provider: providerName }, err);
        lastError = err;
        // Continue to next provider
      }
    }

    // All providers failed, use fallback
    this.logger.warn('All providers failed, using fallback');
    return this.fallbackProvider.complete(options);
  }

  /**
   * Get a learning recommendation
   */
  async getRecommendation(context: {
    attentionScore: number;
    masteryData: Array<{ id: string; name: string; progress: number; status: string }>;
    learningContext?: string;
  }): Promise<LLMCompletionResult> {
    const systemPrompt = `You are an adaptive learning assistant that provides personalized learning recommendations based on attention data and mastery progress. Respond with JSON in this format: { "suggestion": string, "explanation": string, "resourceLinks": string[] }`;

    const userPrompt = `
Learner attention score: ${context.attentionScore} (0-1 scale)
Context: ${context.learningContext || 'general learning'}
Mastery data: ${JSON.stringify(context.masteryData)}

Based on this data, provide a recommendation for what the learner should do next.
Keep suggestions concise, evidence-based, and personalized to attention level and context.
`;

    return this.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      jsonMode: true,
    });
  }

  /**
   * Get an engagement suggestion for low attention
   */
  async getEngagementSuggestion(context: {
    attentionScore: number;
    learningContext?: string;
    previousInterventions?: string[];
  }): Promise<LLMCompletionResult> {
    const systemPrompt = `You are an adaptive learning assistant focused on maintaining learner engagement. Respond with JSON in this format: { "message": string, "type": string }`;

    const userPrompt = `
Learner attention score: ${context.attentionScore} (0-1 scale, lower means less attentive)
Context: ${context.learningContext || 'general learning'}
Previous interventions: ${JSON.stringify(context.previousInterventions || [])}

The learner's attention appears to be dropping. Suggest a brief intervention to re-engage them.
Keep your suggestion concise, friendly, and immediately actionable. The type should be one of:
attention-prompt, interactive-element, modality-change, micro-break, social-engagement
`;

    return this.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      jsonMode: true,
    });
  }
}

// Singleton instance and configuration
let llmManager: LLMManager | null = null;
let singletonOptions: LLMManagerOptions = {};

/**
 * Configure the singleton LLM Manager options
 * Call this before getLLMManager() to customize the manager
 */
export function configureLLMManager(options: LLMManagerOptions): void {
  singletonOptions = options;
  // Reset the manager so it's recreated with new options
  llmManager = null;
}

export function getLLMManager(): LLMManager {
  if (!llmManager) {
    llmManager = new LLMManager(singletonOptions);
  }
  return llmManager;
}

export function resetLLMManager(): void {
  llmManager = null;
}
