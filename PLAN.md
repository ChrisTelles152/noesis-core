# Noesis — Plan to "Definitely Works"

> **Purpose.** Every item from the previous audit's "probably works / unclear / does not work / does not exist" tiers is taken to "definitely works" by an ordered plan of atomized tasks, each ending with a *verification test* that proves it.
>
> **How to use.** Phases are dependency-ordered. Inside a phase, tasks are PR-sized. Each task has Files / Steps / Verification test. A task is "definitely works" only when the named test exists, runs in CI, and asserts the property.
>
> **Companion to:** `todo.md` (current open work + history). This file is the *how*; `todo.md` is the *what*.

---

# 0. Truth-audit corrections (what changed after re-verification)

| Earlier tier | Item | Now confirmed | Evidence |
|---|---|---|---|
| Probably works | OpenAPI spec covers `/core/events*` + `/engine/state` | **WORKS** | `apps/server/openapi.ts:392, 449, 498` (paths in spec are without `/api/` prefix; my earlier grep used `/api/core/events` and missed). |
| Probably works | 5 new critical-path tests landed | **WORKS** | All 5 `describe('Critical Path: ...')` blocks present in `packages/core/src/__tests__/core.test.ts:1509, 1554, 1607` plus replay/round-trip blocks at lines 852/906/973. |
| Probably works | Diagnostic L4 secondary-skill weighting | **WORKS** | `packages/core/src/diagnostic/DiagnosticEngineImpl.ts:178-186, 220-239` — weight applied uniformly to `itemsAttempted`, `itemsCorrect`, `totalDifficulty`. |
| Unclear | Replay determinism in production paths | **DOES NOT WORK** | `packages/sdk-web/src/core/CoreEngineAdapter.ts:101, 282` calls `createNoesisCoreEngine(this.graph, {}, this.clock)` — passes only the clock, **not the idGenerator**. So even with an injected clock, IDs fall back to the non-deterministic `${Date.now()}-${Math.random().toString(36).substr(2,9)}` default at `NoesisCoreEngineImpl.ts:184`. Replay is broken in every production path. |
| Unclear | `auth.ts` `(store as any)` cast for `linkGoogleAccount` | **NOT NEEDED** | `apps/server/auth.ts` does not call `linkGoogleAccount` at all. The method exists only on `SqliteStorage` (`apps/server/sqlite-storage.ts:179`) and is dead. `IStorage` correctly omits it. The audit gap is "dead code", not "missing interface method". |
| Unclear | FSRS spec divergence numerics | **CONFIRMED REAL** | `packages/core/src/memory/FSRSScheduler.ts:198-204` implements `R(t) = (1 + t/(9*S))^(-1)`. Spec is `(1 + 19t/(81S))^(-2)`. Both satisfy `R(S) = 0.9`; implementation is more optimistic at long intervals. |
| Does not exist | Phase-1 Brazil wedge | **CONFIRMED 0%** | Narrow Portuguese grep across the entire repo returns only `todo.md` and `PRODUCTION_READINESS.md` — no source code, no UI, no content pack. |
| Does not exist | Vercel docs site | **CONFIRMED** | `vercel.json` does not exist. |
| Does not exist | Release workflow | **CONFIRMED** | `.github/workflows/` only has `ci.yml`. |
| Does not exist | Brand DNA | **CONFIRMED** | `tailwind.config.ts` is stock shadcn/ui CSS-variable theme; no Cloudbone White / Slate Grey / Neural Copper / Iris Bloom / Glacial Cyan; no font families. |
| Does not exist | NALS Cognitive-State Vector | **CONFIRMED** | `packages/core/src/constitution.ts` has no `CognitiveStateVector` interface; `NoesisEvent` union has no `CognitiveStateEvent`. |
| Does not exist | 5-stage canonical loop | **CONFIRMED** | `SessionAction.type` (line 225) is `'practice' \| 'review' \| 'diagnostic' \| 'transfer_test' \| 'prerequisite_probe' \| 'rest'` — missing `concept_introduction`, `application`, `reflection`. |

**Net effect on the plan:** add a "Production replay determinism" task in Phase A (it was previously "unclear"; it is now a confirmed broken contract). Treat OpenAPI spec + 5 new tests + L4 weighting as already-DONE in Appendix A of `todo.md`.

---

# Phase A — Determinism foundation

> **Why first.** Every replay/audit claim depends on it. CI cannot trust other tests if the engine itself can drift.

## A1 — Make Core fail loudly when no clock is injected
- **Files:** `packages/core/src/events/index.ts`, `packages/core/src/learner/BKTEngine.ts`, `packages/core/src/memory/FSRSScheduler.ts`, `packages/core/src/engine/NoesisCoreEngineImpl.ts`.
- **Steps:**
  1. Remove `defaultClock` and `defaultIdGenerator` exports from `events/index.ts` — replace with `requireClock()` and `requireIdGenerator()` helpers that throw `Error('Noesis: clock must be injected; use createDeterministicEngine(...) for replay or createNoesisCoreEngine(graph, {}, () => Date.now(), () => crypto.randomUUID())')`.
  2. In `BKTEngine` constructor (line 96), `FSRSScheduler` constructor (line 70), `NoesisCoreEngineImpl` constructor (lines 183-184), and `createNoesisCoreEngine` factory (line 729): require both `clock` and `idGenerator` as non-optional parameters.
  3. Keep `createDeterministicEngine` working unchanged.
  4. Add a single new helper `createSystemEngine(graph, config?)` that *opts in* to `Date.now()` + `crypto.randomUUID()` defaults, with a JSDoc warning that this engine is non-replayable and should not be used in production.
