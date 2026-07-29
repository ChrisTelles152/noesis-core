# Production Readiness — Noesis Core

**Reviewed against:** `INTENTION.md` (project vision and scope)
**Review date:** 2026-04-26
**Reviewer:** edwardtheclaw

This document is a code review against stated intent. Findings are direct.

---

## 1. What Was Built

### Repository shape
A single npm workspace monorepo (`noesis-monorepo`, private) with four packages and two apps:

- `packages/core` (`@noesis-edu/core`, v0.1.0) — TypeScript learning engine. **Zero runtime dependencies.** Module map (`packages/core/src/`):
  - `constitution.ts` — interface contracts (SkillGraph, LearnerModel, MemoryScheduler, SessionPlanner, TransferGate, DiagnosticEngine, NoesisCoreEngine) plus event schema (`PracticeEvent`, `DiagnosticEvent`, `TransferTestEvent`, `SessionEvent`, `ImplicitCreditEvent`).
  - `events/index.ts` — event factories with injectable `ClockFn` and `IdGeneratorFn`. Includes `createDeterministicIdGenerator()`. Defaults leak `Date.now()` / `Math.random()` (see §3).
  - `learner/BKTEngine.ts` — full four-parameter Bayesian Knowledge Tracing (`pInit`, `pLearn`, `pSlip`, `pGuess`).
  - `memory/FSRSScheduler.ts` — FSRS spaced repetition (stability/difficulty/retrievability, ratings 1–4).
  - `graph/SkillGraphImpl.ts` — DAG with cycle detection, topological sort, transitive prerequisites, "encompassed skills" (FIRe-style trickle-down credit).
  - `planning/SessionPlannerImpl.ts` — priority-driven next-action selection (review > transfer > error > intro > consolidation), optional knock-out greedy set-cover.
  - `transfer/TransferGateImpl.ts` — near/far transfer test gating.
  - `diagnostic/DiagnosticEngineImpl.ts` — cold-start placement test generation/analysis.
  - `engine/NoesisCoreEngineImpl.ts` — wires it all together; `exportState`/`importState` for replay.
  - `engine/metrics.ts` — mastery curve, learning speed, knock-out efficiency.
  - `persistence/index.ts` — `NoesisStateStore` interface + `InMemoryStateStore`.
- `packages/sdk-web` (`@noesis/sdk-web`) — thin facade that wires Core + adapters. Workspace-only deps.
- `packages/adapters-llm` (`@noesis/adapters-llm`) — OpenAI provider (required), Anthropic provider (optional), fallback provider, manager, orchestration helper.
- `packages/adapters-attention-web` (`@noesis/adapters-attention-web`) — WebGazer.js wrapper for browser eye tracking.

### Apps
- `apps/server` — full Express backend: Passport.js local + Google OAuth (`auth.ts`), CSRF (`csrf.ts`), Helmet, rate limiting (100/15min general, ~10/min for LLM), Drizzle/PostgreSQL primary with better-sqlite3 fallback (`sqlite-storage.ts`), Zod validation, WebSocket (`websocket.ts`), event bridge converting server `LearningEvent` ↔ Core `NoesisEvent` (`event-bridge.ts`), routes for orchestration, learning events, mastery, analytics, OpenAPI doc.
- `apps/web-demo` — React 18 + Vite SPA. Pages: `Home`, `Documentation`, `Demo`, `Dashboard`, `CoreSmoke`, `Login`, `Register`, `not-found`. Hooks for SDK, mastery tracking, attention tracking, auth, CSRF, WebSocket. Recharts visualizations, Radix UI + Tailwind, Wouter router.

### Data model
`shared/schema.ts` — Drizzle pgTables for `users`, `learning_events`, `learning_objectives`, `mastery_progress`, `engine_states`. Server-app schema, distinct from Core's event types (bridged via `event-bridge.ts`).

### Tests
~41 test files, ~800+ tests via Vitest. Core has 17 dedicated test files (BKT, FSRS, planner, graph, transfer, diagnostic, persistence, encompassing, prereq mastery, learning speed, knock-out review, metrics, rating, loader, integration). Server has 15 (auth, csrf, routes, event-bridge, websocket, health, logger, performance, storage). SDK-web and adapters have their own test suites.

