# Testing Strategy — Noesis Core

## Current State

- **Test files:** 35
- **Total tests:** 806 (801 passing, 5 skipped, 0 failing)
- **Framework:** Vitest 4.0.16 with jsdom environment
- **Coverage thresholds:** 60% lines/functions/statements, 50% branches

### Test distribution by module

| Module | Test Files | Tests | Focus |
|--------|-----------|-------|-------|
| Core SDK (`packages/core`) | 9 | ~230 | BKT, FSRS, planner, transfer, diagnostic, graph, metrics, persistence, integration |
| Server (`apps/server`) | 14 | ~350 | Auth, CSRF, routes, validation, health, logger, middleware, security, storage, WebSocket, performance, env, errors, LLM |
| SDK Web (`packages/sdk-web`) | 3 | ~60 | Core engine adapter, mastery tracker, SDK-core integration |
| Adapters LLM (`packages/adapters-llm`) | 3 | ~67 | Manager, orchestrator, providers |
| Web Demo (`apps/web-demo`) | 5 | ~83 | Mastery, orchestration, WebGazer, useAuth hook, useMasteryTracking hook, utils |

## Coverage Gap Analysis

| File | Blast Radius | Untested Paths |
|------|-------------|----------------|
| `core/engine/NoesisCoreEngineImpl.ts` | **Critical** | ~~exportState/importState round-trip with memory states~~, ~~replayEvents vs sequential equivalence~~, registerTransferTests re-creating planner, processEvent with unknown event type |
| `core/memory/FSRSScheduler.ts` | **High** | ~~Repeated failure stuck state~~, very long intervals (> maxInterval edge), rating=4 on new card aggressiveness |
| `core/planning/SessionPlannerImpl.ts` | **High** | ~~All skills mastered + no transfer tests → rest~~, diamond dependency leverage calculation, planner with skills stuck in relearning blocking dependents |
| `core/learner/BKTEngine.ts` | **Critical** | ~~Diagnostic initialization followed by practice~~, consecutive incorrect from high mastery (how many to drop below 0.3) |
| `core/engine/metrics.ts` | Medium | getLearnerMetrics with no practice events, retention calculation with zero elapsed time |
| `core/diagnostic/DiagnosticEngineImpl.ts` | Medium | Empty item mappings, single item per skill, propagation with deep prerequisite chains |
| `core/transfer/TransferGateImpl.ts` | Medium | getTransferStatus across multiple skills, evaluateAttempt edge cases |
| `server/routes.ts` | High | Analytics endpoints with large datasets, orchestration with real LLM (always mocked) |
| `server/sqlite-storage.ts` | High | Google OAuth user creation, concurrent access, migration from in-memory |
| `server/websocket.ts` | Medium | Authentication flow, multi-user broadcasting, DoS protection at max clients |

Strikethrough (~~) indicates gaps closed by the 5 new tests.

## Risk-Prioritized Testing Plan

### Tier 1 — Critical (breaks entire learning flow)