- **Verification test:** new file `packages/core/src/__tests__/determinism.test.ts`.
  - `it('throws when constructing engine without clock')` — `expect(() => new NoesisCoreEngineImpl(graph)).toThrow(/clock must be injected/)`.
  - `it('throws when constructing engine without idGenerator')` — same with only clock supplied.
  - `it('createDeterministicEngine produces fully deterministic state')` — exists already; keep.

## A2 — Fix CoreEngineAdapter to inject both clock and idGenerator
- **Files:** `packages/sdk-web/src/core/CoreEngineAdapter.ts`.
- **Steps:**
  1. Constructor (line 87): require `clock` AND `idGenerator` in `CoreAdapterConfig`. Default *only at the SDK boundary* (the only place a default is acceptable, with a warning).
  2. Line 101: change `createNoesisCoreEngine(this.graph, {}, this.clock)` → `createNoesisCoreEngine(this.graph, {}, this.clock, this.idGenerator)`.
  3. Line 282 (`updateSkillGraph`): same fix.
- **Verification test:** new test in `packages/sdk-web/src/__tests__/core-engine-adapter.test.ts`.
  - `it('uses injected idGenerator for all events')` — inject a counter-based `idGenerator`, record 5 practice events, assert event IDs are `evt-1, evt-2, ..., evt-5`.
  - `it('produces identical event log under same seed')` — construct two adapters with the same clock + idGenerator, run identical event sequences, assert `JSON.stringify(adapter1.getEventLog()) === JSON.stringify(adapter2.getEventLog())`.

## A3 — Add CI replay-equivalence test gate
- **Files:** new `packages/core/src/__tests__/replay.test.ts`; `.github/workflows/ci.yml`.
- **Steps:**
  1. New test file with a property-style suite: generate N=200 random events with a seeded RNG, process them through engine A, export state, replay through engine B, assert `JSON.parse(engineA.exportState()) === JSON.parse(engineB.exportState())` (deep-equal). Repeat with permuted-but-causally-valid event orders to verify order-sensitivity is correct.
  2. Add a step `replay-determinism` in CI that runs `npm test -- packages/core/src/__tests__/replay.test.ts --run` and fails the build on any failure.
- **Verification test:** the CI step itself. Add a smoke test verifying CI fails when the test fails (could be a separate test that injects a tampered clock and asserts the suite fails).

---

# Phase B — Persistence auto-wiring

> **Why next.** Closes "state requires explicit consumer wiring". Depends on Phase A so we can trust round-trip equality.

## B1 — `CoreEngineAdapter.persistTo()` API
- **Files:** `packages/sdk-web/src/core/CoreEngineAdapter.ts`, `packages/sdk-web/src/types.ts`.
- **Steps:**
  1. Add `interface PersistenceTransport { save(state: string): Promise<void>; load(): Promise<string | null>; }`.
  2. Add `CoreEngineAdapter.persistTo(transport: PersistenceTransport, options?: { autosaveDebounceMs?: number })` — installs an event listener that debounces `engine.exportState()` and calls `transport.save()`.
  3. Add `await CoreEngineAdapter.hydrate(transport)` — calls `transport.load()` and invokes `engine.importState()` if non-null.
  4. Provide two transport adapters: `localStorageTransport(key)` and `httpTransport(url, csrfToken?)`.
- **Verification test:** new test in `packages/sdk-web/src/__tests__/persistence.test.ts`.
  - `it('autosaves state to a transport on each event')` — fake transport, record 3 events with debounce 0, assert `transport.save` was called 3 times with valid JSON.
  - `it('hydrates state from a transport')` — pre-load transport with a known state, hydrate, assert `engine.getLearnerProgress()` matches the pre-loaded state.

## B2 — Wire persistence into `apps/web-demo`
- **Files:** `apps/web-demo/src/hooks/useNoesisSDK.ts`.
- **Steps:**
  1. After SDK construction, call `sdk.core?.hydrate(httpTransport('/api/engine/state', csrfToken))`.
  2. Then `sdk.core?.persistTo(httpTransport('/api/engine/state', csrfToken), { autosaveDebounceMs: 1000 })`.
- **Verification test:** new test in `apps/web-demo/src/hooks/__tests__/useNoesisSDK.test.tsx`.
  - `it('hydrates from server on mount and saves on practice events')` — mock `fetch`, render the hook, simulate a practice event, assert `PUT /api/engine/state` was called within 1500ms with a valid JSON body.

---

# Phase C — NALS + canonical loop

> **Why now.** They are first-class types in `INTENTION.md` but absent. Subsequent phases (WebGazer demotion, Phase-1 Brazilian content) reference these types. Order: types first, reducer second, planner enforcement third.

## C1 — Define `CognitiveStateVector` + `CognitiveStateEvent` in Core
- **Files:** `packages/core/src/constitution.ts`, `packages/core/src/events/index.ts`.
- **Steps:**
  1. Add interface `CognitiveStateMeasurement { value: number; confidence: number; timestamp: number }` and `CognitiveStateVector { attention: …; recallStrength: …; affect: … }`.
  2. Add `CognitiveStateEvent extends BaseEvent { type: 'cognitive_state'; vector: CognitiveStateVector }`. Add to `NoesisEvent` union.
  3. Add factory `createCognitiveStateEvent(ctx, learnerId, sessionId, vector)` in `events/index.ts`.
