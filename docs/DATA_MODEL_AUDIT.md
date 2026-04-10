# Data Model & State Strategy Audit

> Generated 2026-04-10 by executing Investigation Prompt 4 against the full codebase.

## Executive Summary

**Can we reconstruct a learner's full journey from stored data?** No — not currently. The core engine's rich internal state (BKT skill probabilities, FSRS memory schedules, transfer test results) is never persisted to the database. The server stores generic learning events in a flat `{type, data}` format that is incompatible with the core engine's strongly-typed `NoesisEvent` schema. A server restart loses all learner mastery state.

**Biggest gap:** The `NoesisStateStore` persistence interface exists and works (verified in tests), but nothing in the server or SDK actually wires it up. The core engine has `exportState()` / `importState()` methods that serialize/deserialize all internal state, but they are never called outside of tests.

---

## State Persistence Map

| State | Where Generated | Where Stored | Persists Across Sessions? |
|-------|----------------|--------------|--------------------------|
| **BKT skill probabilities** (pMastery, pSlip, pGuess, pLearn per skill) | `BKTEngine.updateModel()` | `NoesisCoreEngineImpl.learnerModels` (in-memory Map) | **NO** — lost on server restart or page refresh |
| **FSRS memory states** (stability, difficulty, nextReview per skill) | `FSRSScheduler.scheduleReview()` | `NoesisCoreEngineImpl.memoryStates` (in-memory Map) | **NO** — lost on restart |
| **Practice event history** (core engine) | `NoesisCoreEngineImpl.processEvent()` | `NoesisCoreEngineImpl.eventLog` (in-memory array) | **NO** — lost on restart |
| **Practice event history** (server) | `POST /api/learning/events` | `learning_events` table (PostgreSQL/SQLite/memory) | **YES** — but in incompatible format |
| **Diagnostic results** | `NoesisCoreEngineImpl.processDiagnosticEvent()` | Engine's learnerModels (pMastery set from scores) | **NO** — not stored in database |
| **Transfer test results** | `NoesisCoreEngineImpl.processTransferTestEvent()` | `NoesisCoreEngineImpl.transferResults` (in-memory array) | **NO** — not stored in database |
| **Session planner state** | Computed on-the-fly by `SessionPlannerImpl` | Stateless (recalculated from learnerModel + memoryStates) | N/A — correct by design |
| **MasteryTracker objectives** (SDK) | `MasteryTracker.recordEvent()` | In-memory `objectives` array in sdk-web | **NO** — lost on page refresh |
| **User accounts** | `POST /api/auth/register` or Google OAuth | `users` table (all backends) | **YES** |
| **Learning objectives** (server) | Not yet used — tables exist but no CRUD endpoints | `learning_objectives` table | N/A — unused |
| **Mastery progress** (server) | Not yet used — tables exist but no CRUD endpoints | `mastery_progress` table | N/A — unused |

---

## Critical Gaps

### Gap 1: Core Engine State Never Persisted (CRITICAL)

The core engine maintains four pieces of internal state:
- `learnerModels: Map<string, LearnerModel>` — BKT probability estimates per skill per learner
- `memoryStates: Map<string, MemoryState[]>` — FSRS scheduling data per skill per learner
- `transferResults: TransferTestResult[]` — transfer test pass/fail history
- `eventLog: NoesisEvent[]` — complete event history

The engine has `exportState()` (serializes all to JSON string) and `importState()` (restores from JSON string). The `NoesisStateStore` interface (`packages/core/src/persistence/index.ts`) defines `load(learnerId)` and `save(learnerId, state)` methods.

**But nobody calls them:**
- `apps/server/routes.ts` — never references the core engine at all
- `packages/sdk-web/src/core/CoreEngineAdapter.ts` — creates engine but never persists state
- `packages/sdk-web/src/NoesisSDK.ts` — wraps CoreEngineAdapter but adds no persistence

**Impact:** Every server restart or page refresh resets learners to cold-start. All mastery progress, spaced repetition schedules, and diagnostic results are lost.

### Gap 2: Server Events Incompatible with Core Engine Events (CRITICAL)

The server stores events as:
```typescript
// learning_events table
{ id, user_id, type: string, data: JSONB, timestamp }
```

The core engine expects:
```typescript
// NoesisEvent (e.g., PracticeEvent)
{ id: string, type: 'practice', learnerId: string, sessionId: string,
  timestamp: number, skillId: string, itemId: string, correct: boolean,
  responseTimeMs: number }
```

**Key differences:**
- Server uses numeric `user_id`, core uses string `learnerId`
- Server flattens all event-specific fields into a generic `data` JSONB blob
- Server uses `Date` timestamps, core uses Unix milliseconds (`number`)
- Server events have no `sessionId` or `id` (UUID) fields
- Core events are strongly typed with discriminated unions; server events are string-typed

**Impact:** Cannot replay server-stored events through `engine.replayEvents()`. Cannot reconstruct learner state from the database. Breaks the determinism/replay contract defined in the Core SDK Constitution.

### Gap 3: Two Independent Mastery Systems (HIGH)

