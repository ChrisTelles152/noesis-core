# API Gap Analysis — Noesis Core

> Generated 2026-04-10 from source code analysis against pilot requirements.

---

## Summary: What Works Today

The noesis-core API currently provides:

- **User registration and login** via local credentials (username/password) with full validation, rate limiting, and session management. Google OAuth is implemented and ready (conditional on env vars).
- **Core learning engine** with BKT mastery modeling, FSRS spaced repetition scheduling, skill graph DAG, diagnostic engine, transfer testing, and deterministic session planning — all portable and zero-dependency.
- **Core engine event bridge** — typed NoesisEvent storage (single + batch), retrieval, and validation via `/api/core/events`. Events are stored in `learning_events` with full core event data in `_coreEvent` field, enabling lossless replay.
- **Engine state persistence** — `PUT/GET /api/engine/state` saves/loads the full engine snapshot (BKT probabilities, FSRS schedules, transfer results, event log) per user. Survives browser close and server restart.
- **LLM-powered orchestration** with multi-provider support (OpenAI, Anthropic, Ollama, fallback) for personalized recommendations and engagement suggestions.
- **Learning event recording** via `/api/learning/events` for generic events (attention, mastery, engagement, etc.).
- **Analytics** endpoints with per-user event filtering and summary statistics.
- **WebSocket** real-time communication for attention updates, learning events, and recommendations.
- **Web SDK** (`NoesisSDK`) wrapping the core engine with attention tracking, mastery tracking (legacy + core), and LLM orchestration.
- **Security** infrastructure: Helmet headers, CSRF protection, rate limiting (4 tiers), input sanitization, bcrypt password hashing.
- **OpenAPI 3.0 spec** with Swagger UI viewer at `/api/docs`.

---

## Prioritized Missing APIs

