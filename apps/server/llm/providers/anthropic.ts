import type { LLMProvider, LLMCompletionOptions, LLMCompletionResult } from '../types';
import { logger } from '../../logger';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private apiKey: string | undefined;
  private model: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(apiKey?: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = model;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.');
    }

    try {
      // Extract system message and convert to Anthropic format
      const systemMessage = options.messages.find(m => m.role === 'system');
      const otherMessages: AnthropicMessage[] = options.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens ?? 1024,
          system: systemMessage?.content,
          messages: otherMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data: AnthropicResponse = await response.json();
      const content = data.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');

      return {
        content,
        finishReason: data.stop_reason === 'end_turn' ? 'stop' :
                      data.stop_reason === 'max_tokens' ? 'length' : 'stop',
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        provider: this.name,
        model: this.model,
      };
    } catch (error) {
      logger.error("Anthropic completion error", { module: "llm", provider: "anthropic" }, error instanceof Error ? error : undefined);
      throw error;
    }
  }
}
