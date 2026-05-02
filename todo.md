# Noesis — Single Source of Truth for Tasks

> **What this is:** the canonical execution log + open work for the Noesis monorepo.
> **What this is not:** intent, vision, design rationale, or architecture spec — those live in
> `INTENTION.md`, `README.md`, `CONTRIBUTING.md`, `docs/architecture/*.md`, and the package READMEs.
>
> **Last consolidated:** 2026-05-01.
> **Audit scope:** documentation read-only (Phase 1) + code verification (Phase 2). Working notes
> in `.context/phase1-docs-audit.md` and `.context/phase2-code-verification.md` (gitignored).
> **Source docs that informed this list (preserved as historical analysis, not task tracking):**
> `INTENTION.md`, `STATUS.md`, `PRODUCTION_READINESS.md`, `CODEBASE_ANALYSIS.md` (superseded),
> `docs/ACTION_PLAN.md` (now superseded by this file), `docs/{ALGORITHM,API_GAP,DATA_MODEL,
> SIMPLIFICATION,TESTING}_AUDIT.md`, `docs/INVESTIGATION_PROMPTS.md`, `docs/architecture/*.md`,
> `apps/server/{README,API}.md`, `packages/*/README.md`, `packages/core/CHANGELOG.md`.
>
> **Status legend:**
> - `DONE` — landed in the codebase, verified against current files.
> - `DONE_WITH_CAVEAT` — implementation present but with a known limitation noted inline.
> - `PARTIAL` — partially implemented; remainder is captured as a child subtask.
> - `BLOCKED` — waits on a NEEDS_HUMAN decision; the decision is itself a task in §6.
> - `NOT_STARTED` — work to do.

---

## Phases at a glance

| # | Phase | Goal | Status |
|---|---|---|---|
| 0 | **Core Finalization** | `@noesis-edu/core` deterministic-by-default, NALS-complete, codified loop, npm-published, docs site live | NOT_STARTED (substantial pieces) |
| 1 | **Brazil STEM Wedge (Phase-1 product)** | 30–100 real Brazilian high-schoolers complete a 6–8-week program; measurable pre/post gains | NOT_STARTED |
| 2 | **Repo / Open-Core Reorganization** | Decide and execute the SDK-vs-app repo split per `INTENTION.md` | BLOCKED on §6 |
| 3 | **Documentation Reconciliation** | Single canonical task list (this file); other docs limited to intent/explanation | IN PROGRESS (this consolidation) |
| 4 | **Pilot-Scale Simplification (conditional)** | Trim heavy infra not needed at 10–20 users | BLOCKED on §6 (depends on repo-split decision) |
| 5 | **Audit-Backlog Cleanup** | Resolve `BACKLOG`/`NEEDS_HUMAN` items inherited from the 2026-04 audit pass | NOT_STARTED |
| 6 | **Open Strategic Decisions** | License, structure, brand, audience priority — decisions before code can land | NOT_STARTED |

---

# Phase 0 — Core Finalization

> Goal stated in `INTENTION.md`: "Noesis Core SDK published as a dependency-minimal TypeScript
> package with full determinism, replay correctness, injectable clock and RNG, event-sourced state,
> strong tests, public wiki, and a deployed docs site (Vercel) plus a runnable demo (Replit)."

## 0.1 — Make Core deterministic by default
**Status:** NOT_STARTED
**Context:** `INTENTION.md`: "Time and randomness must be injectable. … Determinism regressions are always breaking." Reality: code still ships non-deterministic defaults at five injection points, and there is no CI gate enforcing replay equivalence.
**Sources:** `PRODUCTION_READINESS.md` §3.2 + §4a.

### 0.1.1 — Strip non-deterministic defaults in core
- **Where:** `packages/core/src/events/index.ts:51` (`defaultClock = () => Date.now()`); `packages/core/src/events/index.ts:60-67` (`defaultIdGenerator` uses `Math.random()`); `packages/core/src/learner/BKTEngine.ts:96` (constructor default `clock`); `packages/core/src/memory/FSRSScheduler.ts:70` (constructor default `clock`); `packages/core/src/engine/NoesisCoreEngineImpl.ts:183-184, 729` (constructor + factory defaults for `clock` and `idGenerator`).
- **What:** Replace the silent defaults with a `requireClock()`-style helper that throws when no clock is supplied to public constructors, OR keep defaults but emit a one-time `console.warn` and tag any event produced with them as `nonDeterministic: true` in dev builds.
- **Status:** NOT_STARTED.