1. ~~**Export/import round-trip** — Verify all state (learner models, memory states, transfer results, event log) survives persistence~~ ✅ IMPLEMENTED
2. ~~**Replay vs sequential equivalence** — Verify replayEvents produces identical state to processEvent one-by-one~~ ✅ IMPLEMENTED
3. ~~**Diagnostic → practice flow** — Verify diagnostic seeds BKT priors and practice updates them correctly~~ ✅ IMPLEMENTED
4. Core engine with events for skills not in the graph (should not crash)
5. Multi-learner isolation (two learners in same engine don't cross-contaminate)

### Tier 2 — High (breaks learning quality)

6. ~~**FSRS repeated failure recovery** — Verify stuck states are impossible and recovery works~~ ✅ IMPLEMENTED
7. ~~**Session planner rest action** — Verify planner returns rest when nothing to do~~ ✅ IMPLEMENTED
8. BKT convergence: how many correct answers to reach 0.85, how many incorrect to drop from 0.85 to 0.3
9. Session planner with relearning skills blocking dependents
10. FSRS rating=4 (Easy) interval jump on new cards

### Tier 3 — Medium (breaks specific features)

11. Diagnostic engine with empty/minimal item mappings
12. Transfer gate getTransferStatus full workflow
13. Metrics extraction with edge cases (no events, unknown learner)
14. Graph loader round-trip with all optional fields

### Tier 4 — Low (breaks convenience/ops)

15. Health check degraded states
16. Performance monitor metric retention limits
17. WebSocket authentication edge cases
18. Logger child context propagation

## Tests Implemented

### Test 1: `exportState/importState round-trip preserves all state`
**File:** `packages/core/src/__tests__/core.test.ts`
**Verifies:** Learner models, FSRS memory states (stability, difficulty, nextReview, state), transfer results, event log, and downstream behavior (getNextAction) all survive export → import.
**Why prioritized:** This is the persistence boundary. A bug here means learners lose review schedules between sessions — the most damaging possible failure for a spaced repetition system.

### Test 2: `replayEvents produces identical state to sequential processEvent`
**File:** `packages/core/src/__tests__/core.test.ts`
**Verifies:** A mixed event sequence (diagnostic + practice + transfer test) produces identical learner models, memory states, transfer results, and event logs whether processed sequentially or via replayEvents().
**Why prioritized:** Replay is the foundation for state reconstruction and auditing. If it diverges from live processing, exported event logs become unreliable.

### Test 3: `FSRS repeated failures do not produce stuck state`
**File:** `packages/core/src/__tests__/core.test.ts`
**Verifies:** 20 consecutive failures maintain minimum stability (≥0.1), produce valid future nextReview timestamps, stay in relearning state, and allow full recovery to review state after subsequent correct answers.
**Why prioritized:** A stuck learner who can never progress is the worst UX failure in adaptive learning. This test proves the system degrades gracefully and always allows recovery.

### Test 4: `Session planner returns rest when all skills mastered`
**File:** `packages/core/src/__tests__/core.test.ts`
**Verifies:** With all 5 skills above mastery threshold (0.85), no memory states (no reviews due), and transfer tests disabled, the planner returns a well-formed 'rest' action rather than crashing or returning undefined.
**Why prioritized:** This is the "graduation" edge case — a learner who has mastered everything. In a pilot, even one user hitting this path would crash the app if it's not handled.

### Test 5: `BKT diagnostic initialization followed by practice`
**File:** `packages/core/src/__tests__/core.test.ts`
**Verifies:** Diagnostic sets differentiated priors (arithmetic=0.8, algebra=0.2), subsequent correct practice on arithmetic increases from the diagnostic prior, incorrect practice on algebra keeps mastery below 0.3 (proving the diagnostic prior was used, not the default 0.3), and undiagnosed skills remain at default.
**Why prioritized:** The diagnostic → practice transition is the first thing a real learner experiences. If diagnostic seeds are ignored, every learner starts from the same point regardless of prior knowledge, defeating the purpose of adaptive learning.

## Recommended Next Steps

### Immediate (before pilot)
- **BKT convergence numbers** — Compute and test how many correct/incorrect answers it takes to cross mastery thresholds. Important for setting expectations with educators.
- **Multi-learner isolation** — Verify two learners in the same engine don't affect each other's state.
- **Core engine with unknown skills** — Process a practice event for a skill not in the graph. Should it throw, ignore, or log a warning?

### Short-term (during pilot)
- **End-to-end server test** — POST /api/learning/events → GET /api/analytics/summary verifies the full HTTP path.
- **SQLite storage integration test** — Verify the SQLite backend matches the IStorage interface contract (currently only MemStorage is tested).
- **WebSocket auth flow** — Test the session-based authentication path for WebSocket connections.

### Medium-term
- **Load testing** — Simulate 20 concurrent users to verify the pilot scale.
- **FSRS parameter sensitivity** — Property-based tests with randomized parameters to find degenerate configurations.
- **Attention tracking** — The WebGazer adapter is only tested with mocks; real browser testing would require Playwright/Cypress.
