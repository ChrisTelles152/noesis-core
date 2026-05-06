# PHASE_H_EXECUTION_PLAN — Atomized Subtask Plan

**Date:** 2026-05-03
**Status:** Active
**Owner:** noesis-core agent (Phase H-1) + delegated workspace agents (H-2 through H-5)
**Companion docs:** `UNIFICATION_ADR.md`, `PHASE_H_DIVERGENCE_LOG.md`

This document atomizes Phase H into orderable, independently-doable subtasks. Each subtask completes in 30 min to 2 hours and ends with a commit. Sub-phases H-2 / H-3 / H-4 are delegated to agents in the respective workspaces (`noesis-delf`, `noesis-math`, `noesis-eng`); H-5 is coordinated.

Mark subtasks `[x]` as they complete.

---

## Phase H-1 — Pull-up to `@noesis-edu/core@0.3.0-rc.0` ✅ **COMPLETE 2026-05-04**

PR #16: https://github.com/Noesis-Edu/noesis-core/pull/16
Branch: `phase-h-1/core-0.3.0` (24 commits)
Tests: 379 → **742** (+363 across 15 new test files)

### Sub-phase H-1.A — Foundation ✅

- [x] **H-1.A.1** Feature branch `phase-h-1/core-0.3.0` created.
- [x] **H-1.A.2** `EngineConfigOverrides` type + `validateEngineConfigOverrides()` (commit `092c4b9`, 18 tests).
- [x] **H-1.A.3** `AnswerNormalizer` interface + `LevenshteinMatcher` (commit `202c7a4`, 29 tests).
- [x] **H-1.A.4** `Channel` type folded into A.2 — single source of truth in `EngineConfigOverrides.ts`.

### Sub-phase H-1.B — Pure modules ✅

- [x] **H-1.B.1** `FatigueDetector` clock-injected port (commit `6c4fbcf`, 14 tests).
- [x] **H-1.B.2** `EloDifficultyCalibrator` with serialize/deserialize + deterministic tie-breaking (commit `1a713c7`, 23 tests).
- [x] **H-1.B.3** `ItemHistoryAggregator` Supabase-coupling stripped (commit `7992bab`, 23 tests).

### Sub-phase H-1.C — Engine extensions ✅

- [x] **H-1.C.1** `MultiChannelBKTEngine` with drilling discount + category modifier slot (commit `bb7bf64`, 41 tests).
- [x] **H-1.C.2** `LayeredMasteryModel` with calendar-day cooling-off + soft revocation (commit `c436c09`, 42 tests).

### Sub-phase H-1.D — Session machinery ✅

- [x] **H-1.D.1** `BudgetedSessionPlanner` with backlog control + new-skill caps (commit `7250ffe`, 33 tests).
- [x] **H-1.D.2** `SessionLifecycleManager` pure in-memory bookkeeping (commit `51bdd73`, 35 tests).
- [x] **H-1.D.3** `PlannerSnapshot` for deterministic session replay (commit `4ef3198`, 16 tests).
- [x] **H-1.D.4** `OptimisticLockingStateStore` interface + memory impl + retry helper (commit `9fa023d`, 24 tests).
- [x] **H-1.D.5** `SessionMetricsLogger` pure aggregator + stateful buffer (commit `9f403f3`, 30 tests).

### Sub-phase H-1.E — Surface updates ✅

- [x] **H-1.E.1** `getLearnerMetrics()` expanded with layered mastery + fatigue + difficulty options (commit `f137747`, 7 new tests).
- [x] **H-1.E.2** `createNoesisCoreEngine` accepts `EngineConfigOverrides`; reserved fields properly typed (commit `00f4d8a`, 8 + 9 tests).
- [x] **H-1.E.3** Barrel completeness lock — every 0.3.0 module reachable from package root (commit `f05cc11`, 20 tests).
- [x] **H-1.E.4** `@noesis-edu/core/contracts` types-only subpath added to `package.json` exports (commit `fe1c589`, 9 tests).

### Sub-phase H-1.F — Release prep ✅

- [x] **H-1.F.1** Version bumped to `0.3.0-rc.0` (package.json + VERSION constant + pinned-version test).
- [x] **H-1.F.2** CHANGELOG.md keep-a-changelog entry covering every new module.
- [x] **H-1.F.3** `docs/migration/0.2-to-0.3.md` consumer migration guide.
- [x] **H-1.F.4** All four release-prep checks passed: test:core (742/742), build:core (tsc clean), smoke:core (6/6), verify:core:pack (145.6 kB packed / 595.9 kB unpacked / 167 files).
- [x] **H-1.F.5** PR #16 opened (commit `0b86d4b`).

---

## Phase H-2 — Push-down delf  *(DELEGATED to noesis-delf agent)*

