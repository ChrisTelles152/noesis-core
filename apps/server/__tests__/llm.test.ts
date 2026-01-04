/**
 * LLM Provider Tests
 * Testing the fallback provider and provider abstraction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackProvider } from '../llm/providers/fallback';

describe('LLM Provider System', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Fallback Provider', () => {
    it('should always be configured', () => {
      const provider = new FallbackProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it('should have correct name', () => {
      const provider = new FallbackProvider();
      expect(provider.name).toBe('fallback');
    });

    it('should return recommendation response', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [
          { role: 'system', content: 'You are a learning assistant' },
          { role: 'user', content: 'Give me a recommendation for my next step' },
        ],
      });

      expect(result).toBeDefined();
      expect(result.provider).toBe('fallback');
      expect(result.content).toBeTruthy();

      // Parse the JSON response
      const parsed = JSON.parse(result.content);
      expect(parsed.suggestion).toBeTruthy();
    });

    it('should return engagement response for attention-related queries', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [
          { role: 'system', content: 'You are a learning assistant' },
          { role: 'user', content: 'My attention is dropping, help with engagement' },
        ],
      });

      expect(result).toBeDefined();
      expect(result.provider).toBe('fallback');

      const parsed = JSON.parse(result.content);
      expect(parsed.message).toBeTruthy();
      expect(parsed.type).toBe('attention-prompt');
    });

    it('should return default response for unknown queries', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [
          { role: 'user', content: 'Hello world' },
        ],
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result.content);
      expect(parsed.suggestion).toBeTruthy();
    });

    it('should include model info in response', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.model).toBe('template-v1');
      expect(result.provider).toBe('fallback');
      expect(result.finishReason).toBe('stop');
    });

    it('should include usage stats', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.usage).toBeDefined();
      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
    });

    it('should handle empty messages array', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [],
      });

      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
    });

    it('should return valid JSON for all responses', async () => {
      const provider = new FallbackProvider();

      // Test multiple queries
      const queries = [
        'recommendation',
        'attention',
        'engagement',
        'random query',
        '',
      ];

      for (const query of queries) {
        const result = await provider.complete({
          messages: [{ role: 'user', content: query }],
        });

        expect(() => JSON.parse(result.content)).not.toThrow();
      }
    });

    it('should handle special characters in messages', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [
          { role: 'user', content: 'What about <script>alert("xss")</script>?' },
        ],
      });

      expect(result).toBeDefined();
      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should process multiple messages correctly', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'Give me a recommendation' },
        ],
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result.content);
      expect(parsed.suggestion).toBeTruthy();
    });
  });

  describe('Provider Response Structure', () => {
    it('should return complete response structure', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      // Check all required fields
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('finishReason');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('model');

      // Check types
      expect(typeof result.content).toBe('string');
      expect(typeof result.finishReason).toBe('string');
      expect(typeof result.provider).toBe('string');
      expect(typeof result.model).toBe('string');
      expect(typeof result.usage).toBe('object');
    });

    it('should have proper usage object structure', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.usage).toHaveProperty('promptTokens');
      expect(result.usage).toHaveProperty('completionTokens');
      expect(result.usage).toHaveProperty('totalTokens');

      expect(typeof result.usage.promptTokens).toBe('number');
      expect(typeof result.usage.completionTokens).toBe('number');
      expect(typeof result.usage.totalTokens).toBe('number');
    });
  });

  describe('Response Content Types', () => {
    it('should return suggestion-type content for recommendation queries', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'What is the next recommendation?' }],
      });

      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveProperty('suggestion');
      expect(parsed).toHaveProperty('explanation');
      expect(parsed).toHaveProperty('resourceLinks');
    });

    it('should return message-type content for engagement queries', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Help with engagement and attention' }],
      });

      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('type');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', async () => {
      const provider = new FallbackProvider();
      const longMessage = 'a'.repeat(10000);
      const result = await provider.complete({
        messages: [{ role: 'user', content: longMessage }],
      });

      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
    });

    it('should handle unicode characters', async () => {
      const provider = new FallbackProvider();
      const result = await provider.complete({
        messages: [{ role: 'user', content: '你好 世界 recommendation' }],
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result.content);
      expect(parsed.suggestion).toBeTruthy();
    });

    it('should be consistent with provider name', async () => {
      const provider = new FallbackProvider();

      // Multiple calls should return same provider name
      for (let i = 0; i < 5; i++) {
        const result = await provider.complete({
          messages: [{ role: 'user', content: 'test' }],
        });
        expect(result.provider).toBe('fallback');
      }
    });
  });
});
