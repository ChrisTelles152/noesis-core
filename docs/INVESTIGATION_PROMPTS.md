# Noesis Core - Deep Investigation Prompts

These 5 prompts are designed for separate Claude Code sessions. Each is self-contained and assumes zero prior context. Send one prompt per session.

---

## Prompt 1: Algorithm Audit

```
You are auditing the adaptive learning algorithms in the noesis-core repository. Your goal is to produce a findings document with specific code references and recommended fixes.

## Codebase orientation

This is a TypeScript monorepo. The core learning engine lives in `packages/core/src/`. Read these files completely before starting analysis:

- `packages/core/src/learner/BKTEngine.ts` — Bayesian Knowledge Tracing implementation
- `packages/core/src/memory/FSRSScheduler.ts` — Free Spaced Repetition Scheduler
- `packages/core/src/planning/SessionPlannerImpl.ts` — Session planning / next-item selection
- `packages/core/src/graph/SkillGraphImpl.ts` — Skill prerequisite DAG
- `packages/core/src/diagnostic/DiagnosticEngineImpl.ts` — Cold-start diagnostic assessment
- `packages/core/src/transfer/TransferGateImpl.ts` — Transfer test gating
- `packages/core/src/engine/NoesisCoreEngineImpl.ts` — Engine that wires everything together
- `packages/core/src/constitution.ts` — All interfaces and type contracts
- `packages/core/src/__tests__/` — All existing tests

Also read the secondary mastery tracker in `packages/sdk-web/src/policies/mastery.ts` which implements a separate spaced repetition system used by the web SDK.

## Investigation tasks

### 1. BKT correctness
- Compare the BKT update equations in `BKTEngine.ts` to the canonical BKT formulation (Corbett & Anderson 1995). Are the Bayesian posterior updates mathematically correct? Check both the correct-response and incorrect-response branches.
- Are the default parameters (pInit=0.3, pLearn=0.1, pSlip=0.1, pGuess=0.2) reasonable starting points? What does the literature suggest?
- The learning transition is applied AFTER the Bayesian update: `pFinal = pPosterior + (1 - pPosterior) * pLearn`. Is this the standard formulation? Does this cause mastery to only ever increase (monotonic)?
- With these defaults, how many consecutive correct answers does it take to reach pMastery >= 0.85? How many consecutive incorrect answers to drop from 0.85 to below 0.3? Are these numbers pedagogically reasonable?

### 2. FSRS correctness
- Compare the FSRS implementation in `FSRSScheduler.ts` to the published FSRS algorithm (https://github.com/open-spaced-repetition/fsrs4anki). Specifically check:
  - The retention formula: `R(t) = (1 + t/(9*S))^(-1)` — is the power-law decay correct vs the FSRS spec?
  - The stability update formula — does it match FSRS v4/v5?
  - The difficulty update formula
  - The interval calculation from stability and requested retention
- What happens when a learner gets rating=1 (Again) repeatedly? Does stability bottom out at 0.1? Can this create a "stuck state" where intervals are always 0 or near-0?
- What happens with rating=4 (Easy) on a new card? Does the interval jump too aggressively?

### 3. Two competing spaced repetition systems
- The core engine uses `FSRSScheduler` (packages/core). The web SDK also has `MasteryTracker` (packages/sdk-web/src/policies/mastery.ts) which uses a completely different exponential spacing formula: `hours = 24 * spacingFactor^progress * 0.5`. These are two independent, incompatible scheduling systems. Document this conflict and recommend which to keep.

### 4. Session planner edge cases
- In `SessionPlannerImpl.ts`, analyze the priority ordering. Can the planner enter an infinite loop or produce degenerate session plans?
- What happens when ALL skills are mastered but transfer tests are disabled? Does it correctly return "rest"?
- What happens when a skill has prerequisites that are themselves stuck in "relearning"? Can the learner get permanently blocked?
- The "leverage" calculation for new skill introduction: does it correctly handle diamond dependencies in the skill graph?

### 5. Mastery graph traversal
- In `SkillGraphImpl.ts`, verify the cycle detection (3-color DFS) is correct.
- Verify `getTopologicalOrder()` (Kahn's algorithm) produces correct results.
- What happens if `removeSkill()` is called on a skill that is a prerequisite of other skills? Does it leave dangling references?
- Can `getAllPrerequisites()` produce duplicate entries?

### 6. Diagnostic engine
- In `DiagnosticEngineImpl.ts`, the prerequisite boosting propagation processes skills in reverse topological order. Is this correct? Could it miss transitive dependencies?
- The secondary skill weight of 0.5x — is this justified or arbitrary?
- The difficulty adjustment formula `estimate = accuracy + (avgDifficulty - 0.5) * 0.3` — can this push estimates outside [0, 1] before clamping?

## Output

Save your findings to `docs/ALGORITHM_AUDIT.md` with this structure:

```markdown
# Algorithm Audit — Noesis Core