- **Verification test:** new file `packages/core/src/__tests__/cognitiveState.test.ts`.
  - `it('factory produces deterministic CognitiveStateEvent')` — fixed clock + ID gen, assert event matches a literal snapshot.
  - `it('NoesisEvent union accepts cognitive_state')` — type-level test (`const e: NoesisEvent = createCognitiveStateEvent(…)` compiles; runtime: `validateEvent(e).valid === true`).

## C2 — Reduce Cognitive-State events into engine state
- **Files:** `packages/core/src/engine/NoesisCoreEngineImpl.ts`.
- **Steps:**
  1. Add private `cognitiveStates: Map<string, CognitiveStateVector[]> = new Map()` (timeline per learner).
  2. Add `processCognitiveStateEvent` to the `processEvent` switch.
  3. Add `getCognitiveState(learnerId): CognitiveStateVector | undefined` — returns latest vector.
  4. Add `getCognitiveStateHistory(learnerId): CognitiveStateVector[]`.
  5. Include in `exportState` / `importState` (bump serialized version to 1.2).
- **Verification test:** in `packages/core/src/__tests__/cognitiveState.test.ts`.
  - `it('engine accumulates cognitive state events into a per-learner timeline')` — record 3 events, assert `getCognitiveStateHistory('learner-1').length === 3` and `getCognitiveState('learner-1')` returns the most recent.
  - `it('cognitive state survives export/import round-trip')` — record events, export, create fresh engine, import, assert `getCognitiveStateHistory()` matches.
  - Update existing replay test in `packages/core/src/__tests__/replay.test.ts` (Phase A3) to include `cognitive_state` in the random event mix.

## C3 — Codify 5-stage canonical loop in `SessionAction.type`
- **Files:** `packages/core/src/constitution.ts`, `packages/core/src/planning/SessionPlannerImpl.ts`.
- **Steps:**
  1. Extend `SessionAction.type` with `'concept_introduction' | 'application' | 'reflection'`.
  2. Add `learnerStageHistory: Map<string, Set<SessionAction['type']>>` per learner per skill.
  3. In `SessionPlannerImpl.getNextAction`, gate transitions:
     - A skill cannot get a `transfer_test` action without `concept_introduction` → `practice` → `application` → `reflection` already recorded.
     - When introducing a new skill, emit `concept_introduction` first, not `practice`.
  4. Update `processPracticeEvent` to also record stage progression.
- **Verification test:** new test cases in `packages/core/src/__tests__/sessionPlanner.test.ts`.
  - `it('emits concept_introduction before practice for a brand-new skill')` — fresh learner, single skill, fresh memory state, assert first `getNextAction` returns `type: 'concept_introduction'`.
  - `it('blocks transfer_test until application+reflection have been recorded')` — pre-populate practice history without application/reflection, assert planner does not emit `transfer_test`.
  - `it('order constraint: practice cannot precede concept_introduction')` — request next action with no introduction recorded; assert it is not `practice`.

---

# Phase D — WebGazer demotion + simulated attention default

> **Depends on:** C1 (`CognitiveStateEvent` to emit). Without it, the simulated adapter has nothing typed to emit.

## D1 — `simulated-adapter.ts`
- **Files:** new `packages/adapters-attention-web/src/simulated-adapter.ts`; `packages/adapters-attention-web/src/index.ts`.
- **Steps:**
  1. Implement a `SimulatedAttentionTracker` class implementing the same interface as `AttentionTracker` (start/stop/getCurrentData/onAttentionChange).
  2. Source data from explicit user input (3 buttons: "focused", "drifting", "break"); emit a `CognitiveStateEvent` per click via injected `eventEmitter`.
  3. Re-export `SimulatedAttentionTracker` as the default `AttentionTracker` from `index.ts`. Re-export `WebGazerAttentionTracker` (renamed) as opt-in.
- **Verification test:** new file `packages/adapters-attention-web/src/__tests__/simulated.test.ts`.
  - `it('emits a cognitive_state event on each user click')` — render, click "focused", assert event emitted with `vector.attention.value === 1.0`.
  - `it('package default export is SimulatedAttentionTracker')` — `import { AttentionTracker } from '@noesis/adapters-attention-web'; expect(AttentionTracker.name).toBe('SimulatedAttentionTracker')`.

## D2 — Wire `useAttentionTracking` to read `ENABLE_REAL_GAZE_TRACKING`
- **Files:** `apps/web-demo/src/hooks/useAttentionTracking.ts`.
- **Steps:**
  1. Read `import.meta.env.VITE_ENABLE_REAL_GAZE_TRACKING === 'true'` (Vite-side mapping of the server env var).
  2. If true, import + use `WebGazerAttentionTracker`. If false, default to `SimulatedAttentionTracker`.
- **Verification test:** new test `apps/web-demo/src/hooks/__tests__/useAttentionTracking.test.tsx`.
  - `it('uses simulated tracker when flag is false')` — set `import.meta.env.VITE_ENABLE_REAL_GAZE_TRACKING = 'false'`, render hook, assert `tracker.constructor.name === 'SimulatedAttentionTracker'`.
  - `it('uses webgazer tracker when flag is true')` — same with flag `'true'`, assert `WebGazer*` constructor.