| System | Location | Algorithm | State |
|--------|----------|-----------|-------|
| Core Engine | `packages/core/src/learner/BKTEngine.ts` + `packages/core/src/memory/FSRSScheduler.ts` | BKT for mastery estimation, FSRS for scheduling | `LearnerModel` + `MemoryState[]` |
| SDK MasteryTracker | `packages/sdk-web/src/policies/mastery.ts` | Weighted moving average + exponential spacing | `LearningObjective[]` with progress/attempts |

These track the same concept (skill mastery) with completely different algorithms, different data structures, and different interfaces. A learner's mastery could be 0.9 in the core engine and 0.3 in MasteryTracker simultaneously.

---

## Schema Discrepancies

### PostgreSQL vs SQLite

| Aspect | PostgreSQL (`shared/schema.ts`) | SQLite (`sqlite-storage.ts`) | Match? |
|--------|-------------------------------|------------------------------|--------|
| `users.password` | `text()` — nullable after fix | `TEXT` — nullable | **YES** (after fix) |
| `users.email` | `text('email')` — after fix | `TEXT` | **YES** (after fix) |
| `users.google_id` | `text('google_id').unique()` — after fix | `TEXT UNIQUE` | **YES** (after fix) |
| `users.display_name` | `text('display_name')` — after fix | `TEXT` | **YES** (after fix) |
| `users.avatar_url` | `text('avatar_url')` — after fix | `TEXT` | **YES** (after fix) |
| `learning_events.data` | `jsonb` (native binary JSON) | `TEXT` (JSON string) | Functionally equivalent |
| `learning_events.timestamp` | `timestamp` (native) | `TEXT DEFAULT datetime('now')` | Different storage format |
| `mastery_progress.progress` | `jsonb` | `TEXT` | Functionally equivalent |

### IStorage Interface vs Implementations

| Method | IStorage | MemStorage | DatabaseStorage | SqliteStorage |
|--------|----------|------------|-----------------|---------------|
| `getUser` | YES | YES | YES | YES |
| `getUserByUsername` | YES | YES | YES | YES |
| `createUser` | YES | YES | YES | YES |
| `verifyPassword` | YES | YES | YES | YES |
| `getUserByGoogleId` | YES (after fix) | YES (after fix) | YES (after fix) | YES |
| `createGoogleUser` | YES (after fix) | YES (after fix) | YES (after fix) | YES |
| `linkGoogleAccount` | NO | NO | NO | YES (SQLite only) |
| `createLearningEvent` | YES | YES | YES | YES |
| `getLearningEvent` | YES | YES | YES | YES |
| `getLearningEventsByUserId` | YES | YES | YES | YES |
| `getLearningEventsByType` | YES | YES | YES | YES |
| Learning objectives CRUD | NO | NO | NO | NO |
| Mastery progress CRUD | NO | NO | NO | NO |

---

## Recommendations

### P0: Wire Up Core Engine State Persistence (NEEDS_HUMAN)

**Decision needed:** Where should persistence happen?

**Option A: Server-side persistence**
- Add a `NoesisStateStore` implementation backed by the database
- Save engine state on every event or on session end
- Load engine state on login/session start
- Pro: Centralized, works across devices
- Con: Requires new API endpoints, adds server complexity

**Option B: Client-side persistence (localStorage)**
- Save `engine.exportState()` to localStorage after each event
- Load on page load via `engine.importState()`
- Pro: Simple, no server changes
- Con: Device-specific, lost on cache clear

**Option C: Hybrid — store canonical events in core format, replay on load**
- Modify server to store `NoesisEvent` objects (not generic events)
- On session start, load events from server and call `engine.replayEvents()`
- Pro: Leverages the replay contract, canonical format
- Con: Replay cost grows with event history

**Recommended:** Option C for the pilot. It aligns with the Core SDK Constitution's determinism principles and doesn't require a new persistence format.

### P1: Unify Event Schema

Add a new server endpoint or modify `POST /api/learning/events` to accept canonical `NoesisEvent` format alongside the current generic format. Store the canonical fields as first-class columns (or at minimum, preserve the full `NoesisEvent` in the `data` JSONB).

### P2: Resolve Competing Mastery Systems (NEEDS_HUMAN)

For the pilot, recommend using the core engine's BKT+FSRS exclusively. The SDK's `MasteryTracker` could be:
- **Deprecated** in favor of `CoreEngineAdapter`
- **Kept as a lightweight fallback** for apps that don't need the full core engine
- **Removed entirely** to reduce confusion

### P3: Add Learning Objectives + Mastery Progress CRUD

Tables exist in both schemas but no storage methods or API endpoints use them. Either:
- Wire them up for the pilot dashboard
- Remove them to reduce confusion

---

## Migration Strategy

### From current state to recommended state:

1. **No data migration needed** — current server DB has only generic learning events and users. No core engine state to migrate since it was never persisted.

2. **Schema addition (not modification):**
   - Add a `core_engine_state` table: `(learner_id TEXT PRIMARY KEY, state TEXT, updated_at TIMESTAMP)`
   - Or add a `canonical_events` table with first-class columns for `NoesisEvent` fields

3. **Backward compatible:** All existing data remains valid. New persistence is additive.

4. **Migration path:**
   - Deploy schema additions
   - Update server to persist core engine state (P0)
   - Update event endpoint to accept canonical format (P1)
   - Existing generic events remain queryable for analytics
