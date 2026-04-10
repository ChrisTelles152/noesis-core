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
| GET | `/api/analytics/attention` | Session | 100/15min | Get attention tracking events |
| GET | `/api/analytics/mastery` | Session | 100/15min | Get mastery tracking events |
| GET | `/api/analytics/summary` | Session | 100/15min | Get aggregated analytics summary |

#### GET /api/analytics/attention

**Response (200):** `LearningEvent[]` — filtered to authenticated user's attention events

#### GET /api/analytics/mastery

**Response (200):** `LearningEvent[]` — filtered to authenticated user's mastery events

#### GET /api/analytics/summary

**Response (200):**
```typescript
{
  userId: number;
  totalEvents: number;
  eventCounts: {
    attention: number;
    mastery: number;
    recommendations: number;
    engagements: number;
  };
  averageAttention: number;           // 0-1
  recentEvents: LearningEvent[];      // last 10, newest first
  llmProvider: string;
}
```

**Storage:** `storage.getLearningEventsByUserId()`, `storage.getLearningEventsByType()`

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

Retrieves all stored core events for the authenticated user, extracted from `learning_events` rows and sorted by timestamp.

**Response (200):**
```typescript
{ count: number; events: NoesisEvent[] }
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

---

## Core Engine Public API

**Package:** `@noesis-edu/core` (zero dependencies, runs anywhere)

### Factory Functions

```typescript
// Create engine with skill graph
createNoesisCoreEngine(
  skillGraph: SkillGraph,
  config?: CoreEngineConfig,
  clock?: ClockFn,
  idGenerator?: IdGeneratorFn
): NoesisCoreEngineImpl

// Create deterministic engine for testing/replay
createDeterministicEngine(
  skillGraph: SkillGraph,
  config?: CoreEngineConfig,
  startTime?: number
): NoesisCoreEngineImpl

// Create skill graph from skill definitions
createSkillGraph(skills: Skill[]): SkillGraph

// Create event factory context
createEventFactoryContext(clock?: ClockFn, idGenerator?: IdGeneratorFn): EventFactoryContext
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
| `exportState()` | `string` | Serialize all state to JSON |
| `importState(data)` | `void` | Restore state from JSON |
| `replayEvents(events)` | `void` | Clear state and replay event log |
| `getEventLog()` | `NoesisEvent[]` | Get recorded event log |
| `getTransferResults()` | `TransferTestResult[]` | Get transfer test results |
| `isSkillUnlocked(skillId)` | `boolean` | Check transfer gate status |
| `getPendingTransferTests(skillId)` | `TransferTest[]` | Get pending tests for skill |
| `getLearnerProgress(learnerId)` | `LearnerProgress` | Get progress summary |
| `generateEventId()` | `string` | Generate new event ID |
| `getCurrentTime()` | `number` | Get time from injected clock |

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
createDiagnosticEvent(ctx, learnerId, sessionId, skillsAssessed, results)
createTransferTestEvent(ctx, learnerId, sessionId, testId, skillId, transferType, score, passed)
createSessionStartEvent(ctx, learnerId, sessionId, config)
createSessionEndEvent(ctx, learnerId, sessionId, summary)
```

### Key Types

```typescript
interface Skill {
  id: string; name: string; description?: string;
  prerequisites: string[]; category?: string; difficulty?: number;
}

interface SessionConfig {
  maxDurationMinutes: number; targetItems: number;
  masteryThreshold: number; enforceSpacedRetrieval: boolean;
  requireTransferTests: boolean;
}

interface SessionAction {
  type: 'practice' | 'review' | 'diagnostic' | 'transfer_test' | 'rest';
  skillId?: string; itemId?: string; reason: string; priority: number;
}

interface LearnerProgress {
  learnerId: string; totalSkills: number; masteredSkills: number;
  learningSkills: number; notStartedSkills: number;
  averageMastery: number; totalEvents: number;
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
| Store core event | `POST /api/core/events` | Event bridge → `storage.createLearningEvent()` |
| Store core events batch | `POST /api/core/events/batch` | Event bridge → batch insert |
| Retrieve core events | `GET /api/core/events` | `extractCoreEvents()` from learning events |
| Save engine state | `PUT /api/engine/state` | `storage.saveEngineState()` |
| Load engine state | `GET /api/engine/state` | `storage.loadEngineState()` |
| Get recommendation | `POST /api/orchestration/next-step` | `llm.getRecommendation()` |
| Get engagement tip | `POST /api/orchestration/engagement` | `llm.getEngagementSuggestion()` |
| Get analytics | `GET /api/analytics/summary` | `storage.getLearningEventsByUserId()` |

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
| `practice` | skillId, correct, responseTimeMs | Updates BKT model + FSRS state |
| `diagnostic` | results[{skillId, score}] | Initializes BKT from diagnostic scores |
| `transfer_test` | testId, skillId, score, passed | Records transfer test result |
| `session_start` | config | Logged (no state change) |
| `session_end` | summary | Logged (no state change) |

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