## D3 — Remove the "needed for WebGazer" assumption from server
- **Files:** `apps/server/index.ts`.
- **Steps:**
  1. Make `crossOriginEmbedderPolicy: false` conditional on `process.env.ENABLE_REAL_GAZE_TRACKING === 'true'`. Default to standard helmet behavior (no relaxation).
- **Verification test:** new test in `apps/server/__tests__/security.test.ts`.
  - `it('sets standard COEP header when WebGazer disabled')` — start app with flag unset, GET `/`, assert `cross-origin-embedder-policy: require-corp` (helmet default) is present.
  - `it('relaxes COEP only when WebGazer is enabled')` — same with flag `'true'`, assert no COEP or `unsafe-none`.

---

# Phase E — Server-side engine processing

> **Depends on:** A (determinism) + B (auto-persistence) + C (NALS types). Without those, server-side processing reproduces the same drift problems.

## E1 — Per-user server-side engine instance manager
- **Files:** new `apps/server/engine-manager.ts`.
- **Steps:**
  1. Implement `getEngineForUser(userId): Promise<NoesisCoreEngineImpl>` — cache one engine per user; on first call, load skill graph (per E2) and replay events from DB; subsequent calls return cached instance.
  2. Use `createDeterministicEngine` (replay-mode) when hydrating from event log, then switch to a system-clock engine for live additions, OR always use injected fixed-time replay during hydration and `Date.now()`-clock for new events. Document which.
  3. Eviction: LRU cap at 100 engines, evict oldest after `engine.exportState()` is persisted.
- **Verification test:** new `apps/server/__tests__/engine-manager.test.ts`.
  - `it('hydrates engine from stored events on first access')` — pre-seed `learning_events` with 3 practice events for user 1, call `getEngineForUser(1)`, assert `engine.getEventLog().length === 3` and `getLearnerProgress(...)` reflects the events.
  - `it('caches engine instance across calls')` — call twice for same user, assert same instance returned.
  - `it('evicts oldest engine when cache exceeds limit')` — fill to 101, assert oldest is gone (state persisted).

## E2 — `POST /api/curriculum/skills` + `GET /api/curriculum/skills`
- **Files:** `apps/server/routes.ts`, `shared/schema.ts`.
- **Steps:**
  1. Add `skill_graphs` table to schema (per-user or per-cohort skill-graph JSON).
  2. Implement `POST` (Zod-validate, store, validate via `engine.graph.validate()`) and `GET` (fetch by `curriculumId`).
  3. Update `engine-manager.ts` to load this graph on engine init.
- **Verification test:** new test in `apps/server/__tests__/routes.test.ts`.
  - `it('POST /api/curriculum/skills validates and stores a skill graph')` — POST a 3-skill graph, assert 201 + DB row.
  - `it('rejects skill graphs with cycles')` — POST a graph with a cycle, assert 400 with `errors[0].type === 'CYCLE_DETECTED'`.
  - `it('GET /api/curriculum/skills returns the stored graph')` — POST then GET, assert exact roundtrip.

## E3 — `GET /api/core/next-action`
- **Files:** `apps/server/routes.ts`.
- **Steps:**
  1. Get `engine = await engineManager.getEngineForUser(userId)`. Run `engine.getNextAction(learnerId, DEFAULT_SESSION_CONFIG)`. Return as JSON.
- **Verification test:** new test in `apps/server/__tests__/routes.test.ts`.
  - `it('returns the planner next action for the authenticated user')` — given user with skill graph and 0 practice, assert response is `{ type: 'concept_introduction', skillId: <root>, ... }` (after C3) or `{ type: 'practice', ... }` (until C3 lands — gated test fixture).
  - `it('rejects unauthenticated requests with 401')`.

## E4 — `POST /api/core/practice`
- **Files:** `apps/server/routes.ts`.
- **Steps:**
  1. Get the per-user engine. Build a `PracticeEvent` from request body. Call `engine.processEvent(event)`. Persist event via existing `event-bridge.ts`. Save engine state. Return `{ event, progress: getLearnerProgress(learnerId), nextAction: getNextAction(...) }`.
- **Verification test:** in `apps/server/__tests__/routes.test.ts`.
  - `it('processes a practice event and returns updated progress')` — POST `{ skillId, itemId, correct: true, responseTimeMs }`, assert response includes `progress.totalEvents === 1` and `nextAction` is well-formed.
  - `it('persists the event to the database')` — verify `learning_events` row exists with `_coreEvent.type === 'practice'` after the call.

## E5 — `GET /api/core/progress` + WebSocket broadcast on event store
- **Files:** `apps/server/routes.ts`, `apps/server/websocket.ts`.
- **Steps:**
  1. `GET /api/core/progress` — returns `engine.getLearnerProgress(learnerId)`.
  2. After persisting in `POST /api/core/events*` and `POST /api/core/practice`, call `wsService.broadcastLearningEvent(userId, event)`.
- **Verification test:** in `apps/server/__tests__/routes.test.ts` and `apps/server/__tests__/websocket.test.ts`.
  - `it('GET /api/core/progress returns LearnerProgress')` — well-known fixture, exact match.
  - `it('broadcasts on POST /api/core/events')` — open WS, POST event, assert broadcast received within 100ms.

## E6 — Pagination + date-range on analytics
- **Files:** `apps/server/routes.ts`.
- **Steps:**
  1. Add `?page=&limit=&startDate=&endDate=` to `/api/analytics/*` and `/api/core/events`.
  2. Reuse the `commonSchemas` from `apps/server/middleware/validation.ts` (currently dead code per `SIMPLIFICATION_AUDIT.md`).
