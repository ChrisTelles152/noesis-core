import OpenAI from 'openai';
import type { LLMProvider, LLMCompletionOptions, LLMCompletionResult } from '../types';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI | null = null;
  private model: string;
  private apiKey: string | undefined;

  constructor(apiKey?: string, model: string = 'gpt-4o') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    this.model = model;

    if (this.apiKey) {
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    if (!this.client) {
      throw new Error('OpenAI client not configured. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: options.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      });

      const choice = response.choices[0];
      const content = choice?.message?.content || '';

      return {
        content,
        finishReason: choice?.finish_reason === 'stop' ? 'stop' :
                      choice?.finish_reason === 'length' ? 'length' : 'error',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        provider: this.name,
        model: this.model,
      };
    } catch (error) {
      console.error('[OpenAI] Completion error:', error);
      throw error;
    }
  }
}
