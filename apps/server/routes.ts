import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { getCurrentUserId, requireAuth } from "./auth";
import { getLLMManager } from "./llm";
import { createError, ErrorCodes } from "./errors";
import { logger } from "./logger";

// Response validation schemas for LLM responses
const orchestrationResponseSchema = z.object({
  suggestion: z.string(),
  explanation: z.string().optional(),
  resourceLinks: z.array(z.string()).optional().default([]),
});

const engagementResponseSchema = z.object({
  message: z.string(),
  type: z.string(),
});

// Learning event data schema with specific allowed fields
const learningEventDataSchema = z.object({
  context: z.string().optional(),
  attentionScore: z.number().optional(),
  recommendation: z.string().optional(),
  intervention: z.string().optional(),
  objectiveId: z.string().optional(),
  progress: z.number().optional(),
  result: z.number().optional(),
}).catchall(z.union([z.string(), z.number(), z.boolean()]).optional());

/**
 * Get authenticated user ID from request.
 *
 * SECURITY: For protected endpoints, always use requireAuth middleware first.
 * This function returns the authenticated user ID or throws if not authenticated.
 * For unprotected endpoints that optionally track users, use getUserIdFromRequestOptional.
 */
function getUserIdFromRequest(req: Request): number {
  const authUserId = getCurrentUserId(req);
  if (authUserId !== null) {
    return authUserId;
  }
  // SECURITY: Do not fall back to a default user ID or accept userId from request body
  // This was previously falling back to user 1, which is a security vulnerability
  // If you reach here without authentication, the route should have requireAuth middleware
  throw new Error('Authentication required - no user ID available');
}

/**
 * Optionally get user ID from request for unprotected endpoints.
 * Returns null if not authenticated (does not throw).
 */