- **Verification test:** in `apps/server/__tests__/routes.test.ts`.
  - `it('paginates analytics responses')` — pre-seed 25 events, GET `/api/analytics/summary?limit=10`, assert returned count is 10 and `nextPage` link or pagination metadata is present.
  - `it('filters by date range')` — assert events outside the window are excluded.

---

# Phase F — Top-priority docs reconciliation (intent-vs-code)

> **Why now.** Cheap. Eliminates blocker #1 for new contributors. Should land alongside Phase A so the docs match the determinism contract.

## F1 — README headline reconciliation
- **Files:** `README.md`.
- **Steps:**
  1. Drop "XR Support — Planned" and "Voice Interface — Planned" from the Key Features table (per `INTENTION.md` they are out of scope for MVP).
  2. Change "Attention Tracking — Ready" to "Attention Tracking — Simulated by default; WebGazer optional via `ENABLE_REAL_GAZE_TRACKING`".
- **Verification test:** new test `test/docs.test.ts` (or in CI a markdown-lint step).
  - `it('README does not advertise unimplemented features')` — read `README.md`, assert no occurrence of `XR Support — Planned` or `Voice Interface — Planned`.

## F2 — Port number reconciliation
- **Files:** `apps/server/README.md`, `apps/web-demo/README.md`.
- **Steps:**
  1. Replace `5000` with `5174` in both files (matches `apps/server/index.ts:226-229` and root `README.md`).
- **Verification test:** in the same `test/docs.test.ts`.
  - `it('app READMEs cite the same port as the server default')` — read all 3 READMEs, assert `5174` appears in each and `5000` does not (or note the macOS AirPlay context if needed).

## F3 — Retire `apps/server/API.md` in favor of `docs/API_REFERENCE.md`
- **Files:** delete `apps/server/API.md`; update any references.
- **Verification test:** `it('apps/server/API.md does not exist')` — `expect(fs.existsSync('apps/server/API.md')).toBe(false)`.

## F4 — Sync `packages/core/README.md` and `packages/core/CHANGELOG.md`
- **Files:** `packages/core/README.md`, `packages/core/CHANGELOG.md`.
- **Steps:**
  1. README: add `encompassedSkills?` to the `Skill` interface example; update `SessionAction.type` enumeration to include `prerequisite_probe` (and post-C3, the new types).
  2. CHANGELOG: fix v0.1.0 date (2024 → 2026); add v0.2.0 entries for: encompassed skills + implicit credit; per-user learning speed; `prerequisite_probe`; knock-out reviews; `computeRating`; `getEffectiveMastery`; `CognitiveStateVector` (after C1).
- **Verification test:** `it('CHANGELOG mentions every public symbol added since v0.1.0')` — grep CHANGELOG for each symbol name (`encompassedSkills`, `setLearningSpeed`, `prerequisite_probe`, `enableKnockOutReviews`, `computeRating`, `getEffectiveMastery`).

## F5 — Update `STATUS.md`
- **Files:** `STATUS.md`.
- **Steps:**
  1. Replace stale claims with a one-page snapshot pointing to `todo.md`, `INTENTION.md`, and `PRODUCTION_READINESS.md`.
  2. Preserve the Jan-2026 snapshot below the new header (already started in Phase 3 of previous audit).
- **Verification test:** none — pure doc edit. Manual review.

## F6 — Update `docs/DATA_MODEL_AUDIT.md` text
- **Files:** `docs/DATA_MODEL_AUDIT.md`.
- **Steps:**
  1. Add "RESOLVED — see `engine_states` table + event-bridge" notes inline next to Gap 1 / Gap 2 paragraphs.
- **Verification test:** none — manual review.

---

# Phase G — Brand DNA application

> **Why parallel.** Independent of A-E; can land anytime. Done before Phase H so the pilot UI inherits brand.

## G1 — Tailwind palette tokens
- **Files:** `tailwind.config.ts`, `apps/web-demo/src/index.css`.
- **Steps:**
  1. Add named tokens to `theme.extend.colors`: `cloudbone-white`, `slate-grey`, `neural-copper`, `iris-bloom`, `glacial-cyan`. Use exact hex values to be supplied by `INTENTION.md` follow-up (open in Phase 6.x decisions if not present).
  2. Map shadcn CSS variables (`--background`, `--foreground`, `--primary`, `--secondary`, `--accent`) to these tokens in `index.css`.
- **Verification test:** new test `apps/web-demo/src/lib/__tests__/theme.test.ts`.
  - `it('exposes locked palette tokens')` — read `tailwind.config.ts`, assert all 5 named tokens exist.
  - Snapshot test: render a styled component, assert `getComputedStyle(...).color` matches the expected palette value.

## G2 — Replace generic logo with spiral-eye
- **Files:** `generated-icon.png`; new `apps/web-demo/src/assets/spiral-eye.svg`.
- **Steps:**
  1. Add the spiral-eye SVG (asset to be supplied).
  2. Reference from `<link rel="icon">` and any `Hero.tsx` / branding component.
- **Verification test:** `it('public icon is the spiral-eye asset')` — assert `apps/web-demo/src/assets/spiral-eye.svg` exists; assert `Hero.tsx` references it.

## G3 — Dual font system
- **Files:** `tailwind.config.ts`, `apps/web-demo/index.html`, `apps/web-demo/src/index.css`.
- **Steps:**
  1. Add `font-sans` (geometric sans, e.g. Inter) and `font-serif` (soft serif, e.g. Source Serif Pro) to Tailwind.
  2. Load via Google Fonts in `index.html`.
