/**
 * LLM Manager Tests
 *
 * Tests for the LLMManager provider selection and fallback chain
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('LLMManager', () => {
  const originalEnv = process.env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with fallback when no API keys present', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      expect(manager.getActiveProvider()).toBe('fallback');
      expect(manager.hasLLMProvider()).toBe(false);
    });

    // Note: Tests that instantiate OpenAI with an API key are skipped because
    // the OpenAI SDK throws an error in browser-like environments (vitest)
    it.skip('should detect OpenAI as preferred when API key is set (requires Node.js environment)', async () => {
      // This would work in a real Node.js environment but not in vitest
    });

    it('should detect Anthropic when only Anthropic key is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      delete process.env.OPENAI_API_KEY;
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      expect(manager.getActiveProvider()).toBe('anthropic');
    });

    it('should use specified preferred provider', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager({ preferredProvider: 'anthropic' });

      expect(manager.getActiveProvider()).toBe('anthropic');
    });

    it('should use custom logger when provided', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();

      const customLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const manager = new LLMManager({ logger: customLogger });

      // Logger should have been called during initialization
      expect(customLogger.info).toHaveBeenCalled();
      expect(manager.getActiveProvider()).toBe('fallback');
    });

    it('should log provider status on initialization', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      new LLMManager();

      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' '));
      expect(logCalls.some((c: string) => c.includes('[LLM]'))).toBe(true);
    });
  });

  describe('getConfiguredProviders', () => {
    it('should return list of configured providers', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      const configured = manager.getConfiguredProviders();
      expect(Array.isArray(configured)).toBe(true);
      expect(configured).toContain('fallback');
    });

    it.skip('should include openai when configured (requires Node.js environment)', async () => {
      // The OpenAI SDK throws an error in browser-like environments (vitest)
    });
  });

  describe('hasLLMProvider', () => {
    it('should return false when only fallback is available', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      expect(manager.hasLLMProvider()).toBe(false);
    });

    it.skip('should return true when real provider is preferred (requires Node.js environment)', async () => {
      // The OpenAI SDK throws an error in browser-like environments (vitest)
    });
  });

  describe('complete', () => {
    it('should use fallback when no provider is configured', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      const result = await manager.complete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.provider).toBe('fallback');
    });

    it('should always fall back to fallback provider', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      // Even with no configured provider, fallback should work
      const result = await manager.complete({
        messages: [{ role: 'user', content: 'What is next?' }],
      });

      expect(result.provider).toBe('fallback');
      expect(result.content).toBeDefined();
    });
  });

  describe('getRecommendation', () => {
    it('should format recommendation request correctly', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      const result = await manager.getRecommendation({
        attentionScore: 0.7,
        masteryData: [{ id: 'skill-1', name: 'Algebra', progress: 0.5, status: 'in-progress' }],
        learningContext: 'mathematics',
      });

      expect(result).toBeDefined();
      expect(result.provider).toBe('fallback');
    });

    it('should handle missing learning context', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      const result = await manager.getRecommendation({
        attentionScore: 0.5,
        masteryData: [],
      });

      expect(result).toBeDefined();
    });
  });

  describe('getEngagementSuggestion', () => {
    it('should format engagement request correctly', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      const result = await manager.getEngagementSuggestion({
        attentionScore: 0.3,
        learningContext: 'reading',
        previousInterventions: ['break-suggested', 'modality-change'],
      });

      expect(result).toBeDefined();
      expect(result.provider).toBe('fallback');
    });

    it('should handle missing optional parameters', async () => {
      const { LLMManager, resetLLMManager } = await import('../manager');
      resetLLMManager();
      const manager = new LLMManager();

      const result = await manager.getEngagementSuggestion({
        attentionScore: 0.2,
      });

      expect(result).toBeDefined();
    });
  });

  describe('singleton', () => {
    it('should return same instance from getLLMManager', async () => {
      const { getLLMManager, resetLLMManager } = await import('../manager');

      resetLLMManager();
      const manager1 = getLLMManager();
      const manager2 = getLLMManager();

      expect(manager1).toBe(manager2);
    });

    it('should create new instance after reset', async () => {
      const { getLLMManager, resetLLMManager } = await import('../manager');

      resetLLMManager();
      const manager1 = getLLMManager();
      resetLLMManager();
      const manager2 = getLLMManager();

      expect(manager1).not.toBe(manager2);
    });

    it('should use configured options with configureLLMManager', async () => {
      const { getLLMManager, resetLLMManager, configureLLMManager } = await import('../manager');

      const customLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      resetLLMManager();
      configureLLMManager({ logger: customLogger });
      const manager = getLLMManager();

      // Custom logger should have been used
      expect(customLogger.info).toHaveBeenCalled();
      expect(manager.getActiveProvider()).toBe('fallback');
    });
  });
});