### Docs
`docs/` contains: `ACTION_PLAN.md`, `ALGORITHM_AUDIT.md`, `API_GAP_ANALYSIS.md`, `API_REFERENCE.md` (872 lines), `DATA_MODEL_AUDIT.md`, `INVESTIGATION_PROMPTS.md`, `SIMPLIFICATION_AUDIT.md`, `TESTING_STRATEGY.md`, plus `architecture/CORE_SDK_CONSTITUTION.md`, `CORE_PUBLISH_READINESS.md`, `ENG_PROOF_CORE_COMPAT.md`. Root: `README.md`, `STATUS.md`, `CONTRIBUTING.md`, `INTENTION.md`, `CODEBASE_ANALYSIS.md`.

### CI / build
`.github/workflows/ci.yml` runs lint (ESLint, max-warnings 0) → typecheck (`tsc`) → test+coverage (Codecov) → build (packages + apps) → conditional Docker build → `npm audit`. Dockerfile and docker-compose.yml present. Replit `.replit` config.

---

## 2. Alignment With Intent

| MVP Feature (per `INTENTION.md`) | Status | Evidence |
|---|---|---|
| Core SDK: learner state, mastery advancement, sequencing, confidence, decay, spaced reinforcement, deterministic pure transitions, full event log → replayable | ✅ | `packages/core/src/{learner,memory,planning,graph,events,engine}` — implemented and tested. |
| Canonical learning loop (Intro → Recall → Application → Reflection → Spaced) | 🟡 | Planner produces `SessionAction.type ∈ {practice, review, diagnostic, transfer_test, prerequisite_probe, rest}` but does **not** enforce the five-stage canonical sequence. Loop is implicit, not codified. |
| **Cognitive-State Vector (NALS): attention (A), recall strength (R), affect (F) with confidence + timestamp** | ❌ | No `CognitiveStateVector` type in `constitution.ts`. Core tracks mastery + memory only. Attention is shoved into ad hoc `learnerState.attention` blobs at the server route layer (`apps/server/routes.ts`). Affect is nowhere. |
| Mastery Graph: DAG, prerequisite edges, mastery [0,1], threshold, BKT-compatible/logistic | ✅ | `SkillGraphImpl` + `BKTEngine` + `SessionConfig.masteryThreshold` (default 0.85). Full BKT, not simplified logistic. |
| Input Adapters per platform: XR sensors, webcam, mouse/keyboard latency, mobile touch/motion/audio, optional biometrics | 🟡 / 🚫 | Webcam via `adapters-attention-web` (WebGazer) only. XR explicitly out of scope per INTENTION. Mobile, mouse/keyboard latency, audio, biometrics — none. |
| Pluggable LLM Orchestration ("Noesis Tutor"): planner / explainer / evaluator + rules-based fallback, LLM-agnostic | 🟡 | `adapters-llm` has provider abstraction (OpenAI, Anthropic optional, fallback) and an `orchestration.ts` helper, but no first-class `Planner`/`Explainer`/`Evaluator` interface in Core. Rules-based fallback exists. |
| Developer SDKs: TypeScript first, then Unity, React/RN, Swift, Kotlin | 🟡 | TypeScript ✅. Others not started — reasonable per phasing. |
| Analytics/Dashboard: mastery curves, attention heatmaps, drop-off, exportable data | 🟡 | Mastery curves and metrics implemented (`engine/metrics.ts`, `Dashboard.tsx` + Recharts). No attention heatmaps. No drop-off analysis. No CSV/JSON export endpoint. |
| **Phase-1 product surface (Noesis v1 Brazil STEM):** 80–150-node math graph, diagnostic placement quiz, dependency-unlock guided path, per-node explanations + worked examples + exercises, spaced review queue, mentor dashboard (student list, progress, CSV export), authoring admin | ❌ | **Zero implementation.** No Portuguese strings anywhere in source. No math topic graph (only `algebra`/`geometry` strings used as test fixtures). No item bank. No worked examples. No mentor view. No CSV export. No authoring admin. |
| Companion assets: YouTube channel, Golden Sequence website | 🚫 | Out of scope for this repo — not built. |
| Determinism, dependency-minimal, replayable, subject-agnostic, UI-agnostic Core | 🟡 | Core itself is dependency-free and event-sourced with replay. **But defaults are non-deterministic** (see §3). |
| Time and randomness must be injectable | 🟡 | They are injectable. They are also non-deterministic by default. No enforcement. |
| Open-core split: SDK + adapters open; orchestration/analytics/enterprise proprietary; two GitHub orgs | ❌ | All four packages live in one monorepo. No proprietary surface separation. No `noesis-open` / `noesis-dev` split. |
| MVP demo in `noesis-mvp-demo` (separate repo) | ❌ | Demo lives inside this repo as `apps/web-demo` + `apps/server`. |
| Brand: Cloudbone White / Slate Grey / Neural Copper / Iris Bloom / Glacial Cyan; spiral-eye logo; geometric sans + soft serif | ❌ | Default Tailwind theme + Radix defaults. `generated-icon.png` is generic. No evidence locked palette is applied in `tailwind.config.ts` or components. |
| Determinism regressions are always breaking | 🟡 | No CI guard for determinism (no replay-equivalence test in CI gating). |
| Brand must NOT signal surveillance / attention extraction / gamification | 🟡 | WebGazer.js (continuous webcam-based gaze tracking) is shipped as the **default attention path**. Brand-implication risk; INTENTION explicitly says first MVP should use *simulated attention via explicit user feedback*. |