- **Verification test:** snapshot test — render a `<h1 className="font-serif">` and `<p className="font-sans">`, assert resolved `font-family` matches.

---

# Phase H — Phase-1 Brazil STEM wedge

> **Depends on:** A (determinism), B (auto-persistence), C (NALS + canonical loop), E (server-side processing), G (brand). The biggest phase.

## H1 — i18n scaffolding
- **Files:** new `apps/web-demo/src/locales/pt-BR/*.json`; install `react-i18next`.
- **Steps:**
  1. Install + configure `i18next` + `react-i18next`.
  2. Move all UI strings in `Header.tsx`, `Hero.tsx`, `Login.tsx`, `Register.tsx`, `Dashboard.tsx`, `Demo.tsx`, `not-found.tsx` to translation keys.
  3. Provide pt-BR + en-US locale files; default to pt-BR.
- **Verification test:** new `apps/web-demo/src/__tests__/i18n.test.tsx`.
  - `it('renders pt-BR strings by default')` — render `Hero.tsx`, assert no English-only strings appear in DOM.
  - `it('every translation key has both pt-BR and en-US values')` — load both JSON files, assert key parity.

## H2 — `packages/content-pt-br-math/`
- **Files:** new package with `package.json`, `src/index.ts`, `src/graph.json`, `src/items/`, `src/goldenSequence.json`.
- **Steps:**
  1. 80–150-node math graph (decision §6.4 may add physics). Each node: id, name (pt-BR), prerequisites, encompassedSkills (where appropriate), category, difficulty.
  2. ~300 practice items keyed to skill IDs, each with prompt + worked solution + multiple-choice or numeric answer schema.
  3. 3–5 Golden Sequence definitions in `goldenSequence.json`.
  4. Export a `loadContentPack(): { graph, itemMappings, goldenSequences }` function.
- **Verification test:** new test in `packages/content-pt-br-math/src/__tests__/contentPack.test.ts`.
  - `it('graph is acyclic and validates')` — load graph, assert `graph.validate().valid === true`.
  - `it('every item maps to a skill in the graph')` — assert every `primarySkillId` and `secondarySkillId` exists in graph.
  - `it('graph has between 80 and 150 nodes')` — bounds check.
  - `it('every node has a Portuguese name (no English-only)')` — assert no name contains only ASCII letters and matches an English-language whitelist.

## H3 — Diagnostic placement quiz UI
- **Files:** new `apps/web-demo/src/pages/Diagnostic.tsx`; route in `App.tsx`.
- **Steps:**
  1. Generate diagnostic via `engine.generateDiagnostic(maxItems)`.
  2. Iterate items; record responses; submit via `POST /api/core/practice` (or a dedicated `/api/core/diagnostic` if added).
  3. After completion, navigate to guided path with seeded learner model.
- **Verification test:** new `apps/web-demo/src/pages/__tests__/Diagnostic.test.tsx`.
  - `it('runs full diagnostic and seeds the engine')` — render, simulate 20 answers, assert `engine.getLearnerProgress()` reflects diagnostic-derived priors.

## H4 — Guided path UI
- **Files:** new `apps/web-demo/src/pages/Path.tsx`; new `apps/web-demo/src/components/SkillNodeCard.tsx`.
- **Steps:**
  1. Render skill graph as a DAG visualization (use `dagre` or simple table-of-skills).
  2. Each node shows lock state (prerequisite mastery), mastery progress bar, "Practice" button.
  3. Click → call `engine.getNextAction()` for that skill → navigate to per-node screen.
- **Verification test:**
  - `it('locked skills cannot be entered')` — render with prereqs unmastered, click locked node, assert no navigation.
  - `it('unlocked skills navigate to per-node screen')` — render with prereqs mastered, click, assert route.

## H5 — Per-node screen
- **Files:** new `apps/web-demo/src/pages/SkillNode.tsx`.
- **Steps:**
  1. Three states based on `getNextAction.type`:
     - `concept_introduction` — show explanation card.
     - `practice` / `application` / `review` — show item, capture response time, POST `/api/core/practice`.
     - `reflection` — show prompt, capture text, store as event metadata.
  2. After each action, re-fetch `getNextAction` and re-render.
- **Verification test:**
  - `it('renders explanation, practice, application, reflection in canonical order for a fresh skill')` — fixture: fresh learner, single skill; assert sequence of `nextAction.type` values.

## H6 — Mentor dashboard + CSV export
- **Files:** new `apps/web-demo/src/pages/Mentor.tsx`; new `GET /api/mentor/learners` and `GET /api/mentor/export.csv`.
- **Steps:**
  1. Server: add admin role check; add endpoints listing all learners' `LearnerProgress`.
  2. Client: list table + per-learner detail view + "Export CSV" button.
- **Verification test:**
  - Server: `it('GET /api/mentor/learners returns all learners only for admin role')` — non-admin → 403; admin → 200.
  - Client: `it('renders learner list and exports CSV')` — render with mock data, click "Export", assert `fetch('/api/mentor/export.csv')` was called and a download was triggered.

## H7 — Authoring admin
- **Files:** new `apps/web-demo/src/pages/Authoring.tsx`; new server endpoints for skill/item CRUD.
- **Verification test:**
  - `it('creates, updates, and deletes skill nodes via API')` — full CRUD round-trip, assert DB state after each step.

---