function getUserIdFromRequestOptional(req: Request): number | null {
  return getCurrentUserId(req);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize LLM Manager (handles multi-provider support)
  const llm = getLLMManager();

  // LLM status endpoint
  app.get('/api/llm/status', (req, res) => {
    res.json({
      activeProvider: llm.getActiveProvider(),
      configuredProviders: llm.getConfiguredProviders(),
      hasLLMProvider: llm.hasLLMProvider(),
    });
  });

  // Orchestration API routes - require authentication to personalize and track
  app.post('/api/orchestration/next-step', requireAuth, async (req, res) => {
    try {
      const requestSchema = z.object({
        learnerState: z.object({
          attention: z.object({
            score: z.number().min(0).max(1).optional(),
            focusStability: z.number().min(0).max(1).optional(),
            cognitiveLoad: z.number().min(0).max(1).optional(),
            status: z.string().optional()
          }).optional(),
          mastery: z.array(z.object({
            id: z.string(),
            name: z.string(),
            progress: z.number().min(0).max(1),
            status: z.string()
          })).optional(),
          timestamp: z.number()
        }),
        context: z.string().optional(),
        options: z.object({
          detail: z.enum(['low', 'medium', 'high']).optional(),
          format: z.enum(['text', 'json']).optional()
        }).optional()
      });

      const validatedData = requestSchema.parse(req.body);

      const attentionScore = validatedData.learnerState.attention?.score || 0.5;
      const masteryData = validatedData.learnerState.mastery || [];
      const context = validatedData.context || 'general learning';

      // Use LLM Manager for recommendation
      const llmResult = await llm.getRecommendation({
        attentionScore,
        masteryData,
        learningContext: context,
      });

      // Parse and validate the response
      let response;
      try {
        const parsedResult = JSON.parse(llmResult.content);
        const validatedResult = orchestrationResponseSchema.parse(parsedResult);

        response = {
          suggestion: validatedResult.suggestion,
          explanation: validatedResult.explanation,
          resourceLinks: validatedResult.resourceLinks,
          type: llmResult.provider === 'fallback' ? 'fallback' : 'llm-generated',
          provider: llmResult.provider,
          model: llmResult.model,
        };
      } catch (parseError) {
        logger.error("Error parsing LLM response", { module: "routes", endpoint: "next-step" }, parseError instanceof Error ? parseError : undefined);
        response = {
          suggestion: "Based on your progress, I recommend continuing with the current concept.",
          explanation: "This recommendation is based on your current attention and mastery levels.",
          resourceLinks: [],
          type: 'fallback',
          provider: 'fallback',
          model: 'error-recovery',
        };
      }

      // Store the recommendation in learning history
      const userId = getUserIdFromRequest(req);
      await storage.createLearningEvent({
        userId,
        type: 'recommendation',
        data: {
          context,
          attentionScore,
          recommendation: response.suggestion,
          provider: response.provider,
        },
        timestamp: new Date()
      });

      res.json(response);
    } catch (error) {
      logger.error("Error in next-step endpoint", { module: "routes" }, error instanceof Error ? error : undefined);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      });
    }
  });

  app.post('/api/orchestration/engagement', requireAuth, async (req, res) => {
    try {
      const requestSchema = z.object({
        attentionScore: z.number().min(0).max(1).optional(),
        context: z.string().optional(),
        previousInterventions: z.array(z.string()).optional()
      });

      const validatedData = requestSchema.parse(req.body);

      const attentionScore = validatedData.attentionScore || 0.3;
      const context = validatedData.context || 'general learning';
      const previousInterventions = validatedData.previousInterventions || [];

      // Use LLM Manager for engagement suggestion
      const llmResult = await llm.getEngagementSuggestion({
        attentionScore,
        learningContext: context,
        previousInterventions,
      });

      // Parse and validate the response
      let response;
      try {
        const parsedResult = JSON.parse(llmResult.content);
        const validatedResult = engagementResponseSchema.parse(parsedResult);

        response = {
          message: validatedResult.message,
          type: validatedResult.type,
          source: llmResult.provider === 'fallback' ? 'fallback' : 'llm-generated',
          provider: llmResult.provider,
          model: llmResult.model,
        };
      } catch (parseError) {
        logger.error("Error parsing LLM response", { module: "routes", endpoint: "engagement" }, parseError instanceof Error ? parseError : undefined);
        response = {
          message: "Would you like to take a quick break to refresh your focus?",
          type: 'attention-prompt',
          source: 'fallback',
          provider: 'fallback',
          model: 'error-recovery',
        };
      }

      // Store the engagement intervention in learning history
      const userId = getUserIdFromRequest(req);
      await storage.createLearningEvent({
        userId,
        type: 'engagement',
        data: {
          context,
          attentionScore,
          intervention: response.message,
          provider: response.provider,
        },
        timestamp: new Date()
      });

      res.json(response);
    } catch (error) {
      logger.error("Error in engagement endpoint", { module: "routes" }, error instanceof Error ? error : undefined);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      });
    }
  });

  // Learning analytics endpoints - require authentication to protect user data
  app.get('/api/analytics/attention', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('attention');
      // Filter to only show authenticated user's data
      const userEvents = events.filter(e => e.userId === userId);
      res.json(userEvents);
    } catch (error) {
      logger.error("Error fetching attention analytics", { module: "routes" }, error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to fetch attention data' });
    }
  });

  app.get('/api/analytics/mastery', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('mastery');
      // Filter to only show authenticated user's data
      const userEvents = events.filter(e => e.userId === userId);
      res.json(userEvents);
    } catch (error) {
      logger.error("Error fetching mastery analytics", { module: "routes" }, error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to fetch mastery data' });
    }
  });

  // Get all analytics for a user - requires authentication
  app.get('/api/analytics/summary', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const allEvents = await storage.getLearningEventsByUserId(userId);

      // Compute summary statistics
      const attentionEvents = allEvents.filter(e => e.type === 'attention');
      const masteryEvents = allEvents.filter(e => e.type === 'mastery');
      const recommendationEvents = allEvents.filter(e => e.type === 'recommendation');
      const engagementEvents = allEvents.filter(e => e.type === 'engagement');

      // Calculate averages
      const avgAttention = attentionEvents.length > 0
        ? attentionEvents.reduce((sum, e) => sum + ((e.data as { attentionScore?: number }).attentionScore || 0), 0) / attentionEvents.length
        : 0;

      res.json({
        userId,
        totalEvents: allEvents.length,
        eventCounts: {
          attention: attentionEvents.length,
          mastery: masteryEvents.length,
          recommendations: recommendationEvents.length,
          engagements: engagementEvents.length,
        },
        averageAttention: Math.round(avgAttention * 100) / 100,
        recentEvents: allEvents.slice(-10).reverse(),
        llmProvider: llm.getActiveProvider(),
      });
    } catch (error) {
      logger.error("Error fetching analytics summary", { module: "routes" }, error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
  });

  // Learning events endpoint - requires authentication to associate with user
  app.post('/api/learning/events', requireAuth, async (req, res) => {
    try {
      const eventSchema = z.object({
        type: z.string(),
        data: learningEventDataSchema,
        timestamp: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined)
      });

      const validatedData = eventSchema.parse(req.body);
      // SECURITY: Always use authenticated user ID, never accept from request body
      const userId = getUserIdFromRequest(req);

      const event = await storage.createLearningEvent({
        userId,
        type: validatedData.type,
        data: validatedData.data,
        timestamp: validatedData.timestamp || new Date()
      });
      res.json(event);
    } catch (error) {
      logger.error("Error creating learning event", { module: "routes" }, error instanceof Error ? error : undefined);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