### P0 — Blocks Pilot

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| 1 | **No skill graph CRUD endpoints** | A pilot app cannot load curriculum data into the server. Skills/items/transfer tests can only be configured client-side via the SDK. If the server needs to know about the skill graph (e.g., for dashboard rendering, multi-device sync of curriculum structure), there's no API. | Add `POST /api/curriculum/skills` to upload a skill graph JSON, `GET /api/curriculum/skills` to retrieve it. Store in a new `skill_graphs` table or as a JSON blob keyed by curriculum ID. |
| 2 | **No server-side "next action" endpoint** | The core engine's `getNextAction()` only runs client-side in the SDK. A pilot app that wants server-driven session flow (thin client, mobile web) cannot ask the server "what should this learner do next?" | Add `GET /api/core/next-action` that loads the user's engine state, imports it into a temporary engine instance, runs `getNextAction()`, and returns the `SessionAction`. Requires skill graph to be stored server-side (see #1). |
| 3 | **No practice event submission from client that updates server-side engine** | Currently, practice events go through the SDK's core engine (client-side) and are stored on the server as raw event records. But the server never processes them through its own engine instance — it just stores them. For a thin-client pilot, the server needs to process events and return updated state. | Add `POST /api/core/practice` that accepts `{ skillId, itemId, correct, responseTimeMs }`, loads the user's engine state, processes the event, saves the updated state, and returns the new `LearnerProgress`. |

### P1 — Degrades Pilot

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| 4 | **No learner dashboard/progress endpoint** | The analytics summary (`/api/analytics/summary`) counts events by type but doesn't expose BKT skill mastery levels, FSRS review schedules, or the `LearnerProgress` structure from the core engine. A dashboard showing "you've mastered 5/12 skills" requires custom client-side computation. | Add `GET /api/core/progress` that loads engine state and returns `LearnerProgress` + per-skill mastery data. |
| 5 | **No pagination on event queries** | `getLearningEventsByUserId()` and `getLearningEventsByType()` return all events with no limit. After a few hundred practice sessions, this becomes a performance issue. | Add `page` and `limit` query params to analytics and event endpoints. The schema already has pagination Zod schemas defined in `API.md` but they're not implemented. |
| 6 | **No date range filtering on analytics** | Analytics endpoints return all events ever. A pilot dashboard typically wants "this week" or "last 30 days". | Add `startDate` and `endDate` query params to analytics endpoints. The schema already defines a DateRange validation schema. |
| 7 | **`learning_objectives` and `mastery_progress` tables have no API** | These tables exist in both PostgreSQL and SQLite schemas but no REST endpoints expose them. They were designed for the legacy `MasteryTracker` (now deprecated). | Either add CRUD endpoints for these tables or remove them if the core engine's state persistence (`engine_states`) replaces their purpose. **NEEDS_HUMAN decision.** |
| 8 | **No WebSocket broadcast of core engine events** | When a practice event is stored via `/api/core/events`, no WebSocket notification is sent. A dashboard open in another tab won't see real-time updates. | Call `wsService.broadcastLearningEvent()` from the core event storage endpoint. |
| 9 | **OpenAPI spec missing new endpoints** | The OpenAPI spec in `openapi.ts` does not include the 5 new endpoints added by the event bridge and engine state persistence (`/api/core/events`, `/api/core/events/batch`, `/api/engine/state`). | Add these endpoints to the OpenAPI spec. See discrepancies section below. |

### P2 — Nice to Have

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| 10 | **No content pack management** | Multiple content packs (math, reading, science) can't coexist on the server. There's no concept of "curriculum" or "course" — it's one global skill graph per SDK instance. | Design a `curriculum_id` dimension. The core engine could support multiple graphs. Low priority for a single-subject pilot. |
| 11 | **No session management endpoints** | The core engine has `session_start` and `session_end` event types, but there are no REST endpoints to start/end a server-tracked session (with timer, item count, etc.). | Add `POST /api/sessions/start` and `POST /api/sessions/end`. The SDK's `CoreEngineAdapter` already has `startSession()`/`endSession()` client-side. |
| 12 | **No admin/teacher view** | There's no way for a teacher to view all students' progress. All endpoints are user-scoped. | Add admin role + `GET /api/admin/learners` and `GET /api/admin/learners/:id/progress`. Requires RBAC. |
| 13 | **No JWT/API key auth for mobile** | Auth is session-cookie based only. A React Native or mobile app can't easily use cookies. | Add optional JWT-based auth alongside session auth. The `apiKey` field exists in SDK options but isn't used server-side. |
| 14 | **No event deletion or correction** | If a practice event is recorded incorrectly, there's no way to delete or amend it. The core engine's `replayEvents()` could handle corrections, but there's no API for it. | Add `DELETE /api/core/events/:id` or `POST /api/core/events/replay` to re-process event history after removing bad events. |
| 15 | **No export/import for learner data** | No endpoint to export a learner's complete data (GDPR compliance, data portability). | Add `GET /api/learner/export` returning all events + engine state. |

---

## Recommended New Endpoints

### `POST /api/curriculum/skills` (P0)

Upload a skill graph for the authenticated user's curriculum.

```typescript
// Request
{
  curriculumId?: string;  // default: 'default'
  skills: Skill[];        // array of skill definitions
  itemMappings?: ItemSkillMapping[];
  transferTests?: TransferTest[];
}

// Response (201)
{
  curriculumId: string;
  skillCount: number;
  valid: boolean;
  errors?: SkillGraphError[];
}
```

### `GET /api/core/progress` (P1)

Get the learner's progress from the persisted engine state.

```typescript
// Response (200)
{
  learnerId: string;
  totalSkills: number;
  masteredSkills: number;
  learningSkills: number;
  notStartedSkills: number;
  averageMastery: number;
  totalEvents: number;
  skillDetails: Array<{
    skillId: string;
    name: string;
    pMastery: number;
    state: 'new' | 'learning' | 'review' | 'relearning';
    nextReview?: string;  // ISO date
  }>;
}
```

### `POST /api/core/practice` (P0 — for thin-client flow)

Submit a practice attempt and get updated progress back.

```typescript
// Request
{
  skillId: string;
  itemId: string;
  correct: boolean;
  responseTimeMs: number;
  confidence?: number;
}

// Response (200)
{
  event: NoesisEvent;     // the created practice event
  progress: LearnerProgress;
  nextAction: SessionAction;
}
```

---

## OpenAPI Spec Discrepancies

### Endpoints Missing from OpenAPI Spec

These endpoints exist in the implementation but are not in `openapi.ts`:

| Endpoint | Source File | Notes |
|----------|-----------|-------|
| `POST /api/core/events` | `routes.ts:385` | New: event bridge |
| `POST /api/core/events/batch` | `routes.ts:413` | New: event bridge |
| `GET /api/core/events` | `routes.ts:445` | New: event bridge |
| `PUT /api/engine/state` | `routes.ts:465` | New: engine state |
| `GET /api/engine/state` | `routes.ts:486` | New: engine state |
| `GET /api/performance/stats` | `index.ts:67` | Internal-only endpoint |
| `GET /health` | `health.ts:184` | Internal-only, reasonable to exclude |
| `GET /health/live` | `health.ts:147` | Health probes, reasonable to exclude |
| `GET /health/ready` | `health.ts:158` | Health probes, reasonable to exclude |
| `GET /health/metrics` | `health.ts:226` | Internal-only, reasonable to exclude |

### Spec Entries That Match Implementation

All other spec entries (`/auth/*`, `/orchestration/*`, `/analytics/*`, `/learning/events`, `/llm/status`, `/csrf-token`) match their implementations accurately. The previous spec had `/auth/user` which has been corrected to `/auth/me`. Response schemas correctly reflect actual return shapes.

### Minor Spec Issues

1. **`/auth/login` response schema** references `$ref: '#/components/schemas/User'` but the actual response is `{ id, username }` (no password field). The User schema only includes `id` and `username`, so this is correct.
2. **`/learning/events` response** shows status 200 but the endpoint returns the created event directly (should arguably be 201 for resource creation).
3. **Security annotations** — The spec correctly uses `security: []` to mark unauthenticated endpoints. The core/engine endpoints are missing and would need `cookieAuth` security.
4. **Missing `401` responses** on authenticated endpoints — The OpenAPI spec should show 401 as a possible response on all session-authenticated endpoints.
5. **No `Core Engine` tag** — The new core/engine endpoints need a new tag (e.g., `Core Engine`) in the OpenAPI spec.

---

## Authentication Readiness Assessment

| Requirement | Status | Notes |
|-------------|--------|-------|
| User registration | Done | Full validation, rate-limited |
| Local login | Done | Passport LocalStrategy, bcrypt |
| Google OAuth | Done | Conditional on env vars, full flow |
| Session management | Done | 24h expiry, secure cookies, memory store |
| CSRF protection | Done | HMAC-signed tokens, timing-safe comparison |
| Password complexity | Done | Uppercase, lowercase, digit, special char required |
| Brute force protection | Done | Rate limiting on auth endpoints |
| JWT for mobile | Missing | Session-only auth; mobile apps need JWT or API key |
| Account linking | Partial | SQLite has `linkGoogleAccount()`, not in IStorage interface |

---

## Concurrency Assessment (10-20 Users)

| Component | Capacity | Notes |
|-----------|----------|-------|
| Express server | Adequate | Single process handles 10-20 easily |
| SQLite + WAL mode | Adequate | Handles concurrent reads well; writes are serialized but fast |
| Session store | Adequate | In-memory (memorystore), fine for 20 users |
| WebSocket server | Adequate | Max 1000 clients, 20 is trivial |
| Rate limiting | Adequate | Per-IP, 100 req/15min is generous for 20 users |
| LLM rate limits | Watch | 10 req/min per IP; shared IP (NAT) could hit limits |

---

## Summary

The API surface is **substantially complete for a pilot** with one major caveat: the core learning engine operates exclusively client-side. For a pure SPA pilot where the browser runs the engine and syncs state to the server, the current API is sufficient. For a server-driven pilot (thin client, multiple devices, teacher dashboard), the P0 gaps (skill graph CRUD, server-side next-action, server-side practice processing) need to be addressed.

**Recommendation:** For the initial pilot, use the **thick-client architecture** — run the core engine in the browser via `NoesisSDK`, sync state via `PUT/GET /api/engine/state`, and store events via `POST /api/core/events/batch`. This avoids the P0 gaps entirely and leverages all existing infrastructure. Add server-side engine processing as a follow-up.