## Executive Summary
(2-3 sentences: overall health of the algorithms)

## Critical Issues
(Issues that produce incorrect behavior — with file:line references and recommended fixes)

## Warnings
(Issues that are technically correct but could cause poor learning outcomes)

## Observations
(Design decisions that are defensible but worth noting)

## Appendix: Numerical Analysis
(Show the math for key scenarios: consecutive correct/incorrect, stuck states, etc.)
```

Commit the findings doc when complete.
```

---

## Prompt 2: API & Integration Surface

```
You are documenting the full API surface of the noesis-core repository and producing a gap analysis for pilot readiness. Your goal is to produce two documents: an API reference and a gap analysis.

## Codebase orientation

This is a TypeScript monorepo with:
- `apps/server/` — Express.js REST API + WebSocket server
- `packages/core/` — Portable learning engine (zero dependencies)
- `packages/sdk-web/` — Web SDK that wraps the core engine
- `packages/adapters-llm/` — LLM provider integration (OpenAI, Anthropic, fallback)
- `packages/adapters-attention-web/` — Browser attention/gaze tracking
- `shared/schema.ts` — Drizzle ORM schema (PostgreSQL/SQLite data models)
- `apps/server/API.md` — Existing (possibly outdated) API documentation

Read ALL of these files before starting:
- `apps/server/routes.ts` — All API route handlers
- `apps/server/auth.ts` — Auth endpoints and strategies
- `apps/server/csrf.ts` — CSRF token endpoints
- `apps/server/health.ts` — Health check endpoints
- `apps/server/openapi.ts` — OpenAPI 3.0 spec
- `apps/server/websocket.ts` — WebSocket message types
- `apps/server/storage.ts` and `apps/server/sqlite-storage.ts` — Storage backends
- `apps/server/index.ts` — Middleware stack, rate limits, CORS
- `shared/schema.ts` — Database schema
- `packages/core/src/constitution.ts` — Core engine interfaces
- `packages/core/src/index.ts` — Core engine exports
- `packages/sdk-web/src/types.ts` — SDK type contracts
- `packages/sdk-web/src/NoesisSDK.ts` — SDK public API
- `packages/sdk-web/src/core/CoreEngineAdapter.ts` — Core engine bridge
- `packages/adapters-llm/src/orchestration-types.ts` — Orchestration contracts
- `packages/adapters-llm/src/types.ts` — LLM types
- `apps/server/API.md` — Existing docs

## Investigation tasks

### 1. Complete API endpoint inventory
Document every HTTP endpoint and WebSocket message type. For each endpoint, capture:
- Method + path
- Auth requirement (none, session, API key)
- Request schema (body/query/params) with types
- Response schema with types
- Rate limit tier
- Error codes returned
- Which storage backend methods it calls

### 2. Core engine public API
Document every public method on `NoesisCoreEngineImpl` and the factory functions. This is what a content pack (like noesis-math) needs to integrate with.

### 3. SDK public API
Document every public method on `NoesisSDK` — this is what a pilot application (noesis-pilot) consumes.

### 4. Data contracts between layers
Map the data flow:
- What does the web SDK send to the server? (HTTP requests, WebSocket messages)
- What does the server send back?
- What does the core engine expect as input events?
- What does a content pack need to provide? (skill graph JSON, item-skill mappings, transfer tests)

### 5. Gap analysis for a real pilot
A pilot application (noesis-pilot) needs to:
- Register users and authenticate them
- Load a math curriculum (skill graph + practice items)
- Present adaptive practice sessions
- Track mastery and schedule reviews
- Show a learner dashboard with progress
- Support 10-20 concurrent users

Identify what's missing:
- Are there endpoints for CRUD on skill graphs? (loading curriculum)
- Are there endpoints for submitting practice events from the client?
- Can the client get the next recommended action via API?
- Is there a way to get learner progress/dashboard data via API?
- Can multiple content packs coexist?
- Is there session management for learning sessions (start/end)?
- Are the WebSocket events sufficient for real-time updates?
- Is the authentication system ready (session-based vs JWT for mobile)?

### 6. OpenAPI spec accuracy
Compare `apps/server/openapi.ts` to actual routes in `apps/server/routes.ts` and `apps/server/auth.ts`. Are there endpoints missing from the spec? Are there spec entries that don't match the implementation?

## Output

Save two files:

**`docs/API_REFERENCE.md`** — Complete API reference with:
- REST endpoints table (method, path, auth, description)
- WebSocket message types table
- Core engine public methods
- SDK public methods
- Data contract diagrams (text-based)
- Content pack integration guide

**`docs/API_GAP_ANALYSIS.md`** — Gap analysis with:
- Summary of what works today
- Prioritized list of missing APIs (P0 = blocks pilot, P1 = degrades pilot, P2 = nice to have)
- Recommended new endpoints with suggested request/response schemas
- OpenAPI spec discrepancies

Commit both files when complete.
```

