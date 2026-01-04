import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { getCurrentUserId } from "./auth";
import { getLLMManager } from "./llm";

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

// Helper to get user ID from request (uses auth when available)
function getUserIdFromRequest(req: Request): number {
  const authUserId = getCurrentUserId(req);
  if (authUserId !== null) {
    return authUserId;
  }
  const bodyUserId = (req.body as { userId?: number })?.userId;
  return bodyUserId ?? 1;
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

  // Orchestration API routes
  app.post('/api/orchestration/next-step', async (req, res) => {
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
        console.error('Error parsing LLM response:', parseError);
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
      console.error('Error in next-step endpoint:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      });
    }
  });

  app.post('/api/orchestration/engagement', async (req, res) => {
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
        console.error('Error parsing LLM response:', parseError);
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
      console.error('Error in engagement endpoint:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      });
    }
  });

  // Learning analytics endpoints
  app.get('/api/analytics/attention', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('attention');
      // Filter by user if authenticated
      const userEvents = userId ? events.filter(e => e.userId === userId) : events;
      res.json(userEvents);
    } catch (error) {
      console.error('Error fetching attention analytics:', error);
      res.status(500).json({ error: 'Failed to fetch attention data' });
    }
  });

  app.get('/api/analytics/mastery', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('mastery');
      const userEvents = userId ? events.filter(e => e.userId === userId) : events;
      res.json(userEvents);
    } catch (error) {
      console.error('Error fetching mastery analytics:', error);
      res.status(500).json({ error: 'Failed to fetch mastery data' });
    }
  });

  // Get all analytics for a user
  app.get('/api/analytics/summary', async (req, res) => {
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
      console.error('Error fetching analytics summary:', error);
      res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
  });

  app.post('/api/learning/events', async (req, res) => {
    try {
      const eventSchema = z.object({
        userId: z.number().optional(),
        type: z.string(),
        data: learningEventDataSchema,
        timestamp: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined)
      });

      const validatedData = eventSchema.parse(req.body);
      const userId = validatedData.userId ?? getUserIdFromRequest(req);

      const event = await storage.createLearningEvent({
        userId,
        type: validatedData.type,
        data: validatedData.data,
        timestamp: validatedData.timestamp || new Date()
      });
      res.json(event);
    } catch (error) {
      console.error('Error creating learning event:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