Coordinated via prompt sent to `noesis-delf/denpasar-v1` workspace.

- [ ] **H-2.1** Audit + replay-equivalence fixtures committed to `phase-h-prep` branch.
- [ ] **H-2.2** Bump `@noesis-edu/core` to `0.3.0-rc.0` in `package.json`.
- [ ] **H-2.3** Move French normalization to `@noesis-content/delf-fr` package (location TBD — likely `noesis-content/packages/delf-fr/` once `noesis-content` repo exists; staging in `noesis-delf/packages/content/` until then).
- [ ] **H-2.4** Run replay-equivalence framework against fixtures. Confirm zero behavior change.
- [ ] **H-2.5** Open PR.

---

## Phase H-3 — Push-down math  *(DELEGATED to noesis-math agent)*

Coordinated via prompt sent to `noesis-math/athens` workspace.

- [ ] **H-3.1** Audit + replay-equivalence fixtures committed to `phase-h-prep` branch.
- [ ] **H-3.2** Bump `@noesis-edu/core` to `0.3.0-rc.0`.
- [ ] **H-3.3** Replace `bktService.ts`, `fsrsService.ts`, `masteryService.ts`, `plannerService.ts`, `sessionStateService.ts`, `loggingService.ts`, `fatigueDetector.ts`, `difficultyCalibrator.ts`, `difficultyService.ts` with core imports.
- [ ] **H-3.4** Move math-specific (`generateMathItem`, `parseFraction`, `simplifyFraction`, math item types, math-tuned BKT priors, math response-time thresholds) to `@noesis-content/math-br`.
- [ ] **H-3.5** Run replay-equivalence framework. Confirm zero behavior change.
- [ ] **H-3.6** Open PR.

---

## Phase H-4 — Push-down eng  *(DELEGATED to noesis-eng agent)*

Coordinated via prompt sent to `noesis-eng/banjul` workspace.

- [ ] **H-4.1** Audit + replay-equivalence fixtures committed to `phase-h-prep` branch.
- [ ] **H-4.2** Bump `@noesis-edu/core` to `0.3.0-rc.0`.
- [ ] **H-4.3** Replace 9 service files with core imports (same set as math + `itemHistoryService.ts` + `plannerSnapshot.ts` + `sessionManagementService.ts`).
- [ ] **H-4.4** Move English-specific (40+ contractions, Portuguese accents, 25 grammar regex patterns, item type → channel map, grammar modifier values, per-channel BKT priors) to `@noesis-content/eng`.
- [ ] **H-4.5** Defer `answerOrchestrator.ts`, `preflightChecker.ts`, `exportCanonicalEvents.ts`, `dbWriteSurface.ts` move to UNIFICATION_ADR Migration Phase 3 (extract to `noesis-app`). Leave in eng for Phase H.
- [ ] **H-4.6** Run replay-equivalence framework. Confirm zero behavior change.
- [ ] **H-4.7** Open PR.

---

## Phase H-5 — Promote `0.3.0-rc` to stable  *(coordinated)*

- [ ] **H-5.1** All 3 vertical PRs (H-2.5, H-3.6, H-4.7) merged green.
- [ ] **H-5.2** noesis-proof confirms equivalence framework passes for all verticals.
- [ ] **H-5.3** Bump `packages/core/package.json` to `0.3.0` (drop `-rc.0`); update `VERSION` constant.
- [ ] **H-5.4** Publish to npm: `npm run release:core`.
- [ ] **H-5.5** Verticals update pinned version `0.3.0-rc.0` → `0.3.0`.
- [ ] **H-5.6** Notify `open-source-logic-v1` and `knowledgetracker-v1` of new release; coordinate their upgrades.

---

## Critical-path summary

H-1.A → H-1.B (parallelizable internally) → H-1.C → H-1.D (parallelizable internally) → H-1.E → H-1.F → publish 0.3.0-rc → [H-2 || H-3 || H-4 in parallel using vertical agents] → H-5.

**Bottleneck:** H-1.C.1 `MultiChannelBKTEngine` and H-1.C.2 `LayeredMasteryModel` are the highest-risk modules (most novel API design). Get them right first; everything else is mechanical.

**Parallelizable now (does not need core 0.3.0-rc):** the four prep prompts already sent to delf/math/eng/proof workspaces (audits + replay-equivalence fixtures + framework design). These run in parallel with H-1.

---

## Cross-references

- Plan motivation: `docs/architecture/UNIFICATION_ADR.md`
- Module-level analysis: `docs/architecture/PHASE_H_DIVERGENCE_LOG.md`
- Replay-equivalence framework (when built): `noesis-proof/adelaide/tools/phaseh-equivalence/`
- Vertical audit fixtures (when committed): `noesis-{eng,math,delf}/<workspace>/tests/phaseh/fixtures/`