### 0.1.2 — Strip non-deterministic defaults in sdk-web bridge
- **Where:** `packages/sdk-web/src/core/CoreEngineAdapter.ts:65-71` (`generateId` uses `Math.random()`), `:90` (`clock = () => Date.now()`).
- **What:** Same treatment — fail fast or warn loudly if not injected.
- **Status:** NOT_STARTED.

### 0.1.3 — Add CI replay-equivalence test
- **Where:** New file `packages/core/src/__tests__/replay.test.ts`; wire into `.github/workflows/ci.yml` test job as a hard-fail.
- **What:** Run N events through the engine with a fixed clock + deterministic ID generator; export state; re-import; replay the same events; assert byte-identical state.
- **Status:** NOT_STARTED. Existing `core.test.ts` has a manual replay-equivalence test (cited by `TESTING_STRATEGY.md` Tier-1 #2 as DONE), but it is not gated separately and not titled to make a regression visible.

## 0.2 — Add NALS Cognitive-State Vector to Core
**Status:** NOT_STARTED
**Context:** `INTENTION.md` lists "Cognitive-State Vector (NALS spec): attention (A), recall strength (R), affect (F) — each with confidence and timestamp" as a named MVP feature. Reality: `packages/core/src/constitution.ts` has no `CognitiveStateVector` type and `NoesisEvent` has no `CognitiveStateEvent` member. Affect is nowhere in the codebase.
**Sources:** `PRODUCTION_READINESS.md` §3.3 + §4b.

### 0.2.1 — Define types in `constitution.ts`
- Add `CognitiveStateVector` interface: `{ attention: { value, confidence, timestamp }; recallStrength: {…}; affect: {…} }`.
- Add `CognitiveStateEvent` to `NoesisEvent` union; add to `events/index.ts` factory.

### 0.2.2 — Reduce events into engine state
- Add `processCognitiveStateEvent` reducer in `NoesisCoreEngineImpl`; persist a per-learner CSV history; surface `getCognitiveState(learnerId)`.

### 0.2.3 — Tests
- New file `packages/core/src/__tests__/cognitiveState.test.ts`.

## 0.3 — Codify the canonical 5-stage learning loop
**Status:** NOT_STARTED
**Context:** `INTENTION.md`: "Concept Introduction → Active Recall → Application → Reflection → Spaced Reinforcement (Core enforces existence and order, not presentation)." Reality: `SessionAction.type = 'practice' | 'review' | 'diagnostic' | 'transfer_test' | 'prerequisite_probe' | 'rest'`. The five canonical stages are not first-class.
**Sources:** `PRODUCTION_READINESS.md` §3.4 + §4c.

### 0.3.1 — Extend `SessionAction.type`
- Add `concept_introduction`, `application`, `reflection` (alongside existing types).

### 0.3.2 — Enforce 5-stage order in planner
- In `SessionPlannerImpl`, gate transition to `transfer_test` on a recorded `concept_introduction` → `practice` → `application` → `reflection` history for the skill.

### 0.3.3 — Tests
- Add planner-order-constraint tests in `packages/core/src/__tests__/sessionPlanner.test.ts`.

## 0.4 — Replace WebGazer default with simulated attention
**Status:** PARTIAL
**Context:** `INTENTION.md`: "No real XR sensor integration in the first MVP demo (simulated attention via explicit user feedback)." Brand rules forbid surveillance-adjacent defaults. Reality: `.env.example:53` has a `ENABLE_REAL_GAZE_TRACKING=false` flag but no simulated-attention adapter exists; `README.md:21` still headlines WebGazer as "Ready"; `apps/server/index.ts:49` sets `crossOriginEmbedderPolicy: false, // Needed for WebGazer`.
**Sources:** `PRODUCTION_READINESS.md` §3.6 + §4d.

### 0.4.1 — Add `simulated-adapter.ts`
- New file in `packages/adapters-attention-web/src/simulated-adapter.ts`; emits `CognitiveStateEvent` from explicit user buttons ("focused / drifting / break").

### 0.4.2 — Make simulated default
- `packages/adapters-attention-web/src/index.ts` exports `SimulatedAttentionTracker` as default; `WebGazerAdapter` becomes opt-in (kept for advanced users via env flag).

### 0.4.3 — Update `useAttentionTracking.ts`
- `apps/web-demo/src/hooks/useAttentionTracking.ts` should select adapter based on `ENABLE_REAL_GAZE_TRACKING`; default to simulated.

### 0.4.4 — Update README
- `README.md:21-22` should describe attention tracking as "simulated by default; WebGazer optional".

## 0.5 — Apply brand DNA
**Status:** NOT_STARTED
**Context:** `INTENTION.md`: locked palette (Cloudbone White, Slate Grey, Neural Copper, Iris Bloom, Glacial Cyan), spiral-eye logo, geometric sans + soft serif. Reality: `tailwind.config.ts` is stock Tailwind; `generated-icon.png` (985 KB) is unrelated; no font configuration matching the spec.
**Sources:** `PRODUCTION_READINESS.md` §3.7 + §4i.

### 0.5.1 — Tailwind palette tokens
- Update `tailwind.config.ts` with named tokens (`cloudbone-white`, `slate-grey`, `neural-copper`, `iris-bloom`, `glacial-cyan`).

### 0.5.2 — Replace logo
- Replace `generated-icon.png` with a spiral-eye logo asset (await asset delivery or commission).

### 0.5.3 — Set up dual font system
- Add geometric sans (UI) + soft serif (long-form) families in `tailwind.config.ts` and `apps/web-demo/src/index.css`.

## 0.6 — Publish `@noesis-edu/core` to npm
**Status:** NOT_STARTED
**Context:** `INTENTION.md` calls out npm-publish as part of the "Core production-ready" milestone. Reality: build pipeline works (`build:core`, `test:core`, `smoke:core`), `prepublishOnly` is wired, but the `release:core` script in `package.json:31` is just an `echo` and the package has never been published.
**Sources:** `PRODUCTION_READINESS.md` §3.12 + §4f.

### 0.6.1 — Run release manually for v0.1.0
- `npm run build:core && npm run test:core && npm run smoke:core && cd packages/core && npm publish --access public`.

### 0.6.2 — Add a release workflow
- New file `.github/workflows/release.yml` triggered on tag `core-v*` running the full release pipeline.

### 0.6.3 — Update CHANGELOG
- `packages/core/CHANGELOG.md` should add entries for: encompassed-skills/implicit credit, learning-speed multipliers, `prerequisite_probe` action type, knock-out reviews, `computeRating`, `getEffectiveMastery`. (See Undocumented Functionality in §3.4 below.)

## 0.7 — Deploy docs site (Vercel)
**Status:** NOT_STARTED
**Context:** `INTENTION.md`: "deployed docs site (Vercel) plus a runnable demo (Replit)." Reality: no `vercel.json`, no docs-site source.
**Sources:** `PRODUCTION_READINESS.md` §3.12 + §4g.

### 0.7.1 — Choose generator
- Recommendation: Astro Starlight (matches "calm/timeless" brand better than Docusaurus).

### 0.7.2 — Scaffold `docs/site/`
- Source from `docs/API_REFERENCE.md` + `docs/architecture/*` + package READMEs.

### 0.7.3 — Apply locked palette
- Site is the first place the brand visibly lives.

### 0.7.4 — `vercel.json` + custom domain
- Configure deployment.

---

# Phase 1 — Brazil STEM Wedge (Year 1 product)

> Goal: A live Noesis v1 used by 30–100 real Brazilian students completing a 6–8-week structured
> program in advanced math (and possibly physics), with measurable pre/post learning gains.
>
> **Status today:** 0% built. No Portuguese strings anywhere; no `packages/content-pt-br-math/`;
> no mentor dashboard; no diagnostic UI; no Golden Sequence website.
>
> **Sources:** `INTENTION.md` "Phase-1 product surface" + `PRODUCTION_READINESS.md` §3.5 + §4h.

## 1.1 — Content pack scaffolding
**Status:** NOT_STARTED. Depends on §6.4 (physics-in-v1 decision) for graph scope.

### 1.1.1 — `packages/content-pt-br-math/graph.json`
- 80–150 skill nodes covering middle + upper-secondary math; prerequisites; descriptions in Portuguese.

### 1.1.2 — `packages/content-pt-br-math/items/`
- Diagnostic and practice items keyed to skill IDs, with worked solutions in Portuguese.

### 1.1.3 — `packages/content-pt-br-math/goldenSequence.json`
- 3–5 curated reading sequences linking nodes.

## 1.2 — i18n infrastructure
**Status:** NOT_STARTED.

### 1.2.1 — Pick framework
- `react-i18next` recommended.

### 1.2.2 — `apps/web-demo/src/locales/pt-BR/*`
- Translation files; English remains a development locale only.

## 1.3 — Pilot UI surface
**Status:** NOT_STARTED.

### 1.3.1 — Diagnostic placement quiz UI (Portuguese)
### 1.3.2 — Guided path UI with dependency unlocks
### 1.3.3 — Per-node screens
- Explanation → worked example → exercises with immediate feedback.
### 1.3.4 — Spaced review queue UI
- Consume `getNextAction` from Core.
### 1.3.5 — Mentor dashboard
- Student list, per-student mastery progress, cohort views.
### 1.3.6 — `GET /api/mentor/export?cohortId=…` (CSV export)
### 1.3.7 — Internal authoring admin
- CRUD on graph nodes + items.

## 1.4 — Companion website (Golden Sequence)
**Status:** NOT_STARTED.
- Standalone deployment; 3–5 curated reading sequences linked into Noesis nodes.

## 1.5 — Companion YouTube assets
**Status:** NOT_STARTED. Outside this repo's scope but tracked here for completeness.
- 12–20 flagship lessons; 20–40 problem-solving shorts; host with Olympiad/ITA/IME/USP credibility.
- Decision needed in §6.5 (umbrella brand for the channel).

## 1.6 — Server-side endpoints needed by the pilot
**Status:** NOT_STARTED.
**Sources:** `docs/API_GAP_ANALYSIS.md` P0 + P1.

### 1.6.1 — `POST /api/curriculum/skills` (P0)
- Upload a skill graph JSON for a curriculum; store per-curriculum.

### 1.6.2 — `GET /api/core/next-action` (P0)
- Server runs `engine.getNextAction()` for thin-client flow.
- **Depends on 1.6.1 + a server-side `NoesisCoreEngine` instance.**

### 1.6.3 — `POST /api/core/practice` (P0)
- Server processes a practice event through engine; persists state; returns updated `LearnerProgress`.
- **Depends on 1.6.1.**

### 1.6.4 — `GET /api/core/progress` (P1)
- Returns `LearnerProgress` + per-skill mastery.

### 1.6.5 — Pagination on event/analytics endpoints (P1)
- Add `page`/`limit` to all `GET /api/analytics/*` and `GET /api/core/events`.

### 1.6.6 — Date-range filtering on analytics (P1)
- `startDate`/`endDate` query params.

### 1.6.7 — WebSocket broadcast on core-event store (P1)
- `POST /api/core/events` should call `wsService.broadcastLearningEvent()` after persisting.

### 1.6.8 — Resolve `learning_objectives` / `mastery_progress` tables (BLOCKED on §6.6)
- Either expose CRUD endpoints or remove the tables (they exist in both schemas with no API access).

---

# Phase 2 — Repo / Open-Core Reorganization

> **Status:** BLOCKED on the §6.1 decision (split or amend INTENTION).
>
> `PRODUCTION_READINESS.md` §3.1 + §4e + §5 names this as "the single most important next action."

## 2.1 — Execute the chosen path

### 2.1.1 — Path A (matches INTENTION verbatim — recommended in PRODUCTION_READINESS)
- Move `apps/server/` and `apps/web-demo/` into a new repo `noesis-mvp-demo`.
- Keep this repo as `noesis-core` with `packages/*` only + `docs/site/` (deployable to Vercel).
- Delete `shared/schema.ts`, `drizzle.config.ts`, `Dockerfile`, `docker-compose.yml` from this repo.
- Strip server-only dependencies from root `package.json`.
- Spawn a third repo `noesis-pilot-br` for the Phase-1 product.

### 2.1.2 — Path B (amend `INTENTION.md`)
- Rename to `noesis-platform`; legitimize the monorepo and the auth stack.
- Still split `packages/core` so it has its own clean release pipeline (Phase 0.6 handles this either way).

## 2.2 — Two-org GitHub split (`noesis-open` vs `noesis-dev`)
**Status:** BLOCKED on §6.2.
- INTENTION specifies an open-core split with two GitHub orgs. Reality: all 4 packages are MIT-licensed in one monorepo. Either execute the split or amend INTENTION.

---

# Phase 3 — Documentation Reconciliation

## 3.1 — Reconcile root README headline features
**Status:** NOT_STARTED.
- `README.md:26-27` lists "Voice Interface — Planned" and "XR Support — Planned"; `INTENTION.md:42-44` rules these out for MVP; `STATUS.md:21-28` lists them as "Out of scope". One of these surfaces is wrong.
- **Action:** drop both rows from `README.md` "Key Features" table OR amend `INTENTION.md`.
- Also drop the "Attention Tracking — ✅ Ready" claim per Phase 0.4.

## 3.2 — Reconcile port number across READMEs
**Status:** NOT_STARTED.
- `README.md:49-55` and `apps/server/index.ts:226-229` say 5174; `apps/server/README.md:21` and `apps/web-demo/README.md:21` say 5000.
- **Action:** update the two app READMEs to 5174.

## 3.3 — Reconcile `apps/server/API.md` with `docs/API_REFERENCE.md`
**Status:** NOT_STARTED.
- `apps/server/API.md` is older and missing `/api/core/events`, `/api/core/events/batch`, `/api/engine/state`, `/api/auth/google*`, `/api/auth/check-username`, `/api/llm/status`, `/api/auth/me`, `/api/auth/providers`, health and performance endpoints.
- **Action:** either delete `apps/server/API.md` (single source = `docs/API_REFERENCE.md`) or regenerate it from the OpenAPI spec.

## 3.4 — Sync `packages/core/README.md` and `packages/core/CHANGELOG.md`
**Status:** NOT_STARTED.
- `packages/core/README.md` describes `Skill` interface without `encompassedSkills`; lists `SessionAction` types missing `prerequisite_probe`.
- `packages/core/CHANGELOG.md` only has v0.1.0 (dated "2024-01-04" — should be 2026; six features added since then have no changelog entries).
- **Action:** rewrite README; add CHANGELOG entries for: encompassed skills + implicit credit; per-user learning speed; `prerequisite_probe` action type; knock-out reviews; `computeRating`; `getEffectiveMastery`.

## 3.5 — Update `STATUS.md`
**Status:** NOT_STARTED.
- File dated `2026-01-29`; many "Out of scope" items contradict `INTENTION.md` and `README.md`. The "Next Steps" list has been completed.
- **Action:** rewrite as a one-page snapshot pointing to `todo.md` for execution status, `INTENTION.md` for goals, and `PRODUCTION_READINESS.md` for current drift assessment.

## 3.6 — Update `docs/DATA_MODEL_AUDIT.md`
**Status:** NOT_STARTED.
- §"Critical Gaps" Gap 1 + Gap 2 narratives still claim "nobody calls them" / "cannot replay" though both fixes have shipped.
- **Action:** add a "RESOLVED" header at the top, leave the body as historical analysis, and link to this `todo.md` for current status.

## 3.7 — Mark `docs/ACTION_PLAN.md` superseded
**Status:** NOT_STARTED.
- This file (`todo.md`) replaces `docs/ACTION_PLAN.md`'s function. ACTION_PLAN's done-list is preserved here in §0–§5; its findings are now linked from §0–§5.
- **Action:** add a header note "SUPERSEDED by `todo.md`" with redirect; keep file for historical execution log.

## 3.8 — Decide on `attached_assets/`
**Status:** NOT_STARTED. Depends on §6.7.
- 3 files of pasted ideation docs; `SIMPLIFICATION_AUDIT.md` recommends deletion. They are historical only.
- **Action:** either move to `docs/historical/` and check in, or delete.

---

# Phase 4 — Pilot-Scale Simplification (conditional)

> **Status:** BLOCKED on §6.1 (repo-split decision). If Path A is chosen, much of this happens
> automatically when apps move out of the SDK repo. If Path B, simplification still needs to happen
> for the demo app to be coherent.
>
> **Sources:** `docs/SIMPLIFICATION_AUDIT.md`. ~3,400 LOC removable + ~950 LOC simplifiable.

## 4.1 — Delete pilot-overkill files (~2,430 LOC)

| File | Lines | Status |
|---|---|---|
| `apps/server/performance.ts` | 343 | NOT_STARTED |
| `apps/server/openapi.ts` | 776 (claimed 484 in audit; file is bigger) | NOT_STARTED |
| `attached_assets/` (3 files) | 305 | NOT_STARTED (also §3.8) |
| `apps/server/middleware/requestId.ts` | ~50 | NOT_STARTED (optional) |

(`apps/web-demo/src/sdk/*` duplicates already DONE — files are now re-export shims.)
(`ecosystem.config.cjs` already DONE — file deleted.)

## 4.2 — Simplify infrastructure (~950 LOC)

| Subsystem | Files | Lines | Status |
|---|---|---|---|
| Storage backends → SQLite only | `apps/server/storage.ts`, `db.ts`, drop `MemStorage` + `DatabaseStorage` | ~200 | NOT_STARTED |
| Health checks → single endpoint | `apps/server/health.ts` (253 → ~30) | ~220 | NOT_STARTED |
| WebSocket → minimal | `apps/server/websocket.ts` (514 → ~160) | ~350 | NOT_STARTED |
| CSRF → SameSite-only | `apps/server/csrf.ts` (171 → 0) | ~100 | NOT_STARTED (BLOCKED on security review) |
| Rate-limiting → single tier | `apps/server/index.ts` (4 tiers → 1+LLM) | ~30 | NOT_STARTED |

## 4.3 — Dependency cleanup
**Status:** NOT_STARTED.
- Remove from root `package.json`: `@neondatabase/serverless`, `connect-pg-simple`, `drizzle-*`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-runtime-error-modal`, `next-themes` (this is not a Next.js app).
- De-duplicate: `webgazer` and `openai` are listed in both root and adapter packages.
- Verify usage and remove if unused: `cmdk`, `input-otp`, `embla-carousel-react`, `react-resizable-panels`, `vaul`, `react-day-picker`.

## 4.4 — Config cleanup
**Status:** NOT_STARTED.
- Fix `components.json` shadcn path (currently points to `client/src/index.css`; should be `apps/web-demo/src/index.css`).
- Remove `.replit` if abandoning Replit hosting.
- Remove `drizzle.config.ts` if dropping PostgreSQL.

---

# Phase 5 — Audit-Backlog Cleanup

> Items from the 2026-04-10 audit pass that are valid findings deferred to a future session.

## 5.1 — Algorithm tuning (NEEDS_HUMAN — pedagogy decisions)
**Sources:** `docs/ALGORITHM_AUDIT.md` Warning #1, Observation #1; `docs/ACTION_PLAN.md` M7, M8.

### 5.1.1 — BKT default-parameter tuning (M7)
- 2 consecutive correct answers cross 0.85 with defaults (`pInit=0.3, pLearn=0.1, pSlip=0.1, pGuess=0.2`). Literature suggests 4–6.
- **Action:** lower `pLearn` to 0.05 OR lower `pInit` to 0.1; or accept current behavior with a documented pedagogy rationale.

### 5.1.2 — FSRS spec-conformance (M8)
- Implementation uses `R(t) = (1 + t/(9S))^(-1)` (reciprocal); FSRS v4/v5 spec uses `(1 + 19t/(81S))^(-2)` (power-law). Implementation is more "optimistic" about retention at long intervals.
- **Action:** decide whether to converge to spec or document the divergence.

## 5.2 — Tier-1 missing tests (HIGH blast radius)
**Sources:** `docs/TESTING_STRATEGY.md` Tier-1 #4, #5.

### 5.2.1 — Events for unknown skills
- New test in `packages/core/src/__tests__/core.test.ts` — process a `practice` event for a skill not in the graph; assert correct behavior (decide: throw vs ignore vs warn).

### 5.2.2 — Multi-learner isolation
- Two learners in same engine; verify state independence.

## 5.3 — Tier-2 missing tests
- BKT convergence numbers (correct/incorrect counts to cross thresholds).
- Session planner with relearning-state prerequisites blocking dependents.
- FSRS rating=4 (Easy) interval-jump behavior on new cards.

## 5.4 — Tier-3+ tests
- Diagnostic engine empty/minimal item-mappings; transfer-gate `getTransferStatus` workflow; metrics edge cases; graph-loader round-trip with all optional fields; health-check degraded states; perf-monitor retention limits; WebSocket auth edge cases; logger child-context propagation.

## 5.5 — `docs/DATA_MODEL_AUDIT.md` text updates (L7)
**Status:** Captured under §3.6. NOT_STARTED.

---

# Phase 6 — Open Strategic Decisions

> Each item is a decision that blocks downstream work. None are pure engineering. Listed in
> approximate priority order (most-blocking first).

## 6.1 — Repo split: extract apps OR amend INTENTION (BLOCKS Phase 2 and Phase 4)
- Recommendation in `PRODUCTION_READINESS.md`: Path A (extract apps; this repo becomes pure SDK + docs site).
- Decision rationale required for INTENTION update either way.

## 6.2 — Two-org GitHub split (`noesis-open` / `noesis-dev`)
- Bound to 6.1 but separable: even Path B can keep one repo with two orgs if proprietary surfaces are split per package.

## 6.3 — Open-source license: MIT vs Apache 2
- Currently MIT (per CONTRIBUTING.md). INTENTION marks this as unresolved.

## 6.4 — Physics inclusion in Phase-1 v1 (BLOCKS §1.1.1 graph scope)
- INTENTION leaves this open. If "yes," graph node count rises and content authoring expands.

## 6.5 — Public umbrella brand for YouTube channel (BLOCKS §1.5)
- Distinct from "Noesis" the SDK. Must be chosen before any video production.

## 6.6 — Demo: real LLM calls now or rules-based until later? (informs §1.6 ordering)
- INTENTION leaves open. Affects pilot cost + demoability.

## 6.7 — `attached_assets/` fate (BLOCKS §3.8)
- Move to `docs/historical/` (preserves planning history) or delete.

## 6.8 — Privacy / data governance / telemetry policy
- Not yet drafted. Required before any live pilot data is collected.

## 6.9 — Packaging strategy beyond TypeScript
- npm only? PyPI? Other ecosystems? INTENTION leaves open.

## 6.10 — Final mastery-update algorithm: simple logistic vs full BKT
- INTENTION lists this open. Code already commits to BKT (full 4-parameter). Decision is whether to formalize that as the answer or revisit.

## 6.11 — Long-horizon institution shape (10–30 yr)
- Free school for low-income high-aptitude students vs cross-subsidized model vs micro-campus vs full university vs university-anchored city. Not actionable now but tracked.

## 6.12 — For-profit vs non-profit; Delaware C-Corp + Brazilian sub
- Investor-readiness work; tracked here for completeness.

## 6.13 — Audience priority for current docs/site/demo emphasis
- INTENTION lists "developer adoption vs investor demoability vs internal team" as unresolved. Drives Phase-0 docs-site tone and Phase-1 demo polish.

---

# Appendix A — Verified DONE work (executive summary)

> Preserved from `docs/ACTION_PLAN.md` for historical continuity. Each line links a fix to its
> commit and is verifiable in the current code (Phase 2 verification confirmed all of these except
> where noted).

| Item | Source | Commit | Verified in code? |
|---|---|---|---|
| C1 — `ecosystem.config.cjs` deleted (hardcoded secrets) | `SIMPLIFICATION_AUDIT.md` | `d2ee83a` | ✅ |
| C2 — `registerTransferTests()` preserves planner config | `ALGORITHM_AUDIT.md` | `a2aec6b` (in current `NoesisCoreEngineImpl.ts:189, 429-438`) | ✅ |
| H1 — `SkillGraph.removeSkill()` cleans dangling refs | `ALGORITHM_AUDIT.md` | `db7d051` | ✅ (`SkillGraphImpl.ts:40-54`) |
| H2 — OpenAPI spec includes core/events + engine/state endpoints | `API_GAP_ANALYSIS.md` | `e04f1bb` | Probably (file is 776 lines; not opened in this audit) |
| M1 — `engine_states` table + `PUT/GET /api/engine/state` | Investigation Prompt 4 | `8da5a12` | ✅ (`schema.ts:124-138`, `routes.ts:461-499`) |
| M2 — `event-bridge.ts`; `/api/core/events*` endpoints | Investigation Prompt 4 | `1e973f6` | ✅ (`routes.ts:381-456`) |
| M3 — `MasteryTracker` `@deprecated`; recordPractice syncs both | `ALGORITHM_AUDIT.md` | `6581587` | ✅ (`policies/mastery.ts:16-32`, `NoesisSDK.ts:11-17, 113-122`) |
| M4-M6 — PG schema OAuth columns + nullable password + IStorage methods | DATA_MODEL audit | `42f379e`, `56c7351` | ✅ (`schema.ts:6-14`) |
| M9 — README test count updated to 800+/35 | `README.md` | `42f379e` | ✅ |
| M10 — web-demo SDK dedup → re-export shims | `SIMPLIFICATION_AUDIT.md` | `63aec43`, `2989bd0`, `db12d44` | ✅ (each shim 2-4 lines) |
| M11 — `CODEBASE_ANALYSIS.md` superseded notice | `CODEBASE_ANALYSIS.md` | `9171218` | ✅ |
| M12 — `MIGRATION_REPORT.md` checkboxes | `MIGRATION_REPORT.md` | `e3e0c30` | ✅ (one Phase-3 item still unchecked: property-based tests) |
| L1 — `CORE_PUBLISH_READINESS.md` test count 47→241 | `docs/architecture/` | `e3e0c30` | ✅ |
| L2 — OpenAPI Google OAuth routes | `openapi.ts` | `6d8f1a6` | Probably (not opened) |
| L3 — Cycle-detection DFS no early return | `ALGORITHM_AUDIT.md` | `1f8caf6` | ✅ (`SkillGraphImpl.ts:141-165`) |
| L4 — Diagnostic secondary-skill weighting | `ALGORITHM_AUDIT.md` | `0aad194` | Probably (not directly inspected) |
| L5 — Variable typo `zeroDegreeSkilss → zeroDegreeSkills` | `ALGORITHM_AUDIT.md` | `0aad194` | ✅ (`SkillGraphImpl.ts:200`) |
| Top-5 missing tests (export/import round-trip, replay equivalence, FSRS stuck-state, planner-rest, BKT diagnostic→practice) | `TESTING_STRATEGY.md` | `4118de3` | Probably (`core.test.ts` exists; not line-counted) |
| `getUserIdFromRequest` no longer falls back to user 1 | (security) | (n/a) | ✅ (`routes.ts:51-60`) |
| `generated-icon.png` exists | (n/a) | (n/a) | ✅ — but is generic per §0.5 |

---

# Appendix B — Functionality in code that is not described in the docs

> Phase-2 verification surfaced features that exist + are tested but are absent from
> `INTENTION.md` and the package READMEs. These should be reconciled in §3.4.

1. **Encompassed-skills / FIRe-style implicit credit.** `Skill.encompassedSkills`; `ImplicitCreditEvent`; `NoesisCoreEngineImpl.processPracticeEvent` propagation. Tests: `encompassing.test.ts`, `implicitCredit.test.ts`.
2. **Per-user, per-skill learning-speed multiplier.** `setLearningSpeed`/`getLearningSpeed`/`calibrateLearningSpeed`; serialized in v1.1 of state. Tests: `learningSpeed.test.ts`.
3. **`getEffectiveMastery`** — minimum mastery across the prerequisite subgraph. Tests: `prerequisiteMastery.test.ts`.
4. **`computeRating`** — confidence + responseTime → FSRS rating 1-4. Tests: `rating.test.ts`.
5. **Knock-out review selection** (`SessionConfig.enableKnockOutReviews`). Tests: `knockOutReview.test.ts`.
6. **Prerequisite re-validation** (`SessionConfig.prerequisiteRevalidationEnabled` + `SessionAction.type = 'prerequisite_probe'`). Tests: `prerequisiteMastery.test.ts`.
7. **`ENABLE_REAL_GAZE_TRACKING` env flag** in `.env.example` — partial WebGazer demotion. (See §0.4 for completion.)

---

# Appendix C — What lives where

> Single canonical map (after Phase 3 doc reconciliation completes).

- **Why and what (intent / vision / explanation):** `INTENTION.md`, `README.md`, `CONTRIBUTING.md`, `docs/architecture/{CORE_SDK_CONSTITUTION,ENG_PROOF_CORE_COMPAT}.md`, package READMEs.
- **What is open and being worked on (execution + history):** *this file (`todo.md`)*.
- **Frozen historical analysis (do not modify, link only):** `CODEBASE_ANALYSIS.md` (superseded), `PRODUCTION_READINESS.md` (the 2026-04-26 review), `docs/{ALGORITHM,API_GAP,DATA_MODEL,SIMPLIFICATION,TESTING}_AUDIT.md`, `docs/INVESTIGATION_PROMPTS.md`, `docs/architecture/{CORE_PUBLISH_READINESS,MIGRATION_REPORT}.md`, `docs/ACTION_PLAN.md` (after §3.7 marks it superseded).
- **API surfaces (current state):** `docs/API_REFERENCE.md` is canonical; `apps/server/API.md` should be retired (§3.3).
- **Status snapshot:** `STATUS.md` — to be reduced (§3.5) to one-page redirect.

---

# Appendix D — How to use this file

- New work goes in the appropriate Phase, with a status marker.
- When you start a task, change status to `IN_PROGRESS` (and remove on completion or move to Appendix A).
- When you finish a task, change to `DONE` and move a one-line summary to Appendix A with the commit SHA.
- If a task is blocked by a §6 decision, link the dependency explicitly.
- Never put intent or rationale here — link to `INTENTION.md` instead.
- Never duplicate task lists in other docs. The audit docs in `docs/` are historical analysis;
  their findings are imported into this file with `Sources:` links.
