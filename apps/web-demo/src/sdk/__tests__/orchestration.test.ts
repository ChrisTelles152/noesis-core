import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Orchestrator } from '../orchestration';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize without API key', () => {
      orchestrator = new Orchestrator(undefined, false);
      expect(orchestrator).toBeDefined();
    });

    it('should initialize with API key', () => {
      orchestrator = new Orchestrator('test-api-key', false);
      expect(orchestrator).toBeDefined();
    });
  });

  describe('getNextStep', () => {
    it('should return local recommendation when no API key', async () => {
      orchestrator = new Orchestrator(undefined, false);

      const result = await orchestrator.getNextStep({
        learnerState: {
          attention: {
            score: 0.5,
            focusStability: 0.5,
            cognitiveLoad: 0.5,
            gazePoint: { x: 0, y: 0 },
            timestamp: Date.now(),
            status: 'tracking',
          },
          timestamp: Date.now(),
        },
        context: 'learning math',
      });

      expect(result.type).toBe('local-fallback');
      expect(result.suggestion).toBeDefined();
      expect(result.explanation).toBeDefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should suggest interactive approach for low attention', async () => {
      orchestrator = new Orchestrator(undefined, false);

      const result = await orchestrator.getNextStep({
        learnerState: {
          attention: {
            score: 0.2, // Low attention
            focusStability: 0.5,
            cognitiveLoad: 0.5,
            gazePoint: { x: 0, y: 0 },
            timestamp: Date.now(),
            status: 'tracking',
          },
          timestamp: Date.now(),
        },
      });

      expect(result.suggestion).toContain('interactive');
      expect(result.type).toBe('local-fallback');
    });

    it('should suggest scaffolding when context mentions struggling', async () => {
      orchestrator = new Orchestrator(undefined, false);

      const result = await orchestrator.getNextStep({
        learnerState: {
          timestamp: Date.now(),
        },
        context: 'The learner is struggling with algebra',
      });

      expect(result.suggestion).toContain('break this down');
      expect(result.explanation).toContain('struggling');
    });

    it('should suggest review when objectives are due', async () => {
      orchestrator = new Orchestrator(undefined, false);

      const result = await orchestrator.getNextStep({
        learnerState: {
          mastery: [
            {
              id: 'obj1',
              name: 'Test Objective',
              progress: 0.5,
              attempts: 3,
              lastReviewed: Date.now() - 86400000,
              nextReviewDue: Date.now() - 3600000, // Due an hour ago
              isReviewDue: true,
              status: 'in-progress',
            },
          ],
          timestamp: Date.now(),
        },
      });

      expect(result.suggestion).toContain('review');
    });

    it('should call API when API key is provided', async () => {
      orchestrator = new Orchestrator('test-api-key', false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          suggestion: 'API suggestion',
          explanation: 'API explanation',
          resourceLinks: ['https://example.com'],
        }),
      });

      const result = await orchestrator.getNextStep({
        learnerState: { timestamp: Date.now() },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orchestration/next-step',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
      expect(result.suggestion).toBe('API suggestion');
    });

    it('should fall back to local on API error', async () => {
      orchestrator = new Orchestrator('test-api-key', false);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await orchestrator.getNextStep({
        learnerState: { timestamp: Date.now() },
      });

      expect(result.type).toBe('local-fallback');
      expect(result.suggestion).toBeDefined();
    });

    it('should fall back to local on non-ok response', async () => {
      orchestrator = new Orchestrator('test-api-key', false);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await orchestrator.getNextStep({
        learnerState: { timestamp: Date.now() },
      });

      expect(result.type).toBe('local-fallback');
    });
  });

  describe('suggestEngagement', () => {
    it('should return local suggestion when no API key', async () => {
      orchestrator = new Orchestrator(undefined, false);

      const result = await orchestrator.suggestEngagement();

      expect(result.source).toBe('local-fallback');
      expect(result.message).toBeDefined();
      expect(result.type).toBe('attention-prompt');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return one of the predefined suggestions', async () => {
      orchestrator = new Orchestrator(undefined, false);

      const expectedSuggestions = [
        'Would you like to take a quick 30-second break to refresh?',
        "Let's try a different approach to this concept. How about a visual example?",
        'Would it help to see a real-world application of this concept?',
        "Let's make this more interactive. Can you try solving a simple version of this problem?",
        'Sometimes a change of pace helps. Would you like to switch to a related topic and come back to this later?',
      ];

      const result = await orchestrator.suggestEngagement();

      expect(expectedSuggestions).toContain(result.message);
    });

    it('should call API when API key is provided', async () => {
      orchestrator = new Orchestrator('test-api-key', false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Take a deep breath',
          type: 'micro-break',
        }),
      });

      const result = await orchestrator.suggestEngagement({
        attentionScore: 0.2,
        context: 'reading',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orchestration/engagement',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.message).toBe('Take a deep breath');
      expect(result.type).toBe('micro-break');
    });

    it('should fall back on API error', async () => {
      orchestrator = new Orchestrator('test-api-key', false);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await orchestrator.suggestEngagement();

      expect(result.source).toBe('local-fallback');
    });
  });
});
