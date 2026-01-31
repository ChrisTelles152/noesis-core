/**
 * Orchestrator Tests
 *
 * Tests for the client-side orchestration API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../orchestration';
import type { OrchestratorRequest, EngagementRequest } from '../orchestration-types';

describe('Orchestrator', () => {
  const mockFetch = vi.fn();
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    global.fetch = mockFetch;
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleSpy.mockRestore();
  });

  describe('initialization', () => {
    it('should initialize with API key', () => {
      const orchestrator = new Orchestrator('test-api-key');
      expect(orchestrator).toBeDefined();
    });

    it('should initialize without API key', () => {
      const orchestrator = new Orchestrator(undefined);
      expect(orchestrator).toBeDefined();
    });

    it('should log when debug mode is enabled', () => {
      new Orchestrator('test-key', true);

      expect(consoleSpy).toHaveBeenCalledWith('[Orchestrator] Orchestrator initialized');
    });

    it('should not log when debug mode is disabled', () => {
      new Orchestrator('test-key', false);

      const orchestratorLogs = consoleSpy.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('[Orchestrator]')
      );
      expect(orchestratorLogs.length).toBe(0);
    });
  });

  describe('getNextStep', () => {
    it('should call API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            suggestion: 'Continue with algebra',
            explanation: 'Based on your progress',
            resourceLinks: ['https://example.com'],
          }),
      });

      const orchestrator = new Orchestrator('test-key');

      const request: OrchestratorRequest = {
        learnerState: {
          attention: {
            score: 0.8,
            focusStability: 0.9,
            cognitiveLoad: 0.5,
            timestamp: Date.now(),
            status: 'tracking',
          },
          mastery: [
            {
              id: 'algebra',
              name: 'Algebra',
              progress: 0.7,
              attempts: 10,
              lastReviewed: Date.now() - 86400000,
              nextReviewDue: Date.now() + 86400000,
              isReviewDue: false,
              status: 'in-progress',
            },
          ],
          timestamp: Date.now(),
        },
        context: 'learning math',
      };

      const result = await orchestrator.getNextStep(request);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orchestration/next-step',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
        })
      );

      expect(result.suggestion).toBe('Continue with algebra');
    });

    it('should use local recommendation when no API key', async () => {
      const orchestrator = new Orchestrator(undefined);

      const request: OrchestratorRequest = {
        learnerState: {
          timestamp: Date.now(),
        },
      };

      const result = await orchestrator.getNextStep(request);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.type).toBe('local-fallback');
      expect(result.suggestion).toBeDefined();
    });

    it('should fallback to local on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const orchestrator = new Orchestrator('test-key', true);

      const request: OrchestratorRequest = {
        learnerState: { timestamp: Date.now() },
      };

      const result = await orchestrator.getNextStep(request);

      expect(result.type).toBe('local-fallback');
    });

    it('should fallback to local on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const orchestrator = new Orchestrator('test-key', true);

      const request: OrchestratorRequest = {
        learnerState: { timestamp: Date.now() },
      };

      const result = await orchestrator.getNextStep(request);

      expect(result.type).toBe('local-fallback');
    });

    it('should suggest interactive approach for low attention', async () => {
      const orchestrator = new Orchestrator(undefined);

      const request: OrchestratorRequest = {
        learnerState: {
          attention: {
            score: 0.2,
            focusStability: 0.3,
            cognitiveLoad: 0.8,
            timestamp: Date.now(),
            status: 'tracking',
          },
          timestamp: Date.now(),
        },
      };

      const result = await orchestrator.getNextStep(request);

      expect(result.suggestion).toContain('interactive');
      expect(result.explanation).toContain('Low attention');
    });

    it('should suggest scaffold approach when struggling', async () => {
      const orchestrator = new Orchestrator(undefined);

      const request: OrchestratorRequest = {
        learnerState: {
          attention: {
            score: 0.6,
            focusStability: 0.7,
            cognitiveLoad: 0.5,
            timestamp: Date.now(),
            status: 'tracking',
          },
          timestamp: Date.now(),
        },
        context: 'The learner is struggling with this concept',
      };

      const result = await orchestrator.getNextStep(request);

      expect(result.suggestion).toContain('break this down');
      expect(result.explanation).toContain('struggling');
    });

    it('should suggest review when mastery item is due', async () => {
      const orchestrator = new Orchestrator(undefined);

      const request: OrchestratorRequest = {
        learnerState: {
          attention: {
            score: 0.7,
            focusStability: 0.8,
            cognitiveLoad: 0.4,
            timestamp: Date.now(),
            status: 'tracking',
          },
          mastery: [
            {
              id: 'algebra',
              name: 'Algebra',
              progress: 0.8,
              attempts: 15,
              lastReviewed: Date.now() - 604800000,
              nextReviewDue: Date.now() - 86400000,
              isReviewDue: true,
              status: 'in-progress',
            },
          ],
          timestamp: Date.now(),
        },
      };

      const result = await orchestrator.getNextStep(request);

      expect(result.suggestion).toContain('review');
      expect(result.explanation).toContain('Spaced repetition');
    });

    it('should suggest advancement for good progress', async () => {
      const orchestrator = new Orchestrator(undefined);

      const request: OrchestratorRequest = {
        learnerState: {
          attention: {
            score: 0.9,
            focusStability: 0.85,
            cognitiveLoad: 0.3,
            timestamp: Date.now(),
            status: 'tracking',
          },
          mastery: [
            {
              id: 'algebra',
              name: 'Algebra',
              progress: 0.9,
              attempts: 20,
              lastReviewed: Date.now() - 3600000,
              nextReviewDue: Date.now() + 86400000,
              isReviewDue: false,
              status: 'in-progress',
            },
          ],
          timestamp: Date.now(),
        },
      };

      const result = await orchestrator.getNextStep(request);

      expect(result.suggestion).toContain('move on');
      expect(result.explanation).toContain('Good progress');
    });
  });

  describe('suggestEngagement', () => {
    it('should call API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Take a short break',
            type: 'micro-break',
          }),
      });

      const orchestrator = new Orchestrator('test-key');

      const request: EngagementRequest = {
        attentionScore: 0.3,
        context: 'reading comprehension',
        previousInterventions: ['attention-prompt'],
      };

      const result = await orchestrator.suggestEngagement(request);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orchestration/engagement',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
        })
      );

      expect(result.message).toBe('Take a short break');
      expect(result.type).toBe('micro-break');
    });

    it('should use local suggestion when no API key', async () => {
      const orchestrator = new Orchestrator(undefined);

      const result = await orchestrator.suggestEngagement({});

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.source).toBe('local-fallback');
      expect(result.type).toBe('attention-prompt');
      expect(result.message).toBeDefined();
    });

    it('should fallback to local on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const orchestrator = new Orchestrator('test-key', true);

      const result = await orchestrator.suggestEngagement({});

      expect(result.source).toBe('local-fallback');
    });

    it('should fallback to local on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const orchestrator = new Orchestrator('test-key', true);

      const result = await orchestrator.suggestEngagement({});

      expect(result.source).toBe('local-fallback');
    });

    it('should handle empty request', async () => {
      const orchestrator = new Orchestrator(undefined);

      const result = await orchestrator.suggestEngagement();

      expect(result.source).toBe('local-fallback');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug logging', () => {
    it('should log API request when debug enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ suggestion: 'test' }),
      });

      const orchestrator = new Orchestrator('test-key', true);

      await orchestrator.getNextStep({
        learnerState: { timestamp: Date.now() },
      });

      const logCalls = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' '));
      expect(logCalls.some((c: string) => c.includes('Getting next step'))).toBe(true);
    });

    it('should log API response when debug enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ suggestion: 'test response' }),
      });

      const orchestrator = new Orchestrator('test-key', true);

      await orchestrator.getNextStep({
        learnerState: { timestamp: Date.now() },
      });

      const logCalls = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' '));
      expect(logCalls.some((c: string) => c.includes('Received recommendation'))).toBe(true);
    });

    it('should log errors when debug enabled', async () => {
      mockFetch.mockRejectedValue(new Error('Test error'));

      const orchestrator = new Orchestrator('test-key', true);

      await orchestrator.getNextStep({
        learnerState: { timestamp: Date.now() },
      });

      const logCalls = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' '));
      expect(logCalls.some((c: string) => c.includes('Error getting next step'))).toBe(true);
    });

    it('should not log when debug disabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ suggestion: 'test' }),
      });

      const orchestrator = new Orchestrator('test-key', false);

      await orchestrator.getNextStep({
        learnerState: { timestamp: Date.now() },
      });

      const orchestratorLogs = consoleSpy.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('[Orchestrator]')
      );
      expect(orchestratorLogs.length).toBe(0);
    });
  });
});
