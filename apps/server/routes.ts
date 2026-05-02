import type { Express, Request } from 'express';
import { createServer, type Server } from 'http';
import { storage } from './storage';
import { z } from 'zod';
import { getCurrentUserId, requireAuth } from './auth';
import { getLLMManager, configureLLMManager, type LLMLogger } from '@noesis/adapters-llm';
import { createError as _createError, ErrorCodes as _ErrorCodes } from './errors';
import { logger } from './logger';
import { coreEventToLearningEvent, extractCoreEvents, validateNoesisEvent } from './event-bridge';
import { createSkillGraph } from '@noesis-edu/core';

// Configure the LLM Manager with the server's structured logger
const llmLogger: LLMLogger = {
  info: (message, meta) => logger.info(message, { module: 'llm', ...meta }),
  warn: (message, meta) => logger.warn(message, { module: 'llm', ...meta }),
  error: (message, meta, error) => logger.error(message, { module: 'llm', ...meta }, error),
};
configureLLMManager({ logger: llmLogger });

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
const learningEventDataSchema = z
  .object({
    context: z.string().optional(),
    attentionScore: z.number().optional(),
    recommendation: z.string().optional(),
    intervention: z.string().optional(),
    objectiveId: z.string().optional(),
    progress: z.number().optional(),
    result: z.number().optional(),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean()]).optional());

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
function _getUserIdFromRequestOptional(req: Request): number | null {
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
          attention: z
            .object({
              score: z.number().min(0).max(1).optional(),
              focusStability: z.number().min(0).max(1).optional(),
              cognitiveLoad: z.number().min(0).max(1).optional(),
              status: z.string().optional(),
            })
            .optional(),
          mastery: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                progress: z.number().min(0).max(1),
                status: z.string(),
              })
            )
            .optional(),
          timestamp: z.number(),
        }),
        context: z.string().optional(),
        options: z
          .object({
            detail: z.enum(['low', 'medium', 'high']).optional(),
            format: z.enum(['text', 'json']).optional(),
          })
          .optional(),
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
        logger.error(
          'Error parsing LLM response',
          { module: 'routes', endpoint: 'next-step' },
          parseError instanceof Error ? parseError : undefined
        );
        response = {
          suggestion: 'Based on your progress, I recommend continuing with the current concept.',
          explanation: 'This recommendation is based on your current attention and mastery levels.',
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
        timestamp: new Date(),
      });

      res.json(response);
    } catch (error) {
      logger.error(
        'Error in next-step endpoint',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  app.post('/api/orchestration/engagement', requireAuth, async (req, res) => {
    try {
      const requestSchema = z.object({
        attentionScore: z.number().min(0).max(1).optional(),
        context: z.string().optional(),
        previousInterventions: z.array(z.string()).optional(),
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
        logger.error(
          'Error parsing LLM response',
          { module: 'routes', endpoint: 'engagement' },
          parseError instanceof Error ? parseError : undefined
        );
        response = {
          message: 'Would you like to take a quick break to refresh your focus?',
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
        timestamp: new Date(),
      });

      res.json(response);
    } catch (error) {
      logger.error(
        'Error in engagement endpoint',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  // Learning analytics endpoints - require authentication to protect user data
  app.get('/api/analytics/attention', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('attention');
      // Filter to only show authenticated user's data
      const userEvents = events.filter((e) => e.userId === userId);
      res.json(userEvents);
    } catch (error) {
      logger.error(
        'Error fetching attention analytics',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to fetch attention data' });
    }
  });

  app.get('/api/analytics/mastery', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('mastery');
      // Filter to only show authenticated user's data
      const userEvents = events.filter((e) => e.userId === userId);
      res.json(userEvents);
    } catch (error) {
      logger.error(
        'Error fetching mastery analytics',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to fetch mastery data' });
    }
  });

  // Get all analytics for a user - requires authentication
  app.get('/api/analytics/summary', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const allEvents = await storage.getLearningEventsByUserId(userId);

      // Compute summary statistics
      const attentionEvents = allEvents.filter((e) => e.type === 'attention');
      const masteryEvents = allEvents.filter((e) => e.type === 'mastery');
      const recommendationEvents = allEvents.filter((e) => e.type === 'recommendation');
      const engagementEvents = allEvents.filter((e) => e.type === 'engagement');

      // Calculate averages
      const avgAttention =
        attentionEvents.length > 0
          ? attentionEvents.reduce(
              (sum, e) => sum + ((e.data as { attentionScore?: number }).attentionScore || 0),
              0
            ) / attentionEvents.length
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
      logger.error(
        'Error fetching analytics summary',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
  });

  // Learning events endpoint - requires authentication to associate with user
  app.post('/api/learning/events', requireAuth, async (req, res) => {
    try {
      const eventSchema = z.object({
        type: z.string(),
        data: learningEventDataSchema,
        timestamp: z
          .string()
          .datetime()
          .optional()
          .transform((val) => (val ? new Date(val) : undefined)),
      });

      const validatedData = eventSchema.parse(req.body);
      // SECURITY: Always use authenticated user ID, never accept from request body
      const userId = getUserIdFromRequest(req);

      const event = await storage.createLearningEvent({
        userId,
        type: validatedData.type,
        data: validatedData.data,
        timestamp: validatedData.timestamp || new Date(),
      });
      res.json(event);
    } catch (error) {
      logger.error(
        'Error creating learning event',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  // Core engine event endpoints — store/retrieve typed NoesisEvents
  // These enable the server to persist core engine state that can be replayed.

  app.post('/api/core/events', requireAuth, async (req, res) => {
    try {
      const validation = validateNoesisEvent(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const userId = getUserIdFromRequest(req);
      const insertEvent = coreEventToLearningEvent(userId, validation.event);
      const stored = await storage.createLearningEvent(insertEvent);

      res.status(201).json({
        id: stored.id,
        coreEventId: validation.event.id,
        type: validation.event.type,
      });
    } catch (error) {
      logger.error(
        'Error storing core event',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  app.post('/api/core/events/batch', requireAuth, async (req, res) => {
    try {
      const batchSchema = z.array(z.unknown()).min(1).max(100);
      const rawEvents = batchSchema.parse(req.body);

      const userId = getUserIdFromRequest(req);
      const results: Array<{ coreEventId: string; stored: boolean; error?: string }> = [];

      for (const raw of rawEvents) {
        const validation = validateNoesisEvent(raw);
        if (!validation.valid) {
          results.push({ coreEventId: '', stored: false, error: validation.error });
          continue;
        }
        const insertEvent = coreEventToLearningEvent(userId, validation.event);
        await storage.createLearningEvent(insertEvent);
        results.push({ coreEventId: validation.event.id, stored: true });
      }

      res.status(201).json({ stored: results.filter((r) => r.stored).length, results });
    } catch (error) {
      logger.error(
        'Error storing core events batch',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  app.get('/api/core/events', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const allEvents = await storage.getLearningEventsByUserId(userId);
      const coreEvents = extractCoreEvents(allEvents);

      res.json({ count: coreEvents.length, events: coreEvents });
    } catch (error) {
      logger.error(
        'Error fetching core events',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to fetch core events' });
    }
  });

  // Core engine state persistence — save/load the full engine snapshot
  // This allows BKT skill probabilities, FSRS memory states, and review
  // schedules to survive browser close and server restart.
  app.put('/api/engine/state', requireAuth, async (req, res) => {
    try {
      const stateSchema = z.object({
        state: z.string().min(1),
      });
      const { state } = stateSchema.parse(req.body);
      const userId = getUserIdFromRequest(req);
      await storage.saveEngineState(userId, state);
      res.json({ saved: true });
    } catch (error) {
      logger.error(
        'Error saving engine state',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  app.get('/api/engine/state', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const state = await storage.loadEngineState(userId);
      if (state === null) {
        res.status(404).json({ error: 'No engine state found' });
        return;
      }
      res.json({ state });
    } catch (error) {
      logger.error(
        'Error loading engine state',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to load engine state' });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // Curriculum (Phase E2)
  //
  // PUT/POST stores a user's skill graph (skills + optional itemMappings +
  // optional transferTests). The graph is validated through createSkillGraph
  // before being persisted — graphs with cycles or other structural errors
  // are rejected with 400 and the validation errors echoed back so the
  // client can fix them.
  //
  // GET returns the stored graph or 404 when none has been saved yet.
  // ───────────────────────────────────────────────────────────────────────

  const curriculumSchema = z.object({
    skills: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          description: z.string().optional(),
          prerequisites: z.array(z.string()).default([]),
          encompassedSkills: z.array(z.string()).optional(),
          category: z.string().optional(),
          difficulty: z.number().min(0).max(1).optional(),
        })
      )
      .min(1),
    itemMappings: z
      .array(
        z.object({
          itemId: z.string().min(1),
          primarySkillId: z.string().min(1),
          secondarySkillIds: z.array(z.string()).default([]),
          difficulty: z.number().min(0).max(1),
        })
      )
      .optional(),
    transferTests: z
      .array(
        z.object({
          id: z.string().min(1),
          skillId: z.string().min(1),
          transferType: z.enum(['near', 'far']),
          context: z.string(),
          passingScore: z.number().min(0).max(1),
        })
      )
      .optional(),
  });

  app.post('/api/curriculum/skills', requireAuth, async (req, res) => {
    try {
      const parsed = curriculumSchema.parse(req.body);

      // Validate the graph before persisting — surface cycles + missing
      // prerequisites at the API boundary so the client gets a 400, not
      // a silent broken curriculum that crashes the engine on hydrate.
      const graph = createSkillGraph(parsed.skills);
      const validation = graph.validate();
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid skill graph',
          errors: validation.errors,
        });
      }

      const userId = getUserIdFromRequest(req);
      await storage.saveCurriculum(userId, {
        skills: parsed.skills,
        itemMappings: parsed.itemMappings,
        transferTests: parsed.transferTests,
      });

      res.status(201).json({
        saved: true,
        skillCount: parsed.skills.length,
        itemCount: parsed.itemMappings?.length ?? 0,
        transferTestCount: parsed.transferTests?.length ?? 0,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
        });
      }
      logger.error(
        'Error saving curriculum',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to save curriculum' });
    }
  });

  app.get('/api/curriculum/skills', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const curriculum = await storage.loadCurriculum(userId);
      if (!curriculum) {
        return res.status(404).json({ error: 'No curriculum saved' });
      }
      res.json(curriculum);
    } catch (error) {
      logger.error(
        'Error loading curriculum',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to load curriculum' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