# Phase I — npm publish + Vercel docs site

> **Depends on:** A-G complete (you should not publish a non-deterministic Core).

## I1 — Replace `release:core` echo with a real release script
- **Files:** `package.json`, new `.github/workflows/release.yml`.
- **Steps:**
  1. `package.json:31` `release:core` → `npm run build:core && npm run test:core && npm run smoke:core && cd packages/core && npm publish --access public`.
  2. New workflow on tag `core-v*`: same steps + `actions/setup-node` with NPM_TOKEN secret.
- **Verification test:**
  - Manual: `npm pack --dry-run` in `packages/core` lists ~71 files, no test files. Add a CI step `verify-pack` that asserts this.
  - `it('release:core script is wired')` — read `package.json`, assert `scripts['release:core']` does not contain `echo`.

## I2 — Publish v0.2.0 to npm
- **Steps:**
  1. Bump `packages/core/package.json` version to `0.2.0` (reflecting all features added since 0.1.0).
  2. Tag `core-v0.2.0`, push, watch CI publish.
- **Verification test:** post-publish smoke — `cd /tmp && npm init -y && npm install @noesis-edu/core@0.2.0 && node -e 'import(\"@noesis-edu/core\").then(m => { if (m.VERSION !== \"0.2.0\") process.exit(1) })'`.

## I3 — Docs site scaffolding (Astro Starlight)
- **Files:** new `docs/site/`.
- **Steps:**
  1. `npm create astro@latest docs/site -- --template starlight`.
  2. Source content from `packages/core/README.md`, `docs/API_REFERENCE.md`, `docs/architecture/*`.
  3. Apply locked palette (Phase G).
- **Verification test:**
  - Local: `npm run dev` in `docs/site/` serves on 4321.
  - CI: `npm run build` in `docs/site/` produces a `dist/` directory.

## I4 — Vercel deployment
- **Files:** new `vercel.json` at repo root; configure project on vercel.com.
- **Steps:**
  1. `vercel.json` with `buildCommand: "cd docs/site && npm run build"`, `outputDirectory: "docs/site/dist"`.
  2. Connect GitHub repo to Vercel; enable previews.
- **Verification test:**
  - `it('vercel.json exists at repo root')` — `expect(fs.existsSync('vercel.json')).toBe(true)`.
  - Manual: load the deploy preview URL, see brand-applied docs.

---

# Phase J — Audit-backlog cleanup

> Independent items from `docs/ACTION_PLAN.md` BACKLOG and missing tests. Each is small.

## J1 — Tier-1 missing tests
- **Files:** `packages/core/src/__tests__/core.test.ts`.
- **Steps:**
  1. Add `describe('Critical Path: events for skills not in graph')` — process a `practice` event whose `skillId` is not in the graph; assert behavior is documented (decide: throw? warn? ignore?). Pin behavior in the test.
  2. Add `describe('Critical Path: multi-learner isolation')` — process events for `learner-A` and `learner-B` interleaved; assert each learner's `pMastery` matches their own events only.
- **Verification test:** the tests themselves.