---

## 3. Gaps and Drift

This is where the repo contradicts the stated intent.

1. **Wrong artifact in this repo.** `INTENTION.md` says the MVP demo is a separate repo (`noesis-mvp-demo`) and Core is a dependency-minimal SDK. Reality: this repo is a full-stack web product (Express + Passport + Google OAuth + Postgres/SQLite + WebSocket + React SPA + auth UI) wrapped around the Core SDK. The Core package is good; everything around it is off-charter for the "Core Finalization" stage.

2. **Non-deterministic defaults.** INTENTION: "Time and randomness must be injectable. … Determinism regressions are always breaking." Reality, in `packages/core/src`:
   - `events/index.ts:51` — `defaultClock = () => Date.now()`
   - `events/index.ts:63` — `defaultIdGenerator` uses `Math.random()` for UUID v4
   - `learner/BKTEngine.ts:96` — constructor default `clock = () => Date.now()`
   - `memory/FSRSScheduler.ts:70` — same
   - `engine/NoesisCoreEngineImpl.ts:183-184, 729` — same, plus `Math.random().toString(36)` ID fallback
   Injection works; *enforcement* does not. A consumer who forgets to pass a clock silently gets non-determinism. There is no CI test asserting replay equivalence under fixed seed.

3. **NALS Cognitive-State Vector is missing from Core.** INTENTION calls out attention (A), recall strength (R), affect (F) with confidence + timestamp as a first-class spec. `constitution.ts` defines no such type. Affect is not tracked anywhere. Attention is duct-taped into `apps/server/routes.ts` as an unstructured `learnerState.attention` blob. This is one of the named MVP features — and it's not in the engine.

4. **Canonical learning loop is not enforced.** The five-stage loop (Intro → Recall → Application → Reflection → Spaced) is asserted as something Core "enforces existence and order" of. The planner emits action *types* but does not enforce the five-stage sequence, and `SessionAction.type` does not include `concept_introduction`, `application`, or `reflection` as distinct stages.

5. **Phase-1 wedge is 0% built.** "Brazil-first, fully Portuguese" is the named Year-1 product. Search for Portuguese strings, pt-BR locale, Brazilian curriculum content, ITA/IME/Olympiad item context: zero hits in source. The web demo is in English. No i18n framework exists. No 80–150-node math graph. No diagnostic placement quiz. No mentor dashboard. No authoring admin. None of the Phase-1 product surface listed in INTENTION exists.

6. **WebGazer ships as the attention default.** INTENTION: "No real XR sensor integration in the first MVP demo (simulated attention via explicit user feedback)." `README.md` claims "Attention Tracking … Ready" and `useAttentionTracking.ts` wires WebGazer. That is a webcam-based passive tracker — exactly the surveillance-adjacent surface the brand rules forbid. INTENTION wanted simulated attention until later.

7. **Brand DNA not implemented.** INTENTION locks a palette (Cloudbone White, Slate Grey, Neural Copper, Iris Bloom, Glacial Cyan), a type system (geometric sans + soft serif), and a spiral-eye logo. `tailwind.config.ts` is stock; `generated-icon.png` is unrelated. The "sacred-tech" aesthetic is not visible in the UI.

8. **Heavy runtime stack at the monorepo level.** Root `package.json` pulls in bcrypt, Passport (+ Google OAuth strategy), Drizzle ORM, @neondatabase/serverless, express-rate-limit, helmet, framer-motion, FontAwesome, recharts, Radix, react-day-picker, embla-carousel, vaul, etc. Acceptable inside `apps/`; problematic for the published-SDK story because the *repo* now reads as a SaaS app, not a pure SDK + tiny demo. The Core package itself is clean — but a developer browsing the repo sees an Express auth product first.

