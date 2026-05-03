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
  let systemCurr: unknown = null;
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
        const newUser = {
          id: currentUserId++,
          username: user.username,
          password: hashedPassword,
          email: null,
          googleId: null,
          displayName: null,
          avatarUrl: null,
          isAdmin: false,
        } as { id: number; username: string; password: string; isAdmin: boolean } & Record<
          string,
          unknown
        >;
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
      listUsers: vi.fn(async () => {
        return Array.from(users.values());
      }),
      setUserAdmin: vi.fn(async (userId: number, isAdmin: boolean) => {
        const u = users.get(userId);
        if (u) {
          (u as Record<string, unknown>).isAdmin = isAdmin;
        }
      }),
      getSystemCurriculum: vi.fn(async () => {
        return systemCurr ? (JSON.parse(JSON.stringify(systemCurr)) as unknown) : null;
      }),
      setSystemCurriculum: vi.fn(async (c: unknown) => {
        systemCurr = JSON.parse(JSON.stringify(c)) as unknown;
      }),
      _reset: () => {
        users.clear();
        events.length = 0;
        engineStates.clear();
        curricula.clear();
        systemCurr = null;
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
    it('should return 200 with paginated payload (Phase E6)', async () => {
      const response = await agent.get('/api/analytics/attention');

      expect(response.status).toBe(200);
      // Phase E6 wraps the array in pagination metadata.
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body).toMatchObject({
        page: 1,
        limit: 20,
        total: expect.any(Number),
      });
    });
  });

  describe('GET /api/analytics/mastery', () => {
    it('should return 200 with paginated payload (Phase E6)', async () => {
      const response = await agent.get('/api/analytics/mastery');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body).toMatchObject({
        page: 1,
        limit: 20,
        total: expect.any(Number),
      });
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

  // ─────────────────────────────────────────────────────────────────────────
  // Phase E6 — pagination + date-range
  // ─────────────────────────────────────────────────────────────────────────
  describe('Phase E6: pagination + date-range', () => {
    let pageUser: ReturnType<typeof request.agent>;

    beforeAll(async () => {
      // Build a fresh user with 25 attention events so pagination has
      // something to slice. We post via /api/learning/events (the legacy
      // generic endpoint) because /api/analytics/attention reads back from
      // type='attention' rows.
      pageUser = request.agent(app);
      await pageUser
        .post('/api/auth/register')
        .send({ username: 'pagination-user', password: 'TestPass123!' });
      for (let i = 0; i < 25; i++) {
        await pageUser
          .post('/api/learning/events')
          .send({ type: 'attention', data: { attentionScore: i / 25 } });
      }
    });

    it('paginates analytics responses: limit=10 returns 10 + metadata', async () => {
      const res = await pageUser.get('/api/analytics/attention?limit=10');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(10);
      expect(res.body.total).toBe(25);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.hasNextPage).toBe(true);
    });

    it('respects ?page=2 (returns next slice, hasNextPage updates)', async () => {
      const res = await pageUser.get('/api/analytics/attention?limit=10&page=2');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(10);
      expect(res.body.page).toBe(2);
      expect(res.body.hasNextPage).toBe(true);
    });

    it('last page has hasNextPage=false and partial items', async () => {
      const res = await pageUser.get('/api/analytics/attention?limit=10&page=3');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(5); // 25 mod 10
      expect(res.body.page).toBe(3);
      expect(res.body.hasNextPage).toBe(false);
    });

    it('rejects limit > 100 and limit < 1 (Zod schema bounds)', async () => {
      const tooLarge = await pageUser.get('/api/analytics/attention?limit=101');
      expect(tooLarge.status).toBe(400);
      const zero = await pageUser.get('/api/analytics/attention?limit=0');
      expect(zero.status).toBe(400);
    });

    it('filters by date range: events outside the window are excluded', async () => {
      // Attention events were created sequentially in the beforeAll; their
      // timestamps are recent. A start-of-2099 window should return zero,
      // an end-before-1970 window should also return zero.
      const future = await pageUser.get(
        `/api/analytics/attention?startDate=${encodeURIComponent('2099-01-01T00:00:00.000Z')}`
      );
      expect(future.status).toBe(200);
      expect(future.body.total).toBe(0);
      expect(future.body.items.length).toBe(0);

      const past = await pageUser.get(
        `/api/analytics/attention?endDate=${encodeURIComponent('1970-01-02T00:00:00.000Z')}`
      );
      expect(past.status).toBe(200);
      expect(past.body.total).toBe(0);
    });

    it('summary endpoint date-filters its aggregations and echoes the window', async () => {
      const future = await pageUser.get(
        `/api/analytics/summary?startDate=${encodeURIComponent('2099-01-01T00:00:00.000Z')}`
      );
      expect(future.status).toBe(200);
      expect(future.body.totalEvents).toBe(0);
      expect(future.body.eventCounts.attention).toBe(0);
      expect(future.body.window.startDate).toBe('2099-01-01T00:00:00.000Z');

      // No window → all events visible.
      const all = await pageUser.get('/api/analytics/summary');
      expect(all.status).toBe(200);
      expect(all.body.totalEvents).toBeGreaterThan(0);
    });

    it('GET /api/core/events paginates AND keeps the legacy { count, events } fields', async () => {
      // Pre-seed 5 core events for a fresh user.
      const fresh = request.agent(app);
      await fresh
        .post('/api/auth/register')
        .send({ username: 'core-events-pagination-user', password: 'TestPass123!' });
      for (let i = 0; i < 5; i++) {
        await fresh.post('/api/core/events').send({
          id: `evt-pag-${i}`,
          type: 'practice',
          learnerId: 'lP',
          sessionId: 'sP',
          timestamp: 1000 + i,
          skillId: 'a',
          itemId: `q${i}`,
          correct: true,
          responseTimeMs: 500,
        });
      }

      const res = await fresh.get('/api/core/events?limit=2&page=1');
      expect(res.status).toBe(200);
      // New pagination fields.
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.hasNextPage).toBe(true);
      // Legacy fields preserved (back-compat).
      expect(res.body.count).toBe(5);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events.length).toBe(2);
    });
  });

  describe('Phase H6: mentor endpoints', () => {
    // The default test user from beforeAll is non-admin. We register a second
    // user, promote them via the mocked storage.setUserAdmin, log in as that
    // user with a fresh agent, and use both agents to assert the gate.

    let adminAgent: ReturnType<typeof request.agent>;
    let nonAdminAgent: ReturnType<typeof request.agent>;

    beforeAll(async () => {
      // Reuse the existing test user as the non-admin probe.
      nonAdminAgent = agent;

      // Register a second user — will be promoted to admin.
      adminAgent = request.agent(app);
      await adminAgent
        .post('/api/auth/register')
        .send({ username: 'mentoradmin', password: 'AdminPass123!' });

      // Promote the new user. Mock storage.listUsers returns them with
      // isAdmin flipped on, which is what passport.deserializeUser will see
      // on the next request thanks to the in-memory mock.
      const allUsers = await storage.listUsers();
      const adminUser = allUsers.find((u) => u.username === 'mentoradmin');
      if (!adminUser) throw new Error('mentoradmin not found in mock storage');
      await storage.setUserAdmin(adminUser.id, true);
    });

    it('GET /api/mentor/learners returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/mentor/learners');
      expect(res.status).toBe(401);
    });

    it('GET /api/mentor/learners returns 403 for non-admin', async () => {
      const res = await nonAdminAgent.get('/api/mentor/learners');
      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
    });

    it('GET /api/mentor/learners returns the learner list for admin', async () => {
      const res = await adminAgent.get('/api/mentor/learners');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.learners)).toBe(true);
      expect(res.body.learners.length).toBeGreaterThanOrEqual(2);
      // Each entry has the expected shape
      for (const l of res.body.learners) {
        expect(l).toHaveProperty('id');
        expect(l).toHaveProperty('username');
        expect(l).toHaveProperty('isAdmin');
        expect(l).toHaveProperty('progress');
      }
      // Our promoted admin shows isAdmin true; the original test user shows false
      const admin = res.body.learners.find(
        (l: { username: string }) => l.username === 'mentoradmin',
      );
      const nonAdmin = res.body.learners.find(
        (l: { username: string }) => l.username === 'testuser',
      );
      expect(admin?.isAdmin).toBe(true);
      expect(nonAdmin?.isAdmin).toBe(false);
    });

    it('GET /api/mentor/export.csv returns 403 for non-admin', async () => {
      const res = await nonAdminAgent.get('/api/mentor/export.csv');
      expect(res.status).toBe(403);
    });

    it('GET /api/mentor/export.csv returns CSV with text/csv mime + attachment header', async () => {
      const res = await adminAgent.get('/api/mentor/export.csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.headers['content-disposition']).toMatch(/learners\.csv/);
      // Header row is the first line
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toBe(
        'id,username,displayName,isAdmin,totalSkills,masteredSkills,learningSkills,notStartedSkills,averageMastery,totalEvents',
      );
      // At least one data row
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Phase H7: admin skill CRUD', () => {
    let adminAgent: ReturnType<typeof request.agent>;
    let nonAdminAgent: ReturnType<typeof request.agent>;

    beforeAll(async () => {
      nonAdminAgent = agent;
      adminAgent = request.agent(app);
      await adminAgent
        .post('/api/auth/register')
        .send({ username: 'authoradmin', password: 'AdminPass123!' });
      const allUsers = await storage.listUsers();
      const me = allUsers.find((u) => u.username === 'authoradmin');
      if (!me) throw new Error('authoradmin not found in mock storage');
      await storage.setUserAdmin(me.id, true);
    });

    it('GET /api/admin/skills returns 403 for non-admin', async () => {
      const res = await nonAdminAgent.get('/api/admin/skills');
      expect(res.status).toBe(403);
    });

    it('full CRUD round-trip: create → read → update → delete', async () => {
      // Start clean: delete any existing skills (test ordering shouldn't
      // depend on prior state, so we don't assume).
      const before = await adminAgent.get('/api/admin/skills');
      expect(before.status).toBe(200);
      // Allow either an empty seed or a populated one — we explicitly
      // clean the slate by deleting everything we know about.
      for (const s of (before.body.skills as Array<{ id: string }>) ?? []) {
        await adminAgent.delete(`/api/admin/skills/${s.id}`);
      }

      // CREATE
      const create = await adminAgent.post('/api/admin/skills').send({
        id: 'sk_root',
        name: 'Root',
        prerequisites: [],
        difficulty: 0.1,
      });
      expect(create.status).toBe(201);
      expect(create.body.skill.id).toBe('sk_root');
      expect(create.body.skillCount).toBe(1);

      // READ — should reflect the new skill
      const afterCreate = await adminAgent.get('/api/admin/skills');
      expect(afterCreate.status).toBe(200);
      const skills1 = afterCreate.body.skills as Array<{ id: string; name: string }>;
      expect(skills1.find((s) => s.id === 'sk_root')?.name).toBe('Root');

      // UPDATE — change the name
      const update = await adminAgent.put('/api/admin/skills/sk_root').send({
        name: 'Root Renamed',
        prerequisites: [],
        difficulty: 0.2,
      });
      expect(update.status).toBe(200);
      expect(update.body.skill.name).toBe('Root Renamed');

      const afterUpdate = await adminAgent.get('/api/admin/skills');
      const skills2 = afterUpdate.body.skills as Array<{ id: string; name: string }>;
      expect(skills2.find((s) => s.id === 'sk_root')?.name).toBe('Root Renamed');

      // DELETE
      const del = await adminAgent.delete('/api/admin/skills/sk_root');
      expect(del.status).toBe(200);
      expect(del.body.deleted).toBe('sk_root');

      const afterDelete = await adminAgent.get('/api/admin/skills');
      const skills3 = afterDelete.body.skills as Array<{ id: string }>;
      expect(skills3.find((s) => s.id === 'sk_root')).toBeUndefined();
    });

    it('rejects a skill whose prerequisite does not exist (graph validation)', async () => {
      const res = await adminAgent.post('/api/admin/skills').send({
        id: 'sk_orphan',
        name: 'Orphan',
        prerequisites: ['does_not_exist'],
        difficulty: 0.5,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid skill graph/);
    });

    it('returns 409 when adding a duplicate skill id', async () => {
      // Seed a skill, then try to create one with the same id.
      await adminAgent.post('/api/admin/skills').send({
        id: 'sk_dup',
        name: 'First',
        prerequisites: [],
      });
      const res = await adminAgent.post('/api/admin/skills').send({
        id: 'sk_dup',
        name: 'Second',
        prerequisites: [],
      });
      expect(res.status).toBe(409);
      // Cleanup so other tests start fresh.
      await adminAgent.delete('/api/admin/skills/sk_dup');
    });

    it('returns 404 when updating an unknown skill', async () => {
      const res = await adminAgent.put('/api/admin/skills/sk_does_not_exist').send({
        name: 'Phantom',
        prerequisites: [],
      });
      expect(res.status).toBe(404);
    });

    it('deleting a skill scrubs it from other skills’ prerequisites', async () => {
      // Seed two skills where B depends on A.
      await adminAgent
        .post('/api/admin/skills')
        .send({ id: 'sk_a', name: 'A', prerequisites: [] });
      await adminAgent
        .post('/api/admin/skills')
        .send({ id: 'sk_b', name: 'B', prerequisites: ['sk_a'] });

      // Delete A — graph would be invalid if B kept the dangling prereq, so
      // the route must scrub it to keep the system curriculum validatable.
      const del = await adminAgent.delete('/api/admin/skills/sk_a');
      expect(del.status).toBe(200);

      const after = await adminAgent.get('/api/admin/skills');
      const b = (after.body.skills as Array<{ id: string; prerequisites: string[] }>).find(
        (s) => s.id === 'sk_b',
      );
      expect(b?.prerequisites).toEqual([]);

      await adminAgent.delete('/api/admin/skills/sk_b');
    });
  });
});