## J2 — Tier-2 missing tests
- **Files:** `packages/core/src/__tests__/bkt.test.ts`, `packages/core/src/__tests__/sessionPlanner.test.ts`, `packages/core/src/__tests__/fsrs.test.ts`.
- **Steps:**
  1. BKT convergence numbers — assert "with default params, 2 consecutive correct answers reach 0.85" (the `ALGORITHM_AUDIT.md` Warning #1 fact). If parameters change later this test will fail and force a documentation update.
  2. Planner+relearning: session planner with one skill in `'relearning'` blocking dependent skills.
  3. FSRS rating=4 (Easy) interval-jump on a new card — assert interval matches `initialStability[3] * 9 * (1/0.9 - 1)` ≈ 0.633 days.
- **Verification test:** the tests themselves.

## J3 — Remove dead `linkGoogleAccount`
- **Files:** `apps/server/sqlite-storage.ts`.
- **Steps:**
  1. Delete `linkGoogleAccount` (lines 179-…) — confirmed unused (zero callers).
  2. Update `docs/DATA_MODEL_AUDIT.md` table to remove the row.
- **Verification test:**
  - `it('IStorage does not declare linkGoogleAccount')` — read `apps/server/storage.ts`, assert no occurrence.
  - `it('SqliteStorage does not declare linkGoogleAccount')` — same in `sqlite-storage.ts`.

## J4 — BKT default-parameter pedagogy decision (J4 is BLOCKED on §6 of `todo.md`)
- After decision: bump defaults; update `ALGORITHM_AUDIT.md`; add a regression test asserting the new convergence count.

## J5 — FSRS spec-conformance decision (BLOCKED on §6)
- After decision: either converge to `(1 + 19t/(81S))^(-2)` or document the divergence with a fixture-based regression test that pins the implementation curve.

## J6 — Dependency cleanup (per `SIMPLIFICATION_AUDIT.md`)
- **Files:** `package.json`.
- **Steps:**
  1. Remove `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-runtime-error-modal` from devDependencies (assuming Replit is no longer the deployment target; verify §6).
  2. Remove duplicate `webgazer` and `openai` from root (keep them in adapter packages).
  3. Sweep with `depcheck` (or equivalent) and remove confirmed-unused: `cmdk`, `input-otp`, `embla-carousel-react`, `react-resizable-panels`, `vaul`, `next-themes`, `react-day-picker` if not used.
- **Verification test:** add CI step `npx depcheck --ignores='@types/*,prettier'` that fails on unused dependencies.

---

# Phase K — Repo split (`PRODUCTION_READINESS.md` §3.1, §4e, §5)

> **BLOCKED on §6.1 of `todo.md`.**

## K1 — Decision
- Path A: extract apps to `noesis-mvp-demo`; keep this repo as `noesis-core` SDK + `docs/site/`.
- Path B: amend `INTENTION.md` to legitimize the monorepo; rename to `noesis-platform`.

## K2 — Execute Path A (if chosen)
- New repo `noesis-mvp-demo` with `apps/server` + `apps/web-demo` + `shared/schema.ts` + `Dockerfile` + `docker-compose.yml`.
- New repo `noesis-pilot-br` for Phase-1 product (consumes `@noesis-edu/core` and `@noesis/content-pt-br-math` as published packages).
- Trim root `package.json` to dev dependencies only.
- **Verification test:** `it('this repo only ships SDK packages')` — assert `apps/` directory does not exist.

## K3 — Execute Path B (if chosen)
- Amend `INTENTION.md` and `architecture/CORE_SDK_CONSTITUTION.md`.
- **Verification test:** `it('INTENTION mentions monorepo and acknowledges apps/')` — read `INTENTION.md`, assert language matches the amendment.

---

# Phase L — Pilot-scale simplification (conditional, depends on Phase K)

> **BLOCKED on §6.1 of `todo.md`.** If Path A is taken, much of this happens automatically. If Path B, it still applies.

## L1 — Delete pilot-overkill files
- `apps/server/performance.ts` (if perf monitoring is overkill).
- `apps/server/openapi.ts` (if no OpenAPI consumer; otherwise keep updated as canonical API spec — Phase F4 already handles consistency).
- `attached_assets/` — move to `docs/historical/`.
- **Verification test:** `it('deleted files do not exist')` — assertion list.

## L2 — Simplify infrastructure
- Storage backends: choose SQLite-only (drop `MemStorage`, `DatabaseStorage`, `db.ts`).
- Health checks: collapse to `GET /health` returning `{ status: 'ok' }`.
- WebSocket: drop subscription/heartbeat/DoS for 10–20 users; keep send/recv.
- CSRF: keep (security layer).
- Rate limiting: collapse 4 tiers → 2 (general + LLM).
- **Verification test:** suite of `it('does not export <removed-symbol>')` regression tests + smoke tests on the simplified endpoints.

---

# Cross-cutting practices (apply to every task above)

- **Determinism contract.** Every new test that creates an engine MUST use `createDeterministicEngine` and a deterministic ID generator unless the test explicitly verifies a non-deterministic path.
- **Test naming.** New tests should follow the `Critical Path:` / `Edge Case:` / `Regression:` prefix convention already used in `core.test.ts`.
- **CI gating.** Every new test goes into the existing `.github/workflows/ci.yml` `test` job. The build fails on any test failure.
- **No new "as any" casts.** If a type-system gap forces one, add a TODO and a follow-up task.
- **Code coverage budget.** New code paths must keep core package coverage ≥80%. Update `vitest.config.ts` thresholds when bumping floors.

---

# Dependency graph (text)

```
A1 → A2 → A3 ──────────────────────────────────────────────┐
        ↓                                                   │
        B1 → B2                                             │
        ↓                                                   │
        C1 → C2 → C3                                        │
              ↓     ↓                                       │
              D1 → D2 → D3                                  │
              ↓                                             │
              E1 → E2 → E3 → E4 → E5 → E6                   │
                                  ↓                         │
                                  H1 → H2 → H3 → H4 → H5 ─→ H6 → H7
F (docs) — independent, can land any time after A
G (brand) — independent, can land any time before H
I1 → I2 → I3 → I4 (npm + docs site, after A-G)
J — independent BACKLOG cleanup
K (repo split) — orthogonal, BLOCKED on §6.1
L (simplification) — BLOCKED on K
```

---

# What "definitely works" means at the end

After all phases land, every item in the previous Truth Audit's lower tiers has:
- **A direct line of code** that implements it (file path + function name).
- **A named test** that asserts the property.
- **A CI gate** that fails the build if the test breaks.

The "Probably works / Unclear / Does not work / Does not exist" tiers are emptied. Everything in `todo.md` is either DONE (linked to a commit and a verification test) or explicitly BLOCKED on §6.

---

# Estimated scope (very rough)

| Phase | Calendar weeks (1 senior eng full-time) | Notes |
|---|---|---|
| A | 1 | Foundation; reshuffles defaults across 5 files. |
| B | 1 | New API + 2 transports. |
| C | 1.5 | Core types + planner enforcement. |
| D | 1 | UI plumbing + helmet conditional. |
| E | 2.5 | New endpoints + engine manager + WS broadcast. |
| F | 0.5 | Doc edits + CHANGELOG. |
| G | 1 | Awaiting brand assets. |
| H | 6–8 | The bulk of pilot product. Decompose further before starting. |
| I | 0.5 | Mostly automation. |
| J | 1 | Cleanup. |
| K | 0.5 | Mostly mechanical once §6.1 decided. |
| L | 1 | Mostly deletions. |

Total to "Core production-ready" (A+B+C+D+E+F+G+I): ~9 weeks.
Total to Phase-1 pilot live: +6–8 weeks (H), making ~17 weeks. Matches `INTENTION.md` Year-1 horizon (Months 0–8 lead-up, Months 9–12 pilot run).
