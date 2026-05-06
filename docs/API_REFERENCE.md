# API Reference — Noesis Core

> Generated 2026-04-10 from source code analysis of the full monorepo.
> Updated to include core engine event bridge, engine state persistence, and schema changes.

---

## Table of Contents

1. [REST Endpoints](#rest-endpoints)
2. [WebSocket API](#websocket-api)
3. [Core Engine Public API](#core-engine-public-api)
4. [Web SDK Public API](#web-sdk-public-api)
5. [Data Contracts Between Layers](#data-contracts-between-layers)
6. [Content Pack Integration Guide](#content-pack-integration-guide)

---

## REST Endpoints

### Authentication

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/auth/register` | None | 10/15min | Register a new user |
| POST | `/api/auth/login` | None | 10/15min | Login with username/password |
| POST | `/api/auth/logout` | Session | 100/15min | Logout and destroy session |
| GET | `/api/auth/me` | Session | 100/15min | Get current authenticated user |
| GET | `/api/auth/providers` | None | 100/15min | Check available auth providers |
| GET | `/api/auth/check-username/:username` | None | 10/1min | Check username availability |
| GET | `/api/auth/google` | None | 100/15min | Initiate Google OAuth flow |
| GET | `/api/auth/google/callback` | None | 100/15min | Google OAuth callback |

#### POST /api/auth/register

**Request:**
```typescript
{
  username: string;  // 3-50 chars, alphanumeric + _ -
  password: string;  // 8-128 chars, requires uppercase, lowercase, digit, special char
}
```

**Response (201):**
```typescript
{ id: number; username: string }
```

**Errors:** 400 (validation), 409 (username exists), 500

**Storage:** `storage.createUser()` — hashes password with bcrypt (12 rounds)

#### POST /api/auth/login

**Request:**
```typescript
{ username: string; password: string }
```

**Response (200):**
```typescript
{ id: number; username: string }
```

**Errors:** 401 (`AUTH_INVALID_CREDENTIALS`), 500

#### POST /api/auth/logout

**Response (200):**
```typescript
{ message: "Logged out successfully" }
```

Destroys session and clears `connect.sid` cookie.

#### GET /api/auth/me

**Response (200):**
```typescript
{ id: number; username: string }
```

**Errors:** 401 (not authenticated)

#### GET /api/auth/providers

**Response (200):**
```typescript
{ local: boolean; google: boolean }
```

#### GET /api/auth/check-username/:username

**Response (200):**
```typescript
{ available: boolean }
```

---

### Orchestration (LLM-powered)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/orchestration/next-step` | Session | 10/1min | Get personalized learning recommendation |
| POST | `/api/orchestration/engagement` | Session | 10/1min | Get engagement suggestion for low attention |

#### POST /api/orchestration/next-step

**Request:**
```typescript
{
  learnerState: {
    attention?: {
      score?: number;          // 0-1
      focusStability?: number; // 0-1
      cognitiveLoad?: number;  // 0-1
      status?: string;
    };
    mastery?: Array<{
      id: string;
      name: string;
      progress: number;  // 0-1
      status: string;
    }>;
    timestamp: number;  // required
  };
  context?: string;
  options?: {
    detail?: 'low' | 'medium' | 'high';
    format?: 'text' | 'json';
  };
}
```

**Response (200):**
```typescript
{
  suggestion: string;
  explanation?: string;
  resourceLinks: string[];
  type: 'llm-generated' | 'fallback';
  provider: string;
  model: string;
}
```

**Storage:** Creates a `recommendation` learning event via `storage.createLearningEvent()`

**Errors:** 400 (validation)

#### POST /api/orchestration/engagement

**Request:**
```typescript
{
  attentionScore?: number;            // 0-1, default 0.3
  context?: string;
  previousInterventions?: string[];
}
```

**Response (200):**
```typescript
{
  message: string;
  type: string;
  source: 'llm-generated' | 'fallback';
  provider: string;
  model: string;
}
```

**Storage:** Creates an `engagement` learning event

**Errors:** 400 (validation)

---

### Analytics

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/analytics/attention` | Session | 100/15min | Paginated attention events |
| GET | `/api/analytics/mastery` | Session | 100/15min | Paginated mastery events |
| GET | `/api/analytics/summary` | Session | 100/15min | Aggregated summary (date-windowed) |

All three endpoints accept `?startDate=&endDate=` (ISO 8601 datetime strings)
to limit which events feed into the response. The two list endpoints also
accept `?page=&limit=` (default 1 / 20; max limit 100).

#### GET /api/analytics/attention

**Query:** `?page=1&limit=20&startDate=…&endDate=…` (all optional)

**Response (200):**
```typescript
{
  items: LearningEvent[];   // current page slice
  page: number;
  limit: number;
  total: number;            // total events matching the date window
  totalPages: number;
  hasNextPage: boolean;
}
```

**Errors:** 400 (Zod) — `limit > 100`, `limit < 1`, malformed datetime.

#### GET /api/analytics/mastery

Same shape as `/api/analytics/attention` above.

#### GET /api/analytics/summary

**Query:** `?startDate=…&endDate=…` (no pagination — this endpoint aggregates).

**Response (200):**
```typescript
{
  userId: number;
  totalEvents: number;                // events in window
  eventCounts: {
    attention: number;
    mastery: number;
    recommendations: number;
    engagements: number;
  };
  averageAttention: number;           // 0-1
  recentEvents: LearningEvent[];      // last 10 IN WINDOW, newest first
  llmProvider: string;
  window: { startDate?: string; endDate?: string };  // echoes back what was applied
}
```

**Storage:** `storage.getLearningEventsByUserId()`, `storage.getLearningEventsByType()`. The date filter applies to every aggregation in the response.

---

### Learning Events

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/learning/events` | Session | 100/15min | Record a learning event |

#### POST /api/learning/events

**Request:**
```typescript
{
  type: string;           // e.g., 'attention', 'mastery', 'practice'
  data: {
    context?: string;
    attentionScore?: number;
    recommendation?: string;
    intervention?: string;
    objectiveId?: string;
    progress?: number;
    result?: number;
    [key: string]: string | number | boolean | undefined;  // catchall
  };
  timestamp?: string;     // ISO 8601 datetime, default: now
}
```

**Response (200):**
```typescript
{
  id: number;
  userId: number;
  type: string;
  data: object;
  timestamp: Date;
}
```

**Storage:** `storage.createLearningEvent()`

---

### Core Engine Events (Event Bridge)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/core/events` | Session | 100/15min | Store a single typed NoesisEvent |
| POST | `/api/core/events/batch` | Session | 100/15min | Store up to 100 NoesisEvents |
| GET | `/api/core/events` | Session | 100/15min | Retrieve all core events for current user |

#### POST /api/core/events

Stores a single canonical `NoesisEvent` from the core engine. The event is validated for required fields and type-specific fields, then stored inside a `learning_events` row with the full NoesisEvent in `data._coreEvent`.

**Request:** A valid `NoesisEvent` object. Required fields: `id` (string), `type` (string), `learnerId` (string), `timestamp` (number), `sessionId` (string). Type-specific fields are also validated (e.g., `skillId`, `correct` for practice events).

**Response (201):**
```typescript
{ id: number; coreEventId: string; type: string }
```

**Errors:** 400 (validation — missing fields, unknown event type)

**Storage:** `storage.createLearningEvent()` via `coreEventToLearningEvent()`

#### POST /api/core/events/batch

Stores 1-100 `NoesisEvent` objects. Each event is validated individually; valid events are stored and invalid ones are reported in the response.

**Request:** `NoesisEvent[]` (1-100 elements)

**Response (201):**
```typescript
{
  stored: number;
  results: Array<{ coreEventId: string; stored: boolean; error?: string }>
}
```

#### GET /api/core/events

Retrieves stored core events for the authenticated user, extracted from
`learning_events` rows and sorted by timestamp. Paginated + date-windowed
identically to the analytics list endpoints (Phase E6).

**Query:** `?page=1&limit=20&startDate=…&endDate=…` (all optional)

**Response (200):**
```typescript
{
  // Phase E6 pagination metadata
  page: number;
  limit: number;
  total: number;          // events matching the date window
  totalPages: number;
  hasNextPage: boolean;
  // Legacy fields, preserved for back-compat with pre-E6 clients
  count: number;          // === total
  events: NoesisEvent[];  // current page slice (=== items in the analytics shape)
}
```

**Storage:** `storage.getLearningEventsByUserId()` → `extractCoreEvents()`

---

### Engine State Persistence

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| PUT | `/api/engine/state` | Session | 100/15min | Save full engine state snapshot |
| GET | `/api/engine/state` | Session | 100/15min | Load saved engine state |

#### PUT /api/engine/state

Saves the JSON string from `engine.exportState()`, which contains BKT skill probabilities, FSRS memory states, transfer results, and the event log. Upserts by userId (one snapshot per user).

**Request:**
```typescript
{ state: string }  // non-empty JSON string from engine.exportState()
```

**Response (200):**
```typescript
{ saved: true }
```

**Storage:** `storage.saveEngineState()` (upserts into `engine_states` table)

#### GET /api/engine/state

Loads the previously saved engine state snapshot for the authenticated user.

**Response (200):**
```typescript
{ state: string }  // JSON string for engine.importState()
```

**Response (404):**
```typescript
{ error: "No engine state found" }
```

**Storage:** `storage.loadEngineState()`

---

### Curriculum

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/curriculum/skills` | Session | 100/15min | Upload (or replace) the user's skill graph |
| GET | `/api/curriculum/skills` | Session | 100/15min | Retrieve the saved skill graph |

#### POST /api/curriculum/skills

Stores a per-user skill graph + optional item mappings + optional transfer
tests. The payload is validated through `createSkillGraph().validate()`
before being persisted, so cycles and dangling prerequisites surface as 400
with structured `errors[]` instead of being persisted and crashing later
when the engine hydrates.

**Request:**
```typescript
{
  skills: Array<{
    id: string;
    name: string;
    description?: string;
    prerequisites: string[];
    encompassedSkills?: string[];
    category?: string;
    difficulty?: number;  // 0-1
  }>;
  itemMappings?: Array<{
    itemId: string;
    primarySkillId: string;
    secondarySkillIds: string[];
    difficulty: number;  // 0-1
  }>;
  transferTests?: Array<{
    id: string;
    skillId: string;
    transferType: 'near' | 'far';
    context: string;
    passingScore: number;  // 0-1
  }>;
}
```

**Response (201):**
```typescript
{
  saved: true;
  skillCount: number;
  itemCount: number;
  transferTestCount: number;
}
```

**Errors:**
- `400 Validation failed` — Zod validation rejected the payload shape.
- `400 Invalid skill graph` with structured `errors[]` — graph has cycles
  (`CYCLE_DETECTED`), missing prerequisites (`MISSING_PREREQUISITE`), etc.

**Storage:** `storage.saveCurriculum()` (upsert into `skill_graphs`).

#### GET /api/curriculum/skills

Returns the previously stored curriculum for the authenticated user.

**Response (200):** the same payload shape as the POST request body.

**Response (404):** `{ error: "No curriculum saved" }`.

---

### Core Engine (Server-Side)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/core/next-action` | Session | 100/15min | Server-side planner recommendation for the user |
| POST | `/api/core/practice` | Session | 100/15min | Process a practice attempt server-side; returns updated progress + next action |
| GET | `/api/core/progress` | Session | 100/15min | LearnerProgress for the user |

These endpoints are the thin-client surface — the server owns the engine
state per user, and the client just submits practice events and asks for the
next action. Each request goes through the per-user `EngineManager` (LRU
cache, hydrated from the saved snapshot or replayed from the event log).

#### GET /api/core/next-action

Returns the planner's next recommended action for the authenticated user.
Uses `DEFAULT_SERVER_SESSION_CONFIG` (mastery threshold 0.85, target 20
items, transfer tests not required by default — pilots can override later
via a query-param config).

**Response (200):** `SessionAction`
```typescript
{
  type: 'practice' | 'review' | 'diagnostic' | 'transfer_test' |
        'prerequisite_probe' | 'rest' |
        'concept_introduction' | 'application' | 'reflection';
  skillId?: string;
  itemId?: string;
  reason: string;
  priority: number;
}
```

#### POST /api/core/practice

Submits a practice attempt. The server builds a canonical `PracticeEvent`
through the engine's own clock + idGenerator (preserves the Phase A
determinism contract), processes it through `engine.processEvent`, persists
the canonical event into `learning_events` with the full event in
`data._coreEvent`, snapshots engine state via `engineManager.flush(userId)`,
and broadcasts a `learning-event` over the WebSocket to other tabs /
dashboards subscribed to the user.

**Request:**
```typescript
{
  skillId: string;
  itemId: string;
  correct: boolean;
  responseTimeMs: number;        // non-negative integer
  confidence?: number;           // 0-1
  errorCategory?: string;
  sessionId?: string;            // override server-managed session id
  stage?: 'practice' | 'application';  // canonical-loop stage; default 'practice'
}
```

**Response (201):**
```typescript
{
  event: PracticeEvent;          // the canonical event the server processed
  progress: LearnerProgress;     // updated progress AFTER the event
  nextAction: SessionAction;     // planner's next recommendation
}
```

#### GET /api/core/progress

**Response (200):** `LearnerProgress`
```typescript
{
  learnerId: string;
  totalSkills: number;
  masteredSkills: number;
  learningSkills: number;
  notStartedSkills: number;
  averageMastery: number;
  totalEvents: number;
}
```

---

### System & Infrastructure

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/llm/status` | None | 100/15min | Get LLM provider status |
| GET | `/api/csrf-token` | None | 100/15min | Get fresh CSRF token |
| GET | `/api/docs/openapi.json` | None | None | OpenAPI 3.0 spec (JSON) |
| GET | `/api/docs` | None | None | Swagger UI documentation |
| GET | `/api/performance/stats` | Internal | None | Per-endpoint perf stats |
| GET | `/health/live` | None | None | Liveness probe |
| GET | `/health/ready` | None | None | Readiness probe |
| GET | `/health` | Internal | None | Full health check |
| GET | `/health/metrics` | Internal | None | Memory/CPU metrics |

#### GET /api/llm/status

**Response (200):**
```typescript
{
  activeProvider: string;
  configuredProviders: string[];
  hasLLMProvider: boolean;
}
```

#### GET /health/live

**Response (200):**
```typescript
{ status: 'ok'; timestamp: string }
```

#### GET /health/ready

**Response (200 or 503):**
```typescript
{ ready: boolean; checks: { llm: boolean } }
```

#### GET /health

**Response (200/503):**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;        // seconds
  version: string;
  checks: {
    llm: { status: 'pass' | 'warn' | 'fail'; message: string };
    memory: { status: 'pass' | 'warn' | 'fail'; message: string };
    eventLoop: { status: 'pass' | 'warn' | 'fail'; message: string; responseTime: number };
  };
}
```

---

### Rate Limiting Tiers

| Tier | Window | Max Requests | Applied To |
|------|--------|--------------|------------|
| General API | 15 min | 100 | All `/api/*` |
| LLM | 1 min | 10 | `/api/orchestration/*` |
| Auth | 15 min | 10 (skip successful) | `/api/auth/login`, `/api/auth/register` |
| Username check | 1 min | 10 | `/api/auth/check-username` |

---

### CSRF Protection

Enabled by default (disable with `DISABLE_CSRF=true` in development).

- State-changing requests (POST, PUT, DELETE) require a valid CSRF token
- Excluded paths: `/api/csrf-token`, `/api/auth/login`, `/api/auth/register`
- Token sources (checked in order): `X-CSRF-Token` header, `_csrf` body field, `_csrf` query param
- Token is also set in `XSRF-TOKEN` cookie (readable by client JS)

---

## WebSocket API

**Endpoint:** `ws://<host>:<port>/ws`

**Authentication:** Auto-authenticates from session cookie on upgrade. Can also authenticate via `authenticate` message.

**Max clients:** 1000 (configurable)

**Heartbeat:** Server pings every 30s, clients timeout after 60s of no pong.

### Client → Server Messages

All messages follow format: `{ type: string; payload: unknown; timestamp: number }`

| Type | Payload | Description |
|------|---------|-------------|
| `subscribe` | `string[]` | Subscribe to channels |
| `unsubscribe` | `string[]` | Unsubscribe from channels |
| `ping` | `null` | Client heartbeat |
| `attention-update` | `AttentionUpdate` | Report attention data |
| `authenticate` | `{ sessionId?: string; userId?: number }` | Authenticate connection |

**AttentionUpdate payload:**
```typescript
{ score: number; focusStability: number; cognitiveLoad: number; userId?: number }
```

### Server → Client Messages

| Type | Payload | Description |
|------|---------|-------------|
| `connected` | `{ message, subscriptions, authenticated, userId }` | Welcome on connect |
| `pong` | `null` | Heartbeat response |
| `subscribed` | `{ channels, current }` | Subscription confirmed |
| `unsubscribed` | `{ channels, current }` | Unsubscription confirmed |
| `authenticated` | `{ userId, method }` | Auth success |
| `auth-error` | `{ error }` | Auth failure |
| `attention-update` | `AttentionUpdate` | Broadcast attention data |
| `learning-event` | `LearningEventNotification` | Broadcast learning event |
| `recommendation` | `{ suggestion, type }` | Targeted recommendation to user |

### Default Subscriptions

New connections auto-subscribe to: `attention`, `learning-events`

### Broadcast Channels

| Channel | Events | Target |
|---------|--------|--------|
| `attention` | `attention-update` | All subscribed (excludes sender) |
| `learning-events` | `learning-event` | All subscribed (excludes event owner) |
| `recommendations` | `recommendation` | Specific user only |

### When the server emits `learning-event`

After Phase E5 every server-side mutation that persists a core event also
broadcasts a `learning-event` with `eventType` set to the canonical event
type and `data` carrying enough context for a dashboard to refresh:

| Origin route | `eventType` | `data` keys |
|---|---|---|
| `POST /api/core/events` | event's `type` (`practice`/`diagnostic`/...) | `{ coreEventId }` |
| `POST /api/core/events/batch` | per-event `type` (one broadcast per stored event) | `{ coreEventId }` |
| `POST /api/core/practice` | `'practice'` | `{ coreEventId, skillId, correct }` |

Validation failures (e.g., a malformed event in a batch) do not broadcast.

---

## Core Engine Public API

**Package:** `@noesis-edu/core` (zero dependencies, runs anywhere)

### Factory Functions

After Phase A every public engine factory **requires** an explicit clock
and idGenerator. Forgetting them throws at construction (or earlier, at the
TypeScript type-checker). Two convenience factories are provided so most
consumers never need to wire the injection by hand:

```typescript
// Production path: opts in to system clock + crypto.randomUUID().
// Non-replayable by design — see createDeterministicEngine when you want replay.
createSystemEngine(
  skillGraph: SkillGraph,
  config?: CoreEngineConfig,
): NoesisCoreEngineImpl

// Replay/test path: fixed clock at startTime, counter-based ids (evt-000001, ...).
// Identical inputs produce byte-identical exportState() output.
createDeterministicEngine(
  skillGraph: SkillGraph,
  config?: CoreEngineConfig,
  startTime?: number,
): NoesisCoreEngineImpl

// Lower-level: use this when you have your own clock + idGenerator
// (e.g., a server clock + a request-scoped UUID source).
createNoesisCoreEngine(
  skillGraph: SkillGraph,
  config: CoreEngineConfig,
  clock: ClockFn,        // required
  idGenerator: IdGeneratorFn,  // required
): NoesisCoreEngineImpl

// Create skill graph from skill definitions
createSkillGraph(skills: Skill[]): SkillGraph

// Create event factory context. clock + idGenerator are required.
createEventFactoryContext(
  clock: ClockFn,
  idGenerator: IdGeneratorFn,
): EventFactoryContext

// Runtime guards — throw if the argument is not a function. Useful for
// JS callers bypassing TypeScript's required-parameter check.
requireClock(clock: ClockFn | undefined): ClockFn
requireIdGenerator(idGenerator: IdGeneratorFn | undefined): IdGeneratorFn
```

### NoesisCoreEngineImpl Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `processEvent(event)` | `void` | Process any NoesisEvent, updates all internal state |
| `getLearnerModel(learnerId)` | `LearnerModel \| undefined` | Get current learner model |
| `getOrCreateLearnerModel(learnerId)` | `LearnerModel` | Get or initialize learner model |
| `getMemoryStates(learnerId)` | `MemoryState[]` | Get FSRS memory states |
| `getNextAction(learnerId, config)` | `SessionAction` | Get next recommended learning action |
| `planSession(learnerId, config)` | `SessionAction[]` | Plan a complete session |
| `registerTransferTests(tests)` | `void` | Register transfer test definitions |
| `registerItemMappings(mappings)` | `void` | Register item-skill mappings for diagnostics |
| `generateDiagnostic(maxItems)` | `string[]` | Generate diagnostic item IDs |
| `exportState()` | `string` | Serialize all state to JSON (snapshot v1.3 includes NALS + stage history) |
| `importState(data)` | `void` | Restore state from JSON; tolerates pre-1.2/1.3 snapshots |
| `replayEvents(events)` | `void` | Clear state and replay event log |
| `getEventLog()` | `NoesisEvent[]` | Get recorded event log |
| `getTransferResults()` | `TransferTestResult[]` | Get transfer test results |
| `isSkillUnlocked(skillId)` | `boolean` | Check transfer gate status |
| `getPendingTransferTests(skillId)` | `TransferTest[]` | Get pending tests for skill |
| `getLearnerProgress(learnerId)` | `LearnerProgress` | Get progress summary |
| `generateEventId()` | `string` | Generate new event ID |
| `getCurrentTime()` | `number` | Get time from injected clock |
| `getCognitiveState(learnerId)` | `CognitiveStateVector \| undefined` | Most recent NALS vector for the learner (Phase C2) |
| `getCognitiveStateHistory(learnerId)` | `CognitiveStateVector[]` | Full per-learner timeline (Phase C2) |
| `getStageHistory(learnerId, skillId)` | `Set<CanonicalStage>` | Canonical-loop stages recorded for the skill (Phase C3) |
| `setLearningSpeed(learnerId, skillId, speed)` | `void` | Per-user-per-skill FSRS interval multiplier (clamped 0.5–2.0) |
| `getLearningSpeed(learnerId, skillId)` | `number` | Read the multiplier (default 1.0) |
| `calibrateLearningSpeed(learnerId, skillId, minEvents?)` | `number` | Suggest a multiplier from practice history |
| `getEffectiveMastery(learnerId, skillId)` | `number` | min(ownMastery, min over transitive prerequisites) |

### Readonly Properties

| Property | Type | Description |
|----------|------|-------------|
| `graph` | `SkillGraph` | Skill graph (DAG) |
| `learnerEngine` | `LearnerModelEngine` | BKT engine |
| `memoryScheduler` | `MemoryScheduler` | FSRS scheduler |
| `sessionPlanner` | `SessionPlanner` | Session planner |
| `transferGate` | `TransferGate` | Transfer test gate |
| `diagnosticEngine` | `DiagnosticEngine` | Diagnostic engine |

### Event Factory Functions

```typescript
createPracticeEvent(ctx, learnerId, sessionId, skillId, itemId, correct, responseTimeMs, options?)
//   options.stage: 'practice' | 'application' (canonical-loop stage; default 'practice')
//   options.confidence?: number; options.errorCategory?: string

createDiagnosticEvent(ctx, learnerId, sessionId, skillsAssessed, results)
createTransferTestEvent(ctx, learnerId, sessionId, testId, skillId, transferType, score, passed)
createSessionStartEvent(ctx, learnerId, sessionId, config)
createSessionEndEvent(ctx, learnerId, sessionId, summary)

// Phase C — NALS Cognitive-State Vector
createCognitiveStateEvent(ctx, learnerId, sessionId, vector: CognitiveStateVector)

// Phase C — canonical-loop stages without a practice attempt
createStageCompletedEvent(
  ctx, learnerId, sessionId, skillId,
  stage: 'concept_introduction' | 'reflection',
  options?: { notes?: string }
)

// Implicit credit (FIRe-style); usually generated by the engine, not the consumer
createImplicitCreditEvent(ctx, learnerId, sessionId, sourceSkillId, targetSkillId, creditFraction, nextReviewShiftMs)
```

### Key Types

```typescript
interface Skill {
  id: string; name: string; description?: string;
  prerequisites: string[];
  encompassedSkills?: string[];   // FIRe-style — practicing this skill gives
                                  // implicit review credit to encompassed skills
  category?: string; difficulty?: number;
}

interface SessionConfig {
  maxDurationMinutes: number; targetItems: number;
  masteryThreshold: number; enforceSpacedRetrieval: boolean;
  requireTransferTests: boolean;
  enableKnockOutReviews?: boolean;             // Phase 3 — greedy set-cover review selection
  prerequisiteRevalidationEnabled?: boolean;   // Phase 4 — probe decayed prerequisites
  prerequisiteRevalidationThreshold?: number;  // default 0.7
  enforceCanonicalLoop?: boolean;              // Phase C3 — gate on the 5-stage loop
}

interface SessionAction {
  type:
    | 'practice' | 'review' | 'diagnostic' | 'transfer_test'
    | 'prerequisite_probe' | 'rest'
    // Phase C3 — canonical 5-stage loop
    | 'concept_introduction' | 'application' | 'reflection';
  skillId?: string; itemId?: string; reason: string; priority: number;
}

interface LearnerProgress {
  learnerId: string; totalSkills: number; masteredSkills: number;
  learningSkills: number; notStartedSkills: number;
  averageMastery: number; totalEvents: number;
}

// Phase C1 — NALS Cognitive-State Vector
interface CognitiveStateMeasurement {
  value: number;          // 0-1
  confidence: number;     // 0-1
  timestamp: number;      // Unix ms
}
interface CognitiveStateVector {
  attention: CognitiveStateMeasurement;       // A
  recallStrength: CognitiveStateMeasurement;  // R
  affect: CognitiveStateMeasurement;          // F
}

// Phase C3 — canonical-loop stage taxonomy
type CanonicalStage =
  | 'concept_introduction' | 'practice' | 'application' | 'reflection';

// Phase C — extended PracticeEvent (back-compat: stage defaults to 'practice')
interface PracticeEvent extends BaseEvent {
  type: 'practice';
  skillId: string; itemId: string;
  correct: boolean; responseTimeMs: number;
  confidence?: number; errorCategory?: string;
  stage?: 'practice' | 'application';
}

// Phase C — non-practice canonical-loop stages
interface StageCompletedEvent extends BaseEvent {
  type: 'stage_completed';
  skillId: string;
  stage: 'concept_introduction' | 'reflection';
  notes?: string;
}

interface CognitiveStateEvent extends BaseEvent {
  type: 'cognitive_state';
  vector: CognitiveStateVector;
}
```

---

## Web SDK Public API

**Package:** `@noesis/sdk-web`

### NoesisSDK

```typescript
const sdk = new NoesisSDK(options?: NoesisSDKOptions);
```

**Options:**
```typescript
interface NoesisSDKOptions {
  apiKey?: string;
  modules?: ('attention' | 'mastery' | 'orchestration' | 'core')[];
  debug?: boolean;
  attentionOptions?: AttentionTrackingOptions;
  masteryOptions?: MasteryOptions;
  coreConfig?: CoreAdapterConfig;  // omits 'debug'
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `attention` | `AttentionTracker` | Attention/gaze tracking module |
| `mastery` | `MasteryTracker` | **@deprecated** — Legacy mastery tracker; use `core` instead |
| `orchestration` | `Orchestrator` | LLM orchestration client |
| `core` | `CoreEngineAdapter \| null` | Core engine bridge (canonical mastery via BKT+FSRS) |

> **Note:** `recordPractice()` syncs events to both the core engine and the legacy `MasteryTracker` for backward compatibility. New code should use `core` exclusively.

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `initializeCore(config)` | `void` | Initialize core learning engine |
| `recordPractice(skillId, itemId, correct, responseTimeMs, options?)` | `NoesisEvent \| null` | Record practice through core engine |
| `getNextAction()` | `SessionAction \| null` | Get next recommended action |
| `getEventLog()` | `NoesisEvent[]` | Get core event log |
| `exportEventLog()` | `string` | Export events as JSON |
| `updateSkillGraph(skills)` | `void` | Update skill graph |
| `isInitialized()` | `boolean` | Always true (SDK initializes in constructor) |
| `getActiveModules()` | `ModuleType[]` | List active modules |
| `isModuleActive(module)` | `boolean` | Check if module is active |
| `isCoreInitialized()` | `boolean` | Check if core engine is initialized |
| `getLearnerState()` | `LearnerState` | Get combined attention + mastery + core state |

### CoreEngineAdapter

```typescript
const adapter = new CoreEngineAdapter(config: CoreAdapterConfig);
```

`CoreAdapterConfig` accepts an optional `clock` and `idGenerator`. Both
default to `Date.now()` / `Math.random()`-style at the SDK boundary, but
when at least one is omitted the adapter emits a one-time
`console.warn` so the consumer is aware that replay determinism is no
longer guaranteed for events produced via this adapter. Set
`suppressNonDeterminismWarning: true` to silence the warning, or inject
both for full determinism.

```typescript
interface CoreAdapterConfig {
  learnerId: string;
  debug?: boolean;
  clock?: ClockFn;          // recommended — see warning above
  idGenerator?: IdGeneratorFn;
  skills?: Skill[];
  sessionConfig?: Partial<SessionConfig>;
  suppressNonDeterminismWarning?: boolean;
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `startSession()` | `SessionEvent` | Start a learning session |
| `endSession(summary)` | `SessionEvent` | End current session |
| `recordPractice(skillId, itemId, correct, responseTimeMs, options?)` | `PracticeEvent` | Record practice event |
| `recordDiagnostic(skillsAssessed, results)` | `DiagnosticEvent` | Record diagnostic results |
| `getNextAction()` | `SessionAction` | Get next recommended action |
| `planSession()` | `SessionAction[]` | Plan complete session |
| `getLearnerProgress()` | `LearnerProgress` | Get progress summary |
| `getSkillMastery(skillId)` | `number` | Get mastery probability (0-1) |
| `getUnmasteredSkills(threshold?)` | `string[]` | Get skills below threshold |
| `getEventLog()` | `NoesisEvent[]` | Get event log (copy) |
| `exportEventLog()` | `string` | Export events as JSON |
| `clearEventLog()` | `void` | Clear event log |
| `getCoreEngine()` | `NoesisCoreEngineImpl` | Get underlying engine |
| `getSkillGraph()` | `SkillGraph` | Get skill graph |
| `updateSkillGraph(skills)` | `void` | Replace skill graph (re-creates engine, preserves state) |
| `getSessionId()` | `string` | Get current session ID |
| `persistTo(transport, options?)` | `void` | **Phase B** — install autosave through a `PersistenceTransport` (debounced; default 1000 ms) |
| `hydrate(transport)` | `Promise<boolean>` | **Phase B** — load prior state via `transport.load()`; returns `false` if nothing was stored |
| `flush()` | `Promise<void>` | **Phase B** — force an immediate save (use on `beforeunload`) |
| `stopPersistence()` | `void` | **Phase B** — cancel pending debounce + uninstall transport |

#### Persistence transports (Phase B)

```typescript
interface PersistenceTransport {
  save(state: string): Promise<void>;
  load(): Promise<string | null>;
}

interface PersistOptions {
  autosaveDebounceMs?: number;   // default 1000; 0 = no coalescing
  onError?: (error: unknown) => void;
}

// Backed by window.localStorage. Single-device only.
localStorageTransport(key: string): PersistenceTransport

// Backed by HTTP. Wire format matches apps/server's PUT/GET /api/engine/state:
//   PUT body { state }, GET returns { state } or 404.
httpTransport(
  url: string,
  options?: { csrfToken?: string; fetchImpl?: typeof fetch }
): PersistenceTransport
```

---

## Attention Adapters (Phase D)

**Package:** `@noesis/adapters-attention-web`

After Phase D, the package's default `AttentionTracker` symbol resolves to
`SimulatedAttentionTracker` — the explicit-user-signal adapter that emits
canonical `CognitiveStateEvent`s. The legacy webcam-driven tracker is
re-exported as `WebGazerAttentionTracker` and is opt-in only.

```typescript
import {
  AttentionTracker,                // === SimulatedAttentionTracker
  SimulatedAttentionTracker,
  WebGazerAttentionTracker,        // legacy webcam path; opt-in only
} from '@noesis/adapters-attention-web';
```

### SimulatedAttentionTracker

```typescript
interface SimulatedAttentionOptions extends AttentionTrackingOptions {
  eventContext?: EventFactoryContext;
  onCognitiveStateEvent?: (event: CognitiveStateEvent) => void;
  learnerId?: string;
  sessionId?: string;
  // Override the default state → vector mappings (focused/drifting/break).
  mappings?: Partial<{
    focused: { attention: {value, confidence}; recallStrength: {value, confidence}; affect: {value, confidence} };
    drifting: { ...same shape };
    break: { ...same shape };
  }>;
}

type SimulatedAttentionState = 'focused' | 'drifting' | 'break';
```

The tracker mirrors the legacy `AttentionTracker` surface
(`startTracking` / `stopTracking` / `onAttentionChange` /
`offAttentionChange` / `getCurrentData` / `isUsingRealGazeTracking` /
`getCalibrationProgress`) so it slots into `NoesisSDK` without code
changes upstream. The single new method is:

| Method | Description |
|---|---|
| `recordState(state: SimulatedAttentionState)` | Record a user signal. Updates internal `AttentionData`, fires `onAttentionChange` callbacks, and (when both `eventContext` + `onCognitiveStateEvent` are provided) emits a canonical `CognitiveStateEvent` through the sink. |

Default vector mappings:

| Signal | attention.value | attention.confidence | recallStrength.value | affect.value |
|---|---|---|---|---|
| `focused` | 1.0 | 1.0 | 0.8 | 0.7 |
| `drifting` | 0.3 | 1.0 | 0.5 | 0.4 |
| `break` | 0.0 | 1.0 | 0.5 | 0.6 |

### WebGazer opt-in

The web-demo's `useAttentionTracking` hook reads `import.meta.env.VITE_ENABLE_REAL_GAZE_TRACKING`
and only constructs `WebGazerAttentionTracker` when the value is exactly the string `'true'`.
Anything else — unset, `'false'`, `'TRUE'`, `'yes'`, `'1'` — keeps the simulated default.

The server side mirrors the rule: `apps/server/security-headers.ts`
checks `process.env.ENABLE_REAL_GAZE_TRACKING === 'true'` before relaxing
helmet's `Cross-Origin-Embedder-Policy` (otherwise the standard
`require-corp` header is emitted).

---

## Data Contracts Between Layers

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Pilot Application                      │
│               (e.g., noesis-pilot)                       │
└──────────┬──────────────────────────────────┬───────────┘
           │ imports                          │ HTTP / WS
           ▼                                  ▼
┌──────────────────┐              ┌──────────────────────┐
│   sdk-web        │              │   apps/server        │
│  (NoesisSDK)     │──HTTP/WS──▶ │  (Express + WS)      │
│                  │              │                      │
│  ┌────────────┐  │              │  ┌────────────────┐  │
│  │ CoreEngine │  │              │  │ IStorage       │  │
│  │ Adapter    │  │              │  │ (Mem/PG/SQLite)│  │
│  └─────┬──────┘  │              │  └────────────────┘  │
│        │imports   │              │                      │
│        ▼         │              │                      │
│  ┌────────────┐  │              │                      │
│  │ @noesis-   │  │              │                      │
│  │ edu/core   │  │              │                      │
│  └────────────┘  │              │                      │
└──────────────────┘              └──────────────────────┘
```

### SDK → Server (HTTP)

| SDK Action | HTTP Request | Server Handler |
|------------|--------------|----------------|
| Record learning event | `POST /api/learning/events` | `storage.createLearningEvent()` |
| Store core event | `POST /api/core/events` | Event bridge → `storage.createLearningEvent()` + WS broadcast |
| Store core events batch | `POST /api/core/events/batch` | Event bridge → batch insert + WS broadcast per event |
| Retrieve core events | `GET /api/core/events` | `extractCoreEvents()` (paginated + date-windowed) |
| Save engine state | `PUT /api/engine/state` | `storage.saveEngineState()` |
| Load engine state | `GET /api/engine/state` | `storage.loadEngineState()` |
| Upload curriculum (Phase E2) | `POST /api/curriculum/skills` | `storage.saveCurriculum()` |
| Load curriculum (Phase E2) | `GET /api/curriculum/skills` | `storage.loadCurriculum()` |
| Get next action (Phase E3) | `GET /api/core/next-action` | `engineManager.getEngineForUser()` → planner |
| Submit practice (Phase E4) | `POST /api/core/practice` | engine → `processEvent` → flush → broadcast |
| Get progress (Phase E5) | `GET /api/core/progress` | `engine.getLearnerProgress()` |
| Get recommendation | `POST /api/orchestration/next-step` | `llm.getRecommendation()` |
| Get engagement tip | `POST /api/orchestration/engagement` | `llm.getEngagementSuggestion()` |
| Get analytics | `GET /api/analytics/summary` | `storage.getLearningEventsByUserId()` (date-windowed) |

### SDK → Server (WebSocket)

| SDK Action | WS Message Type | Server Behavior |
|------------|-----------------|-----------------|
| Report attention | `attention-update` | Broadcasts to `attention` channel |
| Authenticate | `authenticate` | Verifies session, sets userId |
| Subscribe | `subscribe` | Adds client to channels |

### Core Engine Input Events

The core engine processes these canonical event types:

| Event Type | Key Fields | Effect |
|------------|------------|--------|
| `practice` | skillId, correct, responseTimeMs, optional `stage` | Updates BKT model + FSRS state; records stage in `stageHistory` (Phase C3) |
| `diagnostic` | results[{skillId, score}] | Initializes BKT from diagnostic scores |
| `transfer_test` | testId, skillId, score, passed | Records transfer test result |
| `session_start` | config | Logged (no state change) |
| `session_end` | summary | Logged (no state change) |
| `cognitive_state` | vector: { attention, recallStrength, affect } | Appends to per-learner NALS timeline (Phase C2) |
| `stage_completed` | skillId, stage: 'concept_introduction' \| 'reflection' | Records canonical-loop stage (Phase C3) |
| `implicit_credit` | sourceSkillId, targetSkillId, creditFraction, nextReviewShiftMs | Generated by the engine when an encompassing skill is practiced |

### Content Pack Requirements

A content pack (e.g., noesis-math) must provide:

```typescript
// 1. Skill definitions (DAG)
const skills: Skill[] = [
  {
    id: 'addition',
    name: 'Addition',
    prerequisites: [],
    category: 'arithmetic',
    difficulty: 0.2,
  },
  {
    id: 'multiplication',
    name: 'Multiplication',
    prerequisites: ['addition'],
    category: 'arithmetic',
    difficulty: 0.4,
  },
  // ...
];

// 2. Item-skill mappings (for diagnostics)
const itemMappings: ItemSkillMapping[] = [
  {
    itemId: 'q001',
    primarySkillId: 'addition',
    secondarySkillIds: [],
    difficulty: 0.3,
  },
  // ...
];

// 3. Transfer tests (optional, for gating)
const transferTests: TransferTest[] = [
  {
    id: 'tt-add-near',
    skillId: 'addition',
    transferType: 'near',
    context: 'Word problems involving addition',
    passingScore: 0.8,
  },
  // ...
];

// 4. Initialize the engine
const engine = createNoesisCoreEngine(createSkillGraph(skills));
engine.registerItemMappings(itemMappings);
engine.registerTransferTests(transferTests);
```

---

## Storage Interface

The server uses `IStorage` with three implementations:

```typescript
interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(username: string, password: string): Promise<User | null>;

  // Google OAuth
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createGoogleUser(profile: GoogleUserProfile): Promise<User>;

  // Learning events
  createLearningEvent(event: InsertLearningEvent): Promise<LearningEvent>;
  getLearningEvent(id: number): Promise<LearningEvent | undefined>;
  getLearningEventsByUserId(userId: number): Promise<LearningEvent[]>;
  getLearningEventsByType(type: string): Promise<LearningEvent[]>;

  // Core engine state persistence
  saveEngineState(userId: number, state: string): Promise<void>;
  loadEngineState(userId: number): Promise<string | null>;
}
```

| Implementation | Backend | When Used |
|---------------|---------|-----------|
| `MemStorage` | In-memory Maps | No `DATABASE_URL` or `SQLITE_PATH` |
| `DatabaseStorage` | PostgreSQL (Drizzle ORM) | `DATABASE_URL` set |
| `SqliteStorage` | SQLite (better-sqlite3) | `SQLITE_PATH` set (highest priority) |

All three implementations now support the full `IStorage` interface including Google OAuth and engine state persistence.

**SQLite-only extra method** (not in `IStorage`):
- `linkGoogleAccount(userId, googleId, email)` — link Google to existing user

---

## Database Schema

### PostgreSQL (shared/schema.ts — Drizzle)

| Table | Columns |
|-------|---------|
| `users` | id (serial PK), username (text unique), password (text, nullable), email (text), google_id (text unique), display_name (text), avatar_url (text) |
| `learning_events` | id (serial PK), user_id (FK→users CASCADE), type (text), data (jsonb), timestamp |
| `learning_objectives` | id (serial PK), objective_id (text unique), name (text), description (text) |
| `mastery_progress` | id (serial PK), user_id (FK→users CASCADE), objective_id (FK→learning_objectives CASCADE), progress (jsonb), last_updated |
| `engine_states` | id (serial PK), user_id (FK→users CASCADE, unique), state (text), updated_at |

### SQLite (sqlite-storage.ts)

Schema matches PostgreSQL with these SQLite-specific differences:

| Table | SQLite Differences |
|-------|-------------------|
| `users` | Same columns. Password nullable. google_id UNIQUE. |
| `learning_events` | data stored as TEXT (JSON string) instead of JSONB |
| `learning_objectives` | Same structure |
| `mastery_progress` | progress stored as TEXT instead of JSONB |
| `engine_states` | Same structure; user_id has UNIQUE constraint for upsert support |

---

## Error Response Format

```typescript
{
  error: string;       // Human-readable message
  code?: string;       // Machine-readable error code
  details?: object;    // Additional context
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid username or password |
| `AUTH_SESSION_EXPIRED` | 401 | Session expired |
| `VALIDATION_FAILED` | 400 | Request validation failed |
| `VALIDATION_PASSWORD_WEAK` | 400 | Password complexity requirements not met |
| `VALIDATION_USERNAME_INVALID` | 400 | Username format/length invalid |
| `VALIDATION_MISSING_FIELD` | 400 | Required field missing |
| `RESOURCE_ALREADY_EXISTS` | 409 | Username already taken |
| `NOT_FOUND` | 404 | Resource not found |
| `FORBIDDEN` | 403 | Access denied |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Common Validation Schemas

The server exports reusable Zod schemas from
`apps/server/middleware/validation.ts` so route handlers and tests share a
single source of truth for pagination, IDs, and date ranges.

### Pagination

Used by `/api/analytics/{attention,mastery}` and `/api/core/events`.

```typescript
{
  page: number;    // positive integer; default 1
  limit: number;   // positive integer; max 100; default 20
}
```

### ID parameter

```typescript
{
  id: number;      // positive integer
}
```

### Date range

Used by every paginated list endpoint (above) and by `/api/analytics/summary`.

```typescript
{
  startDate?: string;   // ISO 8601 datetime (inclusive)
  endDate?: string;     // ISO 8601 datetime (inclusive)
}
```

The combined query schema for paginated + date-windowed endpoints is
`commonSchemas.pagination.merge(commonSchemas.dateRange)`.