9. **README claims contradict INTENTION.** `README.md` lists "XR Support — Planned" and "Voice Interface — Planned" as headline features. INTENTION explicitly rules XR sensors out of MVP and does not list voice. Drift.

10. **Open-core split not executed.** All packages — including ones INTENTION marks as the proprietary monetization surface (orchestration, full analytics) — are MIT-licensed and public in one org. Either INTENTION needs amendment or the split has been silently abandoned.

11. **Stale `STATUS.md` / `PRODUCTION_READINESS.md` / `CODEBASE_ANALYSIS.md`.** Pre-existing root docs reference a prior pilot framing ("noesis-pilot", "noesis-eng", investigation-prompts workflow, fix-algorithm tasks) that no longer matches `INTENTION.md`. They are now contradictory artifacts the next reader has to triangulate.

12. **No deployed docs site, no published npm package.** INTENTION's success criterion for the current stage explicitly names "deployed docs site (Vercel) … runnable demo (Replit) … Noesis Core SDK published as a dependency-minimal TypeScript package." The npm tarball would be fine to publish today — but it has not been published. There is no `vercel.json` and no docs site URL.

---

## 4. What Is Actually Missing to Hit MVP

Concrete tasks. File paths and symbol names where applicable.

### 4a. Make Core actually deterministic by default

- In `packages/core/src/events/index.ts`, replace the `defaultClock` and `defaultIdGenerator` exports with a `requireClock()` helper that **throws** if no clock is supplied to public constructors, OR keep defaults but log a one-time `console.warn` and tag any event produced with them as `nonDeterministic: true` in dev builds.
- Apply the same to `BKTEngine` constructor (`packages/core/src/learner/BKTEngine.ts:96`), `FSRSScheduler` constructor (`packages/core/src/memory/FSRSScheduler.ts:70`), and `NoesisCoreEngineImpl` constructor (`packages/core/src/engine/NoesisCoreEngineImpl.ts:183-184, 729`).
- Add a CI test `packages/core/src/__tests__/replay.test.ts` that runs N events through the engine with a fixed clock + deterministic ID generator, exports state, re-imports, replays the same events, and asserts byte-identical state. Wire it into the `test` job in `.github/workflows/ci.yml` as a hard-fail.

### 4b. Add NALS Cognitive-State Vector to Core

- In `packages/core/src/constitution.ts`, add:
  ```ts
  export interface CognitiveStateVector {
    attention: { value: number; confidence: number; timestamp: number };
    recallStrength: { value: number; confidence: number; timestamp: number };
    affect: { value: number; confidence: number; timestamp: number };
  }
  ```
- Add a `CognitiveStateEvent` to the event union; add a reducer in `NoesisCoreEngineImpl` that updates the per-learner CSV from input-adapter events.
- Surface `getCognitiveState(learnerId)` on `NoesisCoreEngine`.
- Add `packages/core/src/__tests__/cognitiveState.test.ts`.

### 4c. Codify the canonical learning loop

- Extend `SessionAction.type` in `constitution.ts` to include `concept_introduction`, `application`, `reflection` as distinct stages alongside the existing `practice`, `review`, `diagnostic`, `transfer_test`, `prerequisite_probe`, `rest`.
- In `SessionPlannerImpl`, enforce that a new skill cannot move to `transfer_test` without a recorded `concept_introduction` → `practice` → `application` → `reflection` history for that skill.
- Add tests asserting the order constraint.

### 4d. Replace WebGazer default with simulated attention

- In `packages/adapters-attention-web/src/`, demote `webgazer-adapter.ts` to opt-in.
- Add `simulated-adapter.ts` that exposes "I am focused / I am drifting / break" buttons and emits `CognitiveStateEvent`s. Make it the default exported adapter.
- Update `apps/web-demo/src/hooks/useAttentionTracking.ts` and `README.md` accordingly.

### 4e. Strip non-Core surface from this repo

Choose one and execute (this is the §5 decision):
- **Option A (matches INTENTION):** Move `apps/server/` and `apps/web-demo/` into a new repo `noesis-mvp-demo`. Keep this repo as `noesis-core` with `packages/*` only, plus a docs site at `docs/site/` deployable to Vercel. Delete `shared/schema.ts` (server concern). Delete `drizzle.config.ts`, server-only deps from root `package.json`. Delete `Dockerfile`, `docker-compose.yml` (or move to demo repo).
- **Option B (amend INTENTION):** Acknowledge the monorepo, rename to `noesis-platform`, but still split publishable `packages/core` so it has its own clean release pipeline.

