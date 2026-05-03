import type { Express, Request } from 'express';
import { createServer, type Server } from 'http';
import { storage } from './storage';
import { z } from 'zod';
import { getCurrentUserId, requireAuth, requireAdmin } from './auth';
import { getLLMManager, configureLLMManager, type LLMLogger } from '@noesis/adapters-llm';
import { createError as _createError, ErrorCodes as _ErrorCodes } from './errors';
import { logger } from './logger';
import { coreEventToLearningEvent, extractCoreEvents, validateNoesisEvent } from './event-bridge';
import { createSkillGraph } from '@noesis-edu/core';
import { getEngineManager } from './engine-manager';
import { wsService } from './websocket';
import { commonSchemas } from './middleware/validation';

/**
 * Default session config used by server-side planner endpoints.
 *
 * Mirrors the SDK's DEFAULT_SDK_SESSION_CONFIG (apps/web-demo's path) but
 * declared here so the server doesn't depend on @noesis/sdk-web. Pilots that
 * want to override per-request can extend the route with a `?config=...`
 * query param later.
 */
const DEFAULT_SERVER_SESSION_CONFIG = {
  maxDurationMinutes: 30,
  targetItems: 20,
  masteryThreshold: 0.85,
  enforceSpacedRetrieval: true,
  requireTransferTests: false,
};

/**
 * Best-effort derivation of the per-engine learner identifier from the
 * authenticated user. Currently a 1:1 mapping (one learner per user). Pilots
 * with cohort/teacher views will need to thread a learnerId param later.
 */
function learnerIdForUser(userId: number): string {
  return `user-${userId}`;
}

/**
 * Combined query schema for endpoints that paginate AND date-range filter.
 * Reuses `commonSchemas` from middleware/validation so pagination semantics
 * (default page=1, limit=20, max 100) stay consistent across the API.
 */
const paginatedDateRangeQuerySchema = commonSchemas.pagination.merge(commonSchemas.dateRange);

/** Plain query schema for endpoints that only date-range filter (no pagination). */
const dateRangeQuerySchema = commonSchemas.dateRange;

/**
 * Filter LearningEvents by inclusive date range. `startDate` / `endDate` are
 * ISO 8601 strings; either may be omitted to leave that side open.
 */
function filterByDateRange<E extends { timestamp: Date | string }>(
  items: E[],
  startDate?: string,
  endDate?: string
): E[] {
  if (!startDate && !endDate) return items;
  const startMs = startDate ? new Date(startDate).getTime() : -Infinity;
  const endMs = endDate ? new Date(endDate).getTime() : Infinity;
  return items.filter((e) => {
    const ts = e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
    return ts >= startMs && ts <= endMs;
  });
}