---

## Prompt 3: Simplification Audit

```
You are auditing the noesis-core repository for complexity that can be removed for a pilot with 10-20 users. Your goal is to produce a concrete list of files, modules, and abstractions to simplify or delete, with rationale for each.

## Codebase orientation

This is a TypeScript monorepo. Read the full directory structure first:

```
find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/.context/*' | sort
```

Then read these key files to understand the architecture:
- `package.json` — Root dependencies and scripts
- `packages/core/package.json` — Core package config
- `packages/sdk-web/package.json` — SDK package config
- `packages/adapters-llm/package.json` — LLM adapter config
- `packages/adapters-attention-web/package.json` — Attention adapter config
- `apps/server/index.ts` — Server middleware stack
- `apps/server/routes.ts` — API routes
- `apps/server/storage.ts` — Storage abstraction
- `apps/server/sqlite-storage.ts` — SQLite backend
- `apps/server/db.ts` — PostgreSQL backend
- `apps/server/performance.ts` — Performance monitoring
- `apps/server/health.ts` — Health checks
- `apps/server/openapi.ts` — OpenAPI spec
- `apps/server/websocket.ts` — WebSocket server
- `apps/server/csrf.ts` — CSRF protection
- `apps/web-demo/` — Web demo application (all files)
- `packages/adapters-attention-web/src/` — Attention tracking (all files)
- `packages/adapters-llm/src/` — LLM orchestration (all files)
- `packages/core/src/constitution.ts` — Core interfaces
- `docker-compose.yml`, `Dockerfile` — Container config
- `ecosystem.config.cjs` — PM2 config
- `drizzle.config.ts` — ORM config
- `docs/` — All documentation files
- `attached_assets/` — Pasted planning documents
- `CODEBASE_ANALYSIS.md`, `STATUS.md`, `CONTRIBUTING.md`

## Investigation tasks

### 1. Duplicate code
- The web demo (`apps/web-demo/src/sdk/`) contains near-identical copies of attention.ts, mastery.ts, orchestration.ts, webgazer-adapter.ts, and types.ts from the packages. Can these be deleted in favor of importing from the packages?

### 2. Overengineered abstractions for 10-20 users
Evaluate whether each of these is justified at pilot scale:
- **Three storage backends** (MemStorage, DatabaseStorage, SQLiteStorage) — do we need all three? For a pilot, could we just use SQLite?
- **Performance monitoring** (`performance.ts`, `RateLimitTracker`) — is per-endpoint p50/p95/p99 tracking necessary for 20 users?
- **Health check system** (`health.ts`) with Kubernetes-style liveness/readiness probes — are we deploying to Kubernetes?
- **OpenAPI spec** (`openapi.ts`, 400+ lines) — is this being consumed by anything?
- **WebSocket server** (`websocket.ts`) with subscription channels, heartbeat, DoS protection for 1000 clients — needed for 20 users?
- **CSRF protection** with HMAC tokens — is this necessary if the API is consumed by a first-party SPA?
- **Request ID middleware** — useful for debugging but adds complexity
- **Three-tier rate limiting** — necessary for 20 users?
- **LLM provider abstraction** with OpenAI + Anthropic + Fallback — could we just pick one?
- **Transfer testing gate** — is this used in the pilot curriculum?
- **Diagnostic engine** — is cold-start diagnostic assessment planned for the pilot?

### 3. Dead or unused code
- Is the `apps/web-demo/` actually used, or is there a separate noesis-pilot app? Should it be removed?
- Are the `attached_assets/` planning documents needed in the repo?
- Is `ecosystem.config.cjs` (PM2) used, or are we using Docker?
- Is `drizzle.config.ts` used if we're on SQLite?
- Are all the `docs/architecture/` files current and accurate?

### 4. Dependency bloat
- Check `package.json` for dependencies that could be removed if features are simplified.
- The core package (`packages/core`) is zero-dependency by design — this is good, don't change it.
- The server has many middleware packages — which are essential vs nice-to-have?

### 5. Configuration complexity
- `apps/server/env.ts` validates many environment variables. Which are actually needed for a pilot?
- How many config files exist at the root? (tsconfig, vite, vitest, eslint, prettier, postcss, tailwind, drizzle, components.json, etc.) Can any be consolidated?

## Output

Save to `docs/SIMPLIFICATION_AUDIT.md` with this structure:

```markdown
# Simplification Audit — Noesis Core

## Executive Summary
(How much complexity can be removed, estimated lines of code savings)

## Recommended Deletions
(Files/modules to delete entirely — with rationale and risk assessment)

| File/Module | Lines | Rationale | Risk | Action |
|---|---|---|---|---|

## Recommended Simplifications
(Code to simplify but not delete — with specific suggestions)

## Keep As-Is
(Things that look complex but are justified — explain why)

## Dependency Cleanup
(npm packages to remove)

## Configuration Cleanup
(Config files to consolidate or remove)
```

Commit the audit doc when complete.
```

---

## Prompt 4: Data Model & State Strategy

```
You are auditing how learner state is persisted in the noesis-core repository. Your goal is to determine whether the data model is correct and complete for tracking mastery, review schedules, and learning history across sessions.

## Codebase orientation

This is a TypeScript monorepo. Read ALL of these files completely:

**Database schemas:**
- `shared/schema.ts` — Drizzle ORM schema (PostgreSQL tables, Zod types)
- `apps/server/sqlite-storage.ts` — SQLite schema (CREATE TABLE statements) and queries
- `apps/server/storage.ts` — Storage interface and in-memory implementation
- `apps/server/db.ts` — PostgreSQL connection setup

**Core engine state:**
- `packages/core/src/constitution.ts` — All type definitions for learner models, memory states, events
- `packages/core/src/engine/NoesisCoreEngineImpl.ts` — Engine state: learnerModels, memoryStates, transferResults, eventLog + exportState/importState/replayEvents
- `packages/core/src/learner/BKTEngine.ts` — LearnerModel structure (SkillProbability maps)
- `packages/core/src/memory/FSRSScheduler.ts` — MemoryState structure (stability, difficulty, nextReview)
- `packages/core/src/persistence/index.ts` — NoesisStateStore interface (load/save as string)
- `packages/core/src/events/index.ts` — Event types and schemas

**Server data flow:**
- `apps/server/routes.ts` — How learning events are stored via the storage interface
- `apps/server/auth.ts` — User model and session management

**SDK state:**
- `packages/sdk-web/src/policies/mastery.ts` — Client-side MasteryTracker state (separate from core)
- `packages/sdk-web/src/core/CoreEngineAdapter.ts` — How core engine state is managed client-side

## Investigation tasks

### 1. Schema completeness audit
Map every piece of learner state to where it's persisted:

| State | Where generated | Where stored | Persistence across sessions? |
|---|---|---|---|

Check for:
- BKT skill probabilities (pMastery, pSlip, pGuess, pLearn per skill) — are these persisted to the database?
- FSRS memory states (stability, difficulty, nextReview per skill) — are these persisted?
- Practice event history — stored in `learning_events` table?
- Diagnostic results — stored anywhere?
- Transfer test results — stored anywhere?
- Session planner state — stateless (recalculated) or persisted?
- Learning objectives progress (from MasteryTracker) — stored in `mastery_progress` table?

### 2. State lifecycle analysis
Trace what happens across these scenarios:
1. User logs in → starts practice → answers 10 questions → logs out → logs back in next day. Is their BKT model restored? Are their FSRS review schedules intact?
2. User completes a diagnostic assessment. Are the initial skill estimates stored and loaded on next session?
3. Server restarts. What state is lost? (Hint: check if the core engine state is ever persisted to the database)

### 3. Schema mismatch between PostgreSQL and SQLite
Compare the Drizzle schema in `shared/schema.ts` with the SQLite schema in `sqlite-storage.ts`:
- Do the tables match?
- SQLite has additional tables (learning_objectives, mastery_progress) and additional user columns (email, google_id, display_name, avatar_url) — are these in the Drizzle schema?
- Are the data types compatible?
- Is there a migration strategy?

### 4. Core engine state persistence gap
The core engine (`NoesisCoreEngineImpl`) maintains rich internal state:
- `learnerModels: Map<string, LearnerModel>`
- `memoryStates: Map<string, MemoryState[]>`
- `transferResults: TransferTestResult[]`
- `eventLog: NoesisEvent[]`

It has `exportState()` and `importState()` methods. But is this export/import ever called by the server or SDK? Is there a persistence layer that saves core engine state to the database between sessions? Check:
- Does `apps/server/routes.ts` ever call engine.exportState()?
- Does `packages/sdk-web/` ever persist engine state to localStorage or the server?
- The `NoesisStateStore` interface in `packages/core/src/persistence/index.ts` — is it used anywhere outside of tests?

### 5. Event schema analysis
- The `learning_events` table stores events with a generic `data` JSONB column. Is the schema of this JSON documented anywhere?
- Can you reconstruct a learner's full journey (every practice attempt, every diagnostic, every mastery change) from the stored data?
- Are the events in `learning_events` (server-side) compatible with the canonical events in `packages/core/src/events/` (core engine)?

### 6. Data integrity
- Is there referential integrity between users and their learning events?
- Can orphaned records exist (learning events for deleted users)?
- Is there any data validation on the JSONB `data` column beyond the Zod schema in routes.ts?
- Are timestamps stored consistently (Unix ms vs ISO strings vs Date objects)?

### 7. Reconstruction test
Could you replay a learner's stored data through the core engine and get the same state? The core engine has `replayEvents(events)` — but are the stored events compatible with its expected event format?

## Output

Save to `docs/DATA_MODEL_AUDIT.md` with this structure:

```markdown
# Data Model & State Strategy Audit

## Executive Summary
(Can we reconstruct a learner's full journey from stored data? What's the biggest gap?)

## State Persistence Map
(Table mapping every piece of learner state to its storage location and persistence status)

## Critical Gaps
(State that is computed but never persisted — with impact analysis)

## Schema Discrepancies
(PostgreSQL vs SQLite differences, type mismatches)

## Recommendations
(Prioritized list of changes needed, with suggested schema additions)

## Migration Strategy
(How to get from current state to recommended state without losing data)
```

Commit the audit doc when complete.
```

---

## Prompt 5: Testing & Reliability

```
You are auditing test coverage in the noesis-core repository, writing a testing strategy, and implementing the top 5 missing tests. Your goal is to find the highest-risk untested paths and close them.

## Codebase orientation

This is a TypeScript monorepo using Vitest. Read the test configuration first:
- `vitest.config.ts` — Test configuration, path aliases, coverage thresholds
- `test/setup.ts` — Test setup file
- `package.json` — Test scripts (test, test:watch, test:coverage, test:core)

Then read ALL existing test files:

**Core engine tests** (`packages/core/src/__tests__/`):
- bkt.test.ts, core.test.ts, diagnostic.test.ts, fsrs.test.ts
- loader.test.ts, metrics.test.ts, persistence.test.ts
- sessionPlanner.test.ts, transfer.test.ts

**Server tests** (`apps/server/__tests__/`):
- auth.test.ts, csrf.test.ts, env.test.ts, errors.test.ts
- health.test.ts, llm.test.ts, logger.test.ts, middleware.test.ts
- performance.test.ts, routes.test.ts, security.test.ts
- storage.test.ts, validation.test.ts, websocket.test.ts

**SDK tests** (`packages/sdk-web/src/__tests__/`):
- core-engine-adapter.test.ts, mastery.test.ts, sdk-core-integration.test.ts

**Adapter tests:**
- `packages/adapters-llm/src/__tests__/manager.test.ts, orchestrator.test.ts, providers.test.ts`
- `apps/web-demo/src/sdk/__tests__/mastery.test.ts, orchestration.test.ts, webgazer-adapter.test.ts`
- `apps/web-demo/src/hooks/__tests__/useAuth.test.tsx, useMasteryTracking.test.ts`
- `apps/web-demo/src/lib/__tests__/utils.test.ts`

Then read the SOURCE files they test (focus on untested paths):
- `packages/core/src/engine/NoesisCoreEngineImpl.ts` — The main engine wiring
- `packages/core/src/engine/metrics.ts` — Metrics extraction
- `packages/core/src/planning/SessionPlannerImpl.ts` — Session planning logic
- `packages/core/src/memory/FSRSScheduler.ts` — Spaced repetition scheduler
- `packages/core/src/learner/BKTEngine.ts` — BKT learner model
- `apps/server/routes.ts` — API route handlers
- `apps/server/auth.ts` — Authentication
- `apps/server/storage.ts` — Storage layer
- `packages/sdk-web/src/NoesisSDK.ts` — Main SDK
- `packages/sdk-web/src/core/CoreEngineAdapter.ts` — Core engine bridge

## Investigation tasks

### 1. Run existing tests
Run `npm test` and `npm run test:coverage` to see current pass/fail status and coverage numbers. Record the results.

### 2. Coverage gap analysis
For each source file, identify:
- What percentage is covered (from coverage report)
- What specific code paths are NOT tested
- What's the blast radius if that untested code breaks (how many features depend on it)

### 3. Prioritize by blast radius
Rank untested paths by impact:
- **Critical (breaks everything):** Core engine event processing, BKT updates, state export/import
- **High (breaks learning flow):** Session planner logic, FSRS scheduling, practice event recording
- **Medium (breaks specific features):** Transfer testing, diagnostic engine, metrics
- **Low (breaks convenience):** Health checks, performance monitoring, logging

### 4. Identify the top 5 missing tests
Based on your analysis, identify the 5 highest-impact missing tests. These should be tests where:
- The code is critical to the learning flow
- A bug would be hard to detect without the test
- The test is feasible to write (not requiring complex infrastructure)

### 5. Write the top 5 tests
Implement exactly 5 new test cases. Place them in the appropriate existing test files (don't create new test files unless necessary). Each test should:
- Have a clear, descriptive name
- Test a specific untested code path
- Include comments explaining what it verifies and why it matters
- Be deterministic (no flaky tests)

Likely candidates (but use your analysis to decide):
- Core engine `replayEvents()` producing identical state to sequential processing
- Core engine `exportState()` → `importState()` round-trip preserving all state
- Session planner behavior when all skills mastered + transfer tests disabled
- FSRS behavior under repeated failures (stuck state detection)
- Server route that stores a learning event and retrieves it (integration path)
- BKT model behavior with diagnostic initialization followed by practice events
- Core engine handling of events for skills not in the skill graph

### 6. Run tests again
After writing the new tests, run the full test suite to confirm everything passes. Fix any failures.

## Output

Save the strategy doc to `docs/TESTING_STRATEGY.md` with this structure:

```markdown
# Testing Strategy — Noesis Core

## Current State
(Test count, coverage %, pass/fail status)

## Coverage Gap Analysis
(Table: file, current coverage, untested paths, blast radius)

## Risk-Prioritized Testing Plan
(Ordered list of what to test next, grouped by blast radius tier)

## Tests Implemented
(Description of the 5 tests written, what they verify, and why they were prioritized)

## Recommended Next Steps
(What to test after these 5, estimated effort)
```

Commit both the strategy doc AND the new test files when complete.
```

---

## Usage Instructions

1. Open 5 separate Claude Code sessions (or workspaces in Conductor), each pointed at this repository.
2. Copy-paste one prompt per session.
3. Each session will read the codebase, perform its analysis, and produce output documents in the `docs/` directory.
4. Sessions can run in parallel — there are no dependencies between them (they write to different files).
5. After all 5 complete, review the docs and merge the branches.