### 4f. Publish `@noesis-edu/core` to npm

- The package builds (`npm run build:core`). `prepublishOnly` is wired. `release:core` script exists.
- Run: `npm run build:core && npm run test:core && npm run smoke:core && cd packages/core && npm publish --access public`.
- Add a release workflow (`.github/workflows/release.yml`) triggered on tag `core-v*` that runs the same.
- Add `CHANGELOG.md` entry for v0.1.0.

### 4g. Deploy docs site

- Pick a generator (Astro Starlight or Docusaurus — Starlight matches "calm/timeless" brand better).
- Site root `docs/site/`. Source from `docs/API_REFERENCE.md` + `docs/architecture/`.
- `vercel.json` at repo root (or in `docs/site/` after split).
- Apply the locked palette at the site level — that's the first place the brand has to live.

### 4h. Phase-1 Brazil STEM wedge (if pursued in this repo; otherwise spawn a new repo)

- New package `packages/content-pt-br-math/` with:
  - `graph.json` — 80–150 skill nodes, prerequisites, descriptions in Portuguese.
  - `items/` — diagnostic and practice items keyed to skill IDs, with worked solutions.
  - `goldenSequence.json` — 3–5 curated sequences linking nodes.
- New app or page set:
  - Diagnostic placement quiz UI (Portuguese).
  - Guided path UI with dependency unlocks.
  - Per-node screens: explanation → worked example → exercises with immediate feedback.
  - Spaced review queue (consume `getNextAction` from Core).
  - Mentor dashboard route: student list, per-student mastery progress, CSV export endpoint (`GET /api/mentor/export?cohortId=…`).
  - Internal authoring admin (CRUD on graph nodes + items).
- i18n framework — `react-i18next` or equivalent; `apps/web-demo/src/locales/pt-BR/*`.

### 4i. Apply brand DNA

- Update `tailwind.config.ts` with the locked palette as named tokens (`cloudbone-white`, `slate-grey`, `neural-copper`, `iris-bloom`, `glacial-cyan`).
- Replace `generated-icon.png` with the spiral-eye logo asset.
- Set up two font families (geometric sans for UI, soft serif for long-form) in `tailwind.config.ts` and `index.css`.

### 4j. Reconcile docs

- Delete or rewrite `STATUS.md`, the prior `PRODUCTION_READINESS.md` (this file replaces it), `CODEBASE_ANALYSIS.md`. They reference a "noesis-pilot" / "noesis-eng" framing that contradicts `INTENTION.md`.
- Remove "XR Support" and "Voice Interface" from `README.md` headline features (they are not in MVP per INTENTION).

---

## 5. Verdict

**The Core SDK is on track. The repo around it is off-charter.**

`packages/core` is genuinely close to publish: zero deps, full BKT + FSRS + DAG + planner + transfer + diagnostic, event-sourced, importable/exportable state, well-tested (17 dedicated test files). With ~1–2 weeks of focused work — NALS Cognitive-State Vector added, deterministic-by-default enforcement, replay-equivalence CI test, npm publish, Vercel docs site — Core hits the "Core production-ready" milestone INTENTION names as the *current* stage.

But the repo as a whole has drifted into being a generic adaptive-learning SaaS scaffold (Express + Passport + Google OAuth + Postgres + WebGazer + React auth pages) rather than "SDK + tiny demo" plus a Phase-1 Brazilian STEM pilot. The Phase-1 wedge — Portuguese, math topic graph, diagnostic, mentor dashboard, Golden Sequence — is 0% built. There is no Portuguese string in the source tree.

**Single most important next action:** Decide and enforce the repo split this week. Either (a) extract `apps/server/` + `apps/web-demo/` into `noesis-mvp-demo`, leave this repo as Core + adapters + docs site, publish `@noesis-edu/core@0.1.0` to npm, and start a fresh `noesis-pilot-br` repo for the Brazilian STEM product; or (b) explicitly amend `INTENTION.md` to legitimize the monorepo and the auth stack. Doing neither — i.e., continuing to build app features inside the SDK repo — means every future PR continues to drift the codebase further from the stated intent.

Recommended: option (a). It matches INTENTION verbatim, unblocks npm publish, and forces the Phase-1 product team (when hired) to consume Core as a real external dependency — which is the only way to validate that Core actually is dependency-minimal and subject-agnostic.
