import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { registerRoutes } from '../routes';
import { setupAuth } from '../auth';
import { configureEngineManager, resetEngineManager } from '../engine-manager';

// Mock OpenAI to avoid API calls in tests
vi.mock('openai', () => {
  const mockCreate = vi.fn().mockRejectedValue(new Error('Mocked - no API key'));
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

// Mock the WebSocket service so route handlers that broadcast (Phase E5) can
// be observed without standing up a real WS server. The real wsService is a
// Proxy over a lazy singleton; replacing the module with a vanilla object of
// vi.fn()s lets us spy on broadcastLearningEvent calls.
vi.mock('../websocket', () => {
  return {
    wsService: {
      broadcastLearningEvent: vi.fn(),
      broadcastRecommendation: vi.fn(),
      broadcastAttentionUpdate: vi.fn(),
    },
    initializeWebSocket: vi.fn(),
  };
});

// Mock storage for user creation
vi.mock('../storage', () => {
  const users = new Map<number, { id: number; username: string; password: string }>();
  const events: Array<{
    id: number;
    userId: number;
    type: string;
    data: unknown;
    timestamp: Date;
  }> = [];
  const engineStates = new Map<number, string>();
  const curricula = new Map<number, unknown>();
  let currentUserId = 1;
  let currentEventId = 1;

  return {
    storage: {
      getUserByUsername: vi.fn(async (username: string) => {
        return Array.from(users.values()).find((u) => u.username === username);
      }),
      getUser: vi.fn(async (id: number) => {
        return users.get(id);
      }),
      createUser: vi.fn(async (user: { username: string; password: string }) => {
        const bcrypt = await import('bcrypt');
        const hashedPassword = await bcrypt.hash(user.password, 10);
        const newUser = { id: currentUserId++, username: user.username, password: hashedPassword };
        users.set(newUser.id, newUser);
        return newUser;
      }),
      verifyPassword: vi.fn(async (username: string, password: string) => {
        const bcrypt = await import('bcrypt');
        const user = Array.from(users.values()).find((u) => u.username === username);
        if (!user) return null;
        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
      }),
      createLearningEvent: vi.fn(
        async (event: { userId: number; type: string; data: unknown; timestamp: Date }) => {
          const newEvent = { id: currentEventId++, ...event };
          events.push(newEvent);
          return newEvent;
        }
      ),
      getLearningEventsByType: vi.fn(async (type: string) => {
        return events.filter((e) => e.type === type);
      }),
      getLearningEventsByUserId: vi.fn(async (userId: number) => {
        return events.filter((e) => e.userId === userId);
      }),
      saveEngineState: vi.fn(async (userId: number, state: string) => {
        engineStates.set(userId, state);
      }),
      loadEngineState: vi.fn(async (userId: number) => {
        return engineStates.get(userId) ?? null;
      }),
      saveCurriculum: vi.fn(async (userId: number, curriculum: unknown) => {
        curricula.set(userId, JSON.parse(JSON.stringify(curriculum)));
      }),
      loadCurriculum: vi.fn(async (userId: number) => {
        const c = curricula.get(userId);
        return c ? (JSON.parse(JSON.stringify(c)) as unknown) : null;
      }),
      _reset: () => {
        users.clear();
        events.length = 0;
        engineStates.clear();
        curricula.clear();
        currentUserId = 1;
        currentEventId = 1;
      },
    },
  };
});

import { storage } from '../storage';
import { wsService } from '../websocket';

describe('API Routes', () => {
  let app: express.Express;
  let server: ReturnType<typeof import('http').createServer>;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    (storage as any)._reset?.();

    app = express();
    app.use(express.json());

    // Setup session for authentication
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );

    // Setup authentication
    setupAuth(app);

    // Phase E1+E2: configure the engine manager so server-side engine
    // routes (next-action, practice, progress) have a working singleton.
    configureEngineManager({
      curriculumSource: { loadCurriculum: (userId) => storage.loadCurriculum(userId) },
      events: storage,
      state: storage,
    });

    server = await registerRoutes(app);
    agent = request.agent(app);

    // Register and login a test user
    await agent.post('/api/auth/register').send({ username: 'testuser', password: 'TestPass123!' });
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
    resetEngineManager();
  });

  describe('POST /api/orchestration/next-step', () => {
    it('should return 200 with valid request', async () => {
      const response = await agent.post('/api/orchestration/next-step').send({
        learnerState: {
          attention: {
            score: 0.7,
            focusStability: 0.8,
            cognitiveLoad: 0.3,
            status: 'tracking',
          },
          timestamp: Date.now(),
        },
        context: 'learning algebra',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('suggestion');
      expect(response.body).toHaveProperty('type');
    });

    it('should return fallback response when OpenAI fails', async () => {
      const response = await agent.post('/api/orchestration/next-step').send({
        learnerState: {
          timestamp: Date.now(),
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('fallback');
      expect(response.body.suggestion).toBeDefined();
    });

    it('should return 400 for invalid request body', async () => {
      const response = await agent.post('/api/orchestration/next-step').send({
        // Missing required learnerState
        context: 'test',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate attention score range', async () => {
      const response = await agent.post('/api/orchestration/next-step').send({
        learnerState: {
          attention: {
            score: 1.5, // Invalid: > 1
          },
          timestamp: Date.now(),
        },
      });

      expect(response.status).toBe(400);
    });

    it('should accept optional mastery data', async () => {
      const response = await agent.post('/api/orchestration/next-step').send({
        learnerState: {
          mastery: [
            {
              id: 'obj1',
              name: 'Test Objective',
              progress: 0.5,
              status: 'in-progress',
            },
          ],
          timestamp: Date.now(),
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/orchestration/engagement', () => {
    it('should return 200 with valid request', async () => {
      const response = await agent.post('/api/orchestration/engagement').send({
        attentionScore: 0.2,
        context: 'reading chapter 5',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('type');
    });

    it('should return fallback response', async () => {
      const response = await agent.post('/api/orchestration/engagement').send({});

      expect(response.status).toBe(200);
      expect(response.body.source).toBe('fallback');
    });

    it('should avoid repeating previous interventions', async () => {
      const previousIntervention = 'Would you like to take a quick 30-second break to refresh?';

      const response = await agent.post('/api/orchestration/engagement').send({
        previousInterventions: [previousIntervention],
      });

      expect(response.status).toBe(200);
      // Note: There's still a chance it picks the same one if all others were used
      // This test just verifies the endpoint accepts previousInterventions
    });

    it('should validate attentionScore range', async () => {
      const response = await agent.post('/api/orchestration/engagement').send({
        attentionScore: -0.5, // Invalid: < 0
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/analytics/attention', () => {
    it('should return 200 with array', async () => {
      const response = await agent.get('/api/analytics/attention');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/analytics/mastery', () => {
    it('should return 200 with array', async () => {
      const response = await agent.get('/api/analytics/mastery');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/learning/events', () => {
    it('should create learning event with valid data', async () => {
      const response = await agent.post('/api/learning/events').send({
        type: 'attention',
        data: {
          attentionScore: 0.8,
          context: 'test',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'attention');
    });

    it('should use authenticated user ID (ignores client-provided userId)', async () => {
      const response = await agent.post('/api/learning/events').send({
        userId: 999, // This should be ignored - server uses authenticated user
        type: 'mastery',
        data: {
          objectiveId: 'obj1',
          progress: 0.7,
        },
      });

      expect(response.status).toBe(200);
      // userId should be the authenticated user (1), not the one sent in request
      expect(response.body.userId).toBe(1);
    });

    it('should return 400 for missing type', async () => {
      const response = await agent.post('/api/learning/events').send({
        data: { test: true },
      });

      expect(response.status).toBe(400);
    });

    it('should validate data field types', async () => {
      const response = await agent.post('/api/learning/events').send({
        type: 'test',
        data: {
          validString: 'hello',
          validNumber: 42,
          validBoolean: true,
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('PUT /api/engine/state', () => {
    it('should save engine state for authenticated user', async () => {
      const state = JSON.stringify({ version: '1.0.0', learnerModels: [] });
      const response = await agent.put('/api/engine/state').send({ state });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ saved: true });
    });

    it('should return 400 for empty state', async () => {
      const response = await agent.put('/api/engine/state').send({ state: '' });

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing state field', async () => {
      const response = await agent.put('/api/engine/state').send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/engine/state', () => {
    it('should load previously saved state', async () => {
      const state = JSON.stringify({ version: '1.0.0', learnerModels: [{ id: 'test' }] });
      await agent.put('/api/engine/state').send({ state });

      const response = await agent.get('/api/engine/state');

      expect(response.status).toBe(200);
      expect(response.body.state).toBe(state);
    });

    it('should return 404 when no state exists', async () => {
      // Use a fresh mock where no state has been saved for this user
      // Reset the engine states to simulate no prior save
      (storage as any).loadEngineState.mockResolvedValueOnce(null);

      const response = await agent.get('/api/engine/state');

      expect(response.status).toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase E2 — Curriculum CRUD
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /api/curriculum/skills', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const fresh = request.agent(app);
      const res = await fresh.post('/api/curriculum/skills').send({
        skills: [{ id: 'a', name: 'A', prerequisites: [] }],
      });
      expect(res.status).toBe(401);
    });

    it('validates and stores a 3-skill graph', async () => {
      const res = await agent.post('/api/curriculum/skills').send({
        skills: [
          { id: 'a', name: 'A', prerequisites: [] },
          { id: 'b', name: 'B', prerequisites: ['a'] },
          { id: 'c', name: 'C', prerequisites: ['b'] },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.saved).toBe(true);
      expect(res.body.skillCount).toBe(3);
      expect(storage.saveCurriculum).toHaveBeenCalled();
    });

    it('rejects skill graphs with cycles (400 + structured errors)', async () => {
      const res = await agent.post('/api/curriculum/skills').send({
        skills: [
          { id: 'a', name: 'A', prerequisites: ['b'] },
          { id: 'b', name: 'B', prerequisites: ['a'] },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid skill graph/);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0].type).toBe('CYCLE_DETECTED');
    });

    it('rejects graphs with missing prerequisites', async () => {
      const res = await agent.post('/api/curriculum/skills').send({
        skills: [{ id: 'a', name: 'A', prerequisites: ['nonexistent'] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].type).toBe('MISSING_PREREQUISITE');
    });

    it('rejects payloads with no skills (Zod validation)', async () => {
      const res = await agent.post('/api/curriculum/skills').send({ skills: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Validation failed/);
    });

    it('accepts itemMappings and transferTests alongside skills', async () => {
      const res = await agent.post('/api/curriculum/skills').send({
        skills: [{ id: 'a', name: 'A', prerequisites: [] }],
        itemMappings: [
          { itemId: 'q1', primarySkillId: 'a', secondarySkillIds: [], difficulty: 0.3 },
        ],
        transferTests: [
          { id: 'tt-a', skillId: 'a', transferType: 'near', context: 'word', passingScore: 0.8 },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.itemCount).toBe(1);
      expect(res.body.transferTestCount).toBe(1);
    });
  });

  describe('GET /api/curriculum/skills', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const fresh = request.agent(app);
      const res = await fresh.get('/api/curriculum/skills');
      expect(res.status).toBe(401);
    });

    it('returns 404 when no curriculum has been saved', async () => {
      // Make sure the curriculum is NOT present for this query.
      (storage as any).loadCurriculum.mockResolvedValueOnce(null);
      const res = await agent.get('/api/curriculum/skills');
      expect(res.status).toBe(404);
    });

    it('round-trips: POST then GET returns the exact stored shape', async () => {
      const payload = {
        skills: [
          { id: 'a', name: 'A', prerequisites: [] },
          { id: 'b', name: 'B', prerequisites: ['a'] },
        ],
        itemMappings: [
          { itemId: 'q1', primarySkillId: 'a', secondarySkillIds: [], difficulty: 0.3 },
        ],
        transferTests: [
          { id: 'tt-a', skillId: 'a', transferType: 'near', context: 'word', passingScore: 0.8 },
        ],
      };
      const post = await agent.post('/api/curriculum/skills').send(payload);
      expect(post.status).toBe(201);

      const get = await agent.get('/api/curriculum/skills');
      expect(get.status).toBe(200);
      // The skills array carries the Zod-applied default `prerequisites: []`
      // from the schema, which is what's stored — so the round-trip matches
      // the *parsed* payload, not the literal request body.
      expect(get.body.skills).toEqual(payload.skills);
      expect(get.body.itemMappings).toEqual(payload.itemMappings);
      expect(get.body.transferTests).toEqual(payload.transferTests);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase E3 — GET /api/core/next-action
  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /api/core/next-action', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const fresh = request.agent(app);
      const res = await fresh.get('/api/core/next-action');
      expect(res.status).toBe(401);
    });

    it('returns the planner next action for the authenticated user', async () => {
      // Save a curriculum first so the engine has a graph to plan against.
      const curriculumPost = await agent.post('/api/curriculum/skills').send({
        skills: [
          { id: 'a', name: 'A', prerequisites: [] },
          { id: 'b', name: 'B', prerequisites: ['a'] },
        ],
      });
      expect(curriculumPost.status).toBe(201);

      const res = await agent.get('/api/core/next-action');
      expect(res.status).toBe(200);
      // SessionAction shape: { type, skillId?, reason, priority }.
      expect(res.body).toHaveProperty('type');
      expect(res.body).toHaveProperty('reason');
      expect(typeof res.body.priority).toBe('number');
      // For a fresh learner with two skills (no events, no review states),
      // the planner picks the leverage gap. With no transfer tests + canonical
      // loop off (server default), that's a 'practice' on 'a' (no prereqs).
      expect(['practice', 'concept_introduction']).toContain(res.body.type);
      expect(res.body.skillId).toBe('a');
    });

    it('returns rest when no curriculum is loaded (empty graph)', async () => {
      // A fresh user with no curriculum.
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'next-action-empty-user',
        password: 'TestPass123!',
      });
      const res = await fresh.get('/api/core/next-action');
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('rest');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase E4 — POST /api/core/practice
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /api/core/practice', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const fresh = request.agent(app);
      const res = await fresh.post('/api/core/practice').send({
        skillId: 'a',
        itemId: 'q1',
        correct: true,
        responseTimeMs: 500,
      });
      expect(res.status).toBe(401);
    });

    it('rejects missing required fields with 400', async () => {
      const res = await agent.post('/api/core/practice').send({ skillId: 'a' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Validation failed/);
    });

    it('processes a practice event and returns event + progress + nextAction', async () => {
      // Use a fresh user to avoid bleed from prior tests' curriculum/state.
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'practice-user',
        password: 'TestPass123!',
      });
      await fresh.post('/api/curriculum/skills').send({
        skills: [
          { id: 'a', name: 'A', prerequisites: [] },
          { id: 'b', name: 'B', prerequisites: ['a'] },
        ],
      });

      const res = await fresh.post('/api/core/practice').send({
        skillId: 'a',
        itemId: 'q1',
        correct: true,
        responseTimeMs: 500,
        confidence: 0.7,
      });

      expect(res.status).toBe(201);
      // Returned event matches the input shape + canonical fields the engine
      // adds (id, timestamp, learnerId, sessionId, type='practice').
      expect(res.body.event.type).toBe('practice');
      expect(res.body.event.skillId).toBe('a');
      expect(res.body.event.itemId).toBe('q1');
      expect(res.body.event.correct).toBe(true);
      expect(typeof res.body.event.id).toBe('string');
      expect(typeof res.body.event.timestamp).toBe('number');
      expect(typeof res.body.event.learnerId).toBe('string');

      // Progress reflects the new event.
      expect(res.body.progress.totalEvents).toBe(1);

      // Next action is well-formed.
      expect(res.body.nextAction).toHaveProperty('type');
      expect(res.body.nextAction).toHaveProperty('reason');
      expect(typeof res.body.nextAction.priority).toBe('number');
    });

    it('persists the practice event into learning_events with _coreEvent payload', async () => {
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'practice-persist-user',
        password: 'TestPass123!',
      });
      await fresh.post('/api/curriculum/skills').send({
        skills: [{ id: 'a', name: 'A', prerequisites: [] }],
      });

      const before = (storage.createLearningEvent as ReturnType<typeof vi.fn>).mock.calls.length;
      await fresh.post('/api/core/practice').send({
        skillId: 'a',
        itemId: 'qX',
        correct: false,
        responseTimeMs: 1200,
      });
      const after = (storage.createLearningEvent as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(after).toBeGreaterThan(before);
      const lastCall = (storage.createLearningEvent as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      const inserted = lastCall![0] as { type: string; data: { _coreEvent?: string } };
      expect(inserted.type).toBe('core:practice');
      // The payload is the JSON-serialized canonical NoesisEvent.
      const coreEvent = JSON.parse(inserted.data._coreEvent ?? 'null') as {
        type: string;
        skillId: string;
        correct: boolean;
      };
      expect(coreEvent.type).toBe('practice');
      expect(coreEvent.skillId).toBe('a');
      expect(coreEvent.correct).toBe(false);
    });

    it('subsequent practice events accumulate progress (engine cache hit)', async () => {
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'practice-accum-user',
        password: 'TestPass123!',
      });
      await fresh.post('/api/curriculum/skills').send({
        skills: [{ id: 'a', name: 'A', prerequisites: [] }],
      });

      const r1 = await fresh.post('/api/core/practice').send({
        skillId: 'a',
        itemId: 'q1',
        correct: true,
        responseTimeMs: 500,
      });
      expect(r1.body.progress.totalEvents).toBe(1);

      const r2 = await fresh.post('/api/core/practice').send({
        skillId: 'a',
        itemId: 'q2',
        correct: true,
        responseTimeMs: 600,
      });
      expect(r2.body.progress.totalEvents).toBe(2);

      const r3 = await fresh.post('/api/core/practice').send({
        skillId: 'a',
        itemId: 'q3',
        correct: false,
        responseTimeMs: 800,
      });
      expect(r3.body.progress.totalEvents).toBe(3);
    });

    it('accepts optional stage="application" for canonical-loop application events', async () => {
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'practice-stage-user',
        password: 'TestPass123!',
      });
      await fresh.post('/api/curriculum/skills').send({
        skills: [{ id: 'a', name: 'A', prerequisites: [] }],
      });

      const res = await fresh.post('/api/core/practice').send({
        skillId: 'a',
        itemId: 'app-q1',
        correct: true,
        responseTimeMs: 500,
        stage: 'application',
      });
      expect(res.status).toBe(201);
      expect(res.body.event.stage).toBe('application');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase E5 — GET /api/core/progress + WebSocket broadcasts
  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /api/core/progress', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const fresh = request.agent(app);
      const res = await fresh.get('/api/core/progress');
      expect(res.status).toBe(401);
    });

    it('returns LearnerProgress shape for an authed user', async () => {
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'progress-user',
        password: 'TestPass123!',
      });
      await fresh.post('/api/curriculum/skills').send({
        skills: [
          { id: 'a', name: 'A', prerequisites: [] },
          { id: 'b', name: 'B', prerequisites: ['a'] },
        ],
      });

      // Process two practice events so totalEvents > 0.
      await fresh
        .post('/api/core/practice')
        .send({ skillId: 'a', itemId: 'q1', correct: true, responseTimeMs: 500 });
      await fresh
        .post('/api/core/practice')
        .send({ skillId: 'a', itemId: 'q2', correct: true, responseTimeMs: 500 });

      const res = await fresh.get('/api/core/progress');
      expect(res.status).toBe(200);
      // LearnerProgress shape from packages/core/src/engine/NoesisCoreEngineImpl.ts.
      expect(res.body).toMatchObject({
        learnerId: expect.any(String),
        totalSkills: 2,
        masteredSkills: expect.any(Number),
        learningSkills: expect.any(Number),
        notStartedSkills: expect.any(Number),
        averageMastery: expect.any(Number),
        totalEvents: 2,
      });
    });
  });

  describe('WebSocket broadcast on event-store routes', () => {
    beforeEach(() => {
      (wsService.broadcastLearningEvent as ReturnType<typeof vi.fn>).mockClear();
    });

    it('POST /api/core/practice broadcasts the practice event to WebSocket subscribers', async () => {
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'broadcast-practice-user',
        password: 'TestPass123!',
      });
      await fresh.post('/api/curriculum/skills').send({
        skills: [{ id: 'a', name: 'A', prerequisites: [] }],
      });

      await fresh
        .post('/api/core/practice')
        .send({ skillId: 'a', itemId: 'q1', correct: true, responseTimeMs: 500 });

      expect(wsService.broadcastLearningEvent).toHaveBeenCalled();
      const call = (wsService.broadcastLearningEvent as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      const payload = call![0] as { eventType: string; data: { skillId: string }; userId: number };
      expect(payload.eventType).toBe('practice');
      expect(payload.data.skillId).toBe('a');
      expect(typeof payload.userId).toBe('number');
    });

    it('POST /api/core/events broadcasts the stored core event', async () => {
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'broadcast-event-user',
        password: 'TestPass123!',
      });

      const event = {
        id: 'evt-broadcast-1',
        type: 'practice',
        learnerId: 'lX',
        sessionId: 'sX',
        timestamp: 1000,
        skillId: 'a',
        itemId: 'q1',
        correct: true,
        responseTimeMs: 500,
      };
      const res = await fresh.post('/api/core/events').send(event);
      expect(res.status).toBe(201);

      expect(wsService.broadcastLearningEvent).toHaveBeenCalledTimes(1);
      const call = (wsService.broadcastLearningEvent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call![0]).toMatchObject({
        eventType: 'practice',
        data: { coreEventId: 'evt-broadcast-1' },
      });
    });

    it('POST /api/core/events/batch broadcasts once per stored event', async () => {
      const fresh = request.agent(app);
      await fresh.post('/api/auth/register').send({
        username: 'broadcast-batch-user',
        password: 'TestPass123!',
      });

      const batch = [
        {
          id: 'b1',
          type: 'practice',
          learnerId: 'lX',
          sessionId: 'sX',
          timestamp: 1000,
          skillId: 'a',
          itemId: 'q1',
          correct: true,
          responseTimeMs: 500,
        },
        {
          id: 'b2',
          type: 'practice',
          learnerId: 'lX',
          sessionId: 'sX',
          timestamp: 2000,
          skillId: 'a',
          itemId: 'q2',
          correct: false,
          responseTimeMs: 600,
        },
        // An invalid event mixed in — the route should keep going and only
        // broadcast for the stored ones.
        { id: 'b3', type: 'practice' /* missing fields */ },
      ];
      const res = await fresh.post('/api/core/events/batch').send(batch);
      expect(res.status).toBe(201);
      expect(res.body.stored).toBe(2);
      expect(wsService.broadcastLearningEvent).toHaveBeenCalledTimes(2);
      const ids = (wsService.broadcastLearningEvent as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { data: { coreEventId: string } }).data.coreEventId
      );
      expect(ids).toEqual(['b1', 'b2']);
    });

    it('does NOT broadcast on validation failure (POST /api/core/events with bad body)', async () => {
      const res = await agent.post('/api/core/events').send({ type: 'practice' /* missing */ });
      expect(res.status).toBe(400);
      expect(wsService.broadcastLearningEvent).not.toHaveBeenCalled();
    });
  });
});