/** Build pagination metadata + slice the items array. */
function paginate<E>(
  items: E[],
  page: number,
  limit: number
): { items: E[]; page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    items: items.slice(start, end),
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
  };
}

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
      const query = paginatedDateRangeQuerySchema.parse(req.query);
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('attention');
      // Filter to only show authenticated user's data, then by date range, then paginate.
      const userEvents = events.filter((e) => e.userId === userId);
      const filtered = filterByDateRange(userEvents, query.startDate, query.endDate);
      res.json(paginate(filtered, query.page, query.limit));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
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
      const query = paginatedDateRangeQuerySchema.parse(req.query);
      const userId = getUserIdFromRequest(req);
      const events = await storage.getLearningEventsByType('mastery');
      const userEvents = events.filter((e) => e.userId === userId);
      const filtered = filterByDateRange(userEvents, query.startDate, query.endDate);
      res.json(paginate(filtered, query.page, query.limit));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
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
      const query = dateRangeQuerySchema.parse(req.query);
      const userId = getUserIdFromRequest(req);
      const allEvents = await storage.getLearningEventsByUserId(userId);
      // Date-range filter applies to every aggregation below — counts, average,
      // recentEvents — so a "last 7 days" view doesn't accidentally include
      // historical events.
      const inWindow = filterByDateRange(allEvents, query.startDate, query.endDate);

      // Compute summary statistics
      const attentionEvents = inWindow.filter((e) => e.type === 'attention');
      const masteryEvents = inWindow.filter((e) => e.type === 'mastery');
      const recommendationEvents = inWindow.filter((e) => e.type === 'recommendation');
      const engagementEvents = inWindow.filter((e) => e.type === 'engagement');

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
        totalEvents: inWindow.length,
        eventCounts: {
          attention: attentionEvents.length,
          mastery: masteryEvents.length,
          recommendations: recommendationEvents.length,
          engagements: engagementEvents.length,
        },
        averageAttention: Math.round(avgAttention * 100) / 100,
        recentEvents: inWindow.slice(-10).reverse(),
        llmProvider: llm.getActiveProvider(),
        // Echo the active window so callers know what was applied.
        window: { startDate: query.startDate, endDate: query.endDate },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
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

      // Phase E5 — broadcast on the WebSocket so other tabs / dashboards see
      // the event in real time. No-op when no WS clients are connected.
      wsService.broadcastLearningEvent({
        eventType: validation.event.type,
        data: { coreEventId: validation.event.id },
        userId,
      });

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
        // Phase E5 — same per-event broadcast as the single-event endpoint.
        wsService.broadcastLearningEvent({
          eventType: validation.event.type,
          data: { coreEventId: validation.event.id },
          userId,
        });
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
      const query = paginatedDateRangeQuerySchema.parse(req.query);
      const userId = getUserIdFromRequest(req);
      const allEvents = await storage.getLearningEventsByUserId(userId);
      const coreEvents = extractCoreEvents(allEvents);
      // Date-filter on the core event timestamp (number, ms epoch) before
      // pagination so window-relative pagination is consistent.
      const startMs = query.startDate ? new Date(query.startDate).getTime() : -Infinity;
      const endMs = query.endDate ? new Date(query.endDate).getTime() : Infinity;
      const inWindow = coreEvents.filter((e) => e.timestamp >= startMs && e.timestamp <= endMs);
      const page = paginate(inWindow, query.page, query.limit);

      // Keep the legacy `count` + `events` fields next to the new pagination
      // metadata so existing clients that only read those keep working.
      res.json({
        count: page.total,
        events: page.items,
        page: page.page,
        limit: page.limit,
        total: page.total,
        totalPages: page.totalPages,
        hasNextPage: page.hasNextPage,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
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

  // ───────────────────────────────────────────────────────────────────────
  // Server-side core engine endpoints (Phase E3 + E4 + E5)
  //
  // These are the thin-client surface — the server owns the engine state,
  // the client just submits practice events and asks for the next action.
  // Each endpoint goes through getEngineManager() so all engine accesses
  // share the per-user cached instance.
  // ───────────────────────────────────────────────────────────────────────

  app.get('/api/core/next-action', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const engine = await getEngineManager().getEngineForUser(userId);
      const action = engine.getNextAction(learnerIdForUser(userId), DEFAULT_SERVER_SESSION_CONFIG);
      res.json(action);
    } catch (error) {
      logger.error(
        'Error getting next action',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to get next action' });
    }
  });

  // GET /api/core/progress (Phase E5)
  // Returns the user's LearnerProgress (mastered/learning/not-started skill
  // counts, average mastery, total events). Composes with the engine
  // manager so the numbers reflect every event the server has processed.
  app.get('/api/core/progress', requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const engine = await getEngineManager().getEngineForUser(userId);
      const progress = engine.getLearnerProgress(learnerIdForUser(userId));
      res.json(progress);
    } catch (error) {
      logger.error(
        'Error getting learner progress',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to get learner progress' });
    }
  });

  // POST /api/core/practice (Phase E4)
  // Thin-client practice endpoint: server processes the event through the
  // canonical engine, persists the event for audit/replay, snapshots state,
  // and returns the post-event progress + next recommended action so the
  // client can render the next screen without a follow-up GET.
  const practiceSchema = z.object({
    skillId: z.string().min(1),
    itemId: z.string().min(1),
    correct: z.boolean(),
    responseTimeMs: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1).optional(),
    errorCategory: z.string().optional(),
    /** Override the server-managed session id when the client owns sessions. */
    sessionId: z.string().min(1).optional(),
    /** Canonical-loop stage: 'practice' (default) or 'application'. */
    stage: z.enum(['practice', 'application']).optional(),
  });

  app.post('/api/core/practice', requireAuth, async (req, res) => {
    try {
      const parsed = practiceSchema.parse(req.body);
      const userId = getUserIdFromRequest(req);
      const learnerId = learnerIdForUser(userId);
      const engine = await getEngineManager().getEngineForUser(userId);

      // Build the canonical PracticeEvent through the engine's own clock +
      // idGenerator so it composes with replay determinism (Phase A) on the
      // server side: re-running the persisted event log produces identical
      // state.
      const event = {
        id: engine.generateEventId(),
        type: 'practice' as const,
        learnerId,
        sessionId: parsed.sessionId ?? `srv-${userId}`,
        timestamp: engine.getCurrentTime(),
        skillId: parsed.skillId,
        itemId: parsed.itemId,
        correct: parsed.correct,
        responseTimeMs: parsed.responseTimeMs,
        ...(parsed.confidence !== undefined ? { confidence: parsed.confidence } : {}),
        ...(parsed.errorCategory ? { errorCategory: parsed.errorCategory } : {}),
        ...(parsed.stage ? { stage: parsed.stage } : {}),
      };

      engine.processEvent(event);

      // Persist the canonical event for the audit trail; persist the engine
      // snapshot so the next access skips the (slower) event-log replay.
      await storage.createLearningEvent(coreEventToLearningEvent(userId, event));
      await getEngineManager().flush(userId);

      // Phase E5 — broadcast on the WebSocket so dashboards / other tabs
      // see the practice in real time.
      wsService.broadcastLearningEvent({
        eventType: 'practice',
        data: { coreEventId: event.id, skillId: event.skillId, correct: event.correct },
        userId,
      });

      const progress = engine.getLearnerProgress(learnerId);
      const nextAction = engine.getNextAction(learnerId, DEFAULT_SERVER_SESSION_CONFIG);

      res.status(201).json({ event, progress, nextAction });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
        });
      }
      logger.error(
        'Error processing practice event',
        { module: 'routes' },
        error instanceof Error ? error : undefined
      );
      res.status(500).json({ error: 'Failed to process practice event' });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // Mentor / admin endpoints (Phase H6)
  //
  // Admin-only views over every learner. Used by the mentor dashboard at
  // /mentor in the web app to triage who's progressing, who's stuck, and
  // to export the cohort as CSV for downstream analysis.
  //
  // Shape of LearnerProgress comes straight from the engine — no need to
  // re-derive numbers here, the engine is the source of truth.
  // ───────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────
  // Authoring admin endpoints (Phase H7)
  //
  // Admin-only CRUD for the system-wide skill graph. Each mutation
  // re-validates the resulting graph through createSkillGraph so a stray
  // edit can't leave the system curriculum in a state with cycles or
  // dangling prerequisites.
  // ───────────────────────────────────────────────────────────────────────

  const adminSkillSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    prerequisites: z.array(z.string()).default([]),
    encompassedSkills: z.array(z.string()).optional(),
    category: z.string().optional(),
    difficulty: z.number().min(0).max(1).optional(),
  });

  app.get('/api/admin/skills', requireAdmin, async (_req, res) => {
    try {
      const curriculum = await storage.getSystemCurriculum();
      res.json(curriculum ?? { skills: [] });
    } catch (error) {
      logger.error(
        'Error loading system curriculum',
        { module: 'routes' },
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: 'Failed to load system curriculum' });
    }
  });

  app.post('/api/admin/skills', requireAdmin, async (req, res) => {
    try {
      const incoming = adminSkillSchema.parse(req.body);
      const current = (await storage.getSystemCurriculum()) ?? { skills: [] };
      if (current.skills.some((s) => s.id === incoming.id)) {
        return res.status(409).json({ error: `Skill '${incoming.id}' already exists` });
      }
      const next = { ...current, skills: [...current.skills, incoming] };
      const validation = createSkillGraph(next.skills).validate();
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid skill graph', errors: validation.errors });
      }
      await storage.setSystemCurriculum(next);
      res.status(201).json({ skill: incoming, skillCount: next.skills.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
        });
      }
      logger.error(
        'Error creating system skill',
        { module: 'routes' },
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: 'Failed to create skill' });
    }
  });

  app.put('/api/admin/skills/:id', requireAdmin, async (req, res) => {
    try {
      const skillId = req.params.id;
      // Ignore any client-supplied id in the body — the URL is authoritative.
      const incoming = adminSkillSchema.parse({ ...req.body, id: skillId });
      const current = await storage.getSystemCurriculum();
      if (!current || !current.skills.some((s) => s.id === skillId)) {
        return res.status(404).json({ error: `Skill '${skillId}' not found` });
      }
      const nextSkills = current.skills.map((s) => (s.id === skillId ? incoming : s));
      const validation = createSkillGraph(nextSkills).validate();
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid skill graph', errors: validation.errors });
      }
      await storage.setSystemCurriculum({ ...current, skills: nextSkills });
      res.json({ skill: incoming });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
        });
      }
      logger.error(
        'Error updating system skill',
        { module: 'routes' },
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: 'Failed to update skill' });
    }
  });

  app.delete('/api/admin/skills/:id', requireAdmin, async (req, res) => {
    try {
      const skillId = req.params.id;
      const current = await storage.getSystemCurriculum();
      if (!current || !current.skills.some((s) => s.id === skillId)) {
        return res.status(404).json({ error: `Skill '${skillId}' not found` });
      }
      // Strip the deleted skill from any remaining prerequisites/
      // encompassedSkills so the resulting graph is still validatable.
      const nextSkills = current.skills
        .filter((s) => s.id !== skillId)
        .map((s) => ({
          ...s,
          prerequisites: s.prerequisites.filter((p) => p !== skillId),
          encompassedSkills: s.encompassedSkills?.filter((e) => e !== skillId),
        }));
      const validation = createSkillGraph(nextSkills).validate();
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid skill graph', errors: validation.errors });
      }
      await storage.setSystemCurriculum({ ...current, skills: nextSkills });
      res.json({ deleted: skillId, skillCount: nextSkills.length });
    } catch (error) {
      logger.error(
        'Error deleting system skill',
        { module: 'routes' },
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: 'Failed to delete skill' });
    }
  });

  app.get('/api/mentor/learners', requireAdmin, async (_req, res) => {
    try {
      const users = await storage.listUsers();
      const manager = getEngineManager();
      const learners = await Promise.all(
        users.map(async (u) => {
          let progress = null;
          try {
            const engine = await manager.getEngineForUser(u.id);
            progress = engine.getLearnerProgress(learnerIdForUser(u.id));
          } catch (err) {
            // A single corrupt user's engine shouldn't fail the whole list;
            // surface a null-progress row so the mentor can still see them.
            logger.warn('Failed to hydrate engine for mentor view', {
              module: 'routes',
              userId: u.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return {
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            isAdmin: u.isAdmin,
            progress,
          };
        }),
      );
      res.json({ learners });
    } catch (error) {
      logger.error(
        'Error listing learners for mentor view',
        { module: 'routes' },
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: 'Failed to list learners' });
    }
  });

  app.get('/api/mentor/export.csv', requireAdmin, async (_req, res) => {
    try {
      const users = await storage.listUsers();
      const manager = getEngineManager();
      const rows: string[] = [];
      // Header
      rows.push(
        [
          'id',
          'username',
          'displayName',
          'isAdmin',
          'totalSkills',
          'masteredSkills',
          'learningSkills',
          'notStartedSkills',
          'averageMastery',
          'totalEvents',
        ].join(','),
      );
      for (const u of users) {
        let progress: ReturnType<
          Awaited<ReturnType<typeof manager.getEngineForUser>>['getLearnerProgress']
        > | null = null;
        try {
          const engine = await manager.getEngineForUser(u.id);
          progress = engine.getLearnerProgress(learnerIdForUser(u.id));
        } catch {
          /* keep null — appears as blanks in CSV */
        }
        rows.push(
          [
            csvCell(u.id),
            csvCell(u.username),
            csvCell(u.displayName ?? ''),
            csvCell(u.isAdmin ? 'true' : 'false'),
            csvCell(progress?.totalSkills ?? ''),
            csvCell(progress?.masteredSkills ?? ''),
            csvCell(progress?.learningSkills ?? ''),
            csvCell(progress?.notStartedSkills ?? ''),
            csvCell(progress?.averageMastery ?? ''),
            csvCell(progress?.totalEvents ?? ''),
          ].join(','),
        );
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="learners.csv"');
      res.send(rows.join('\n') + '\n');
    } catch (error) {
      logger.error(
        'Error exporting learners CSV',
        { module: 'routes' },
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: 'Failed to export learners CSV' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

/**
 * RFC-4180-ish CSV cell escaping. Wraps in quotes if the cell contains a
 * comma, quote, newline, or carriage return; doubles internal quotes.
 * Sufficient for the mentor export — usernames can hold commas/quotes if a
 * future identity provider permits them.
 */
function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
