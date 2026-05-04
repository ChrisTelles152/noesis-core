# PHASE_H_EXECUTION_PLAN — Atomized Subtask Plan

**Date:** 2026-05-03
**Status:** Active
**Owner:** noesis-core agent (Phase H-1) + delegated workspace agents (H-2 through H-5)
**Companion docs:** `UNIFICATION_ADR.md`, `PHASE_H_DIVERGENCE_LOG.md`

This document atomizes Phase H into orderable, independently-doable subtasks. Each subtask completes in 30 min to 2 hours and ends with a commit. Sub-phases H-2 / H-3 / H-4 are delegated to agents in the respective workspaces (`noesis-delf`, `noesis-math`, `noesis-eng`); H-5 is coordinated.

Mark subtasks `[x]` as they complete.

---

## Phase H-1 — Pull-up to `@noesis-edu/core@0.3.0-rc` (in noesis-core)

### Sub-phase H-1.A — Foundation (types, interfaces; no logic)

- [ ] **H-1.A.1** Create feature branch `phase-h-1/core-0.3.0` off `ChrisTelles152/system-audit` (or main once merged).
- [ ] **H-1.A.2** Add `EngineConfigOverrides` type in `packages/core/src/constitution.ts`. Includes optional overrides for BKT priors per channel, FSRS intervals, mastery thresholds, session budget, response-time thresholds, fatigue thresholds, calibrator constants. Pure type — no implementation. Add validator `validateEngineConfigOverrides()`. Tests: shape parsing + validation.
- [ ] **H-1.A.3** Add `AnswerNormalizer` interface in `packages/core/src/answer/index.ts` (new dir). Method signatures: `normalize(input: string): string`, `matches(input: string, expected: string | string[]): boolean`. Add `LevenshteinMatcher` impl with typo-tolerance budget by length. Tests: Levenshtein cases, normalization round-trip.
- [ ] **H-1.A.4** Add `Channel` type + `ChannelConfig` + `ChannelMapping` in `constitution.ts`. Channel is a string ID (e.g., `"recog_mc"`, `"cloze"`, `"prod_typed"`, `"typed_answer"`, `"multiple_choice"`); core does not enforce a fixed channel set. `ChannelConfig` is `{ id: Channel; bktParams: BKTParams; responseTimeThresholdMs: number }`. Tests: type-only.

### Sub-phase H-1.B — Pure modules (no engine state deps)

- [ ] **H-1.B.1** Port `FatigueDetector` from `noesis-math/athens/src/lib/noesis/fatigueDetector.ts` to `packages/core/src/fatigue/FatigueDetector.ts`. Strip Supabase coupling — pure rolling-window detector: input `{ latencyMs, correct, timestamp }[]`, output `{ fatigued: bool, reason: string | null }`. Tests: ported from math + edge cases.
- [ ] **H-1.B.2** Port `EloDifficultyCalibrator` from `noesis-math/athens/src/lib/noesis/difficultyCalibrator.ts` to `packages/core/src/calibration/EloDifficultyCalibrator.ts`. Pure Elo update — no persistence. Add `DifficultyState` interface and `EloDifficultyCalibratorConfig`. Tests: ported from math + symmetry checks.
- [ ] **H-1.B.3** Port `ItemHistoryAggregator` from `noesis-eng/banjul/src/lib/noesis/itemHistoryService.ts` to `packages/core/src/history/ItemHistoryAggregator.ts`. Strip Supabase coupling — input `ItemAttempt[]`, output `{ seenIds, weakIds }`. Tests: ported from eng + threshold edge cases.

### Sub-phase H-1.C — Engine extensions (depend on foundation)

- [ ] **H-1.C.1** Add `MultiChannelBKTEngine` in `packages/core/src/learner/MultiChannelBKTEngine.ts`. Extends `BKTEngine` with: per-channel state (`Map<channelId, SkillProbability>` per skill), per-channel BKT params via `ChannelConfig[]`, drilling discount (`shouldDiscount`/`applyDiscount`), pluggable BKT modifier slot (no built-in grammar modifier — that's pack-supplied). Backward-compat: single-channel callers use a `"default"` channel with no API change. Tests: per-channel pMastery isolation, drilling discount, modifier slot, backward-compat with single-channel `BKTEngine` calls.
- [ ] **H-1.C.2** Add `LayeredMasteryModel` in `packages/core/src/mastery/LayeredMasteryModel.ts`. Computes `MasteryLayer = "Unstarted" | "Learning" | "Learned" | "Mastered"` from `SkillProbability` + attempt history + clock. Configurable thresholds via `LayeredMasteryConfig` (defaults match converged values: Learned ≥0.75 + ≥3 attempts; Mastered ≥0.85 + ≥6 attempts + ≥3 correct + ≥2 cal-days + ≥24h cooling-off + lastCorrect=true). Channel aggregation: 2 mastered channels OR primary mastered + secondary learned. Tests: ported from eng + revocation edge cases.

### Sub-phase H-1.D — Session machinery

- [ ] **H-1.D.1** Add `BudgetedSessionPlanner` in `packages/core/src/planning/BudgetedSessionPlanner.ts`. Extends `SessionPlannerImpl` with: review/error/new allocation (60/25/15% defaults, configurable via `EngineConfigOverrides`), weakness-threshold-based error repair, backlog control (50% reduction after 3 growth sessions), skill-introduction caps (1 early / 2 late, threshold session 10). Tests: allocation correctness, backlog reduction, intro caps.
- [ ] **H-1.D.2** Add `SessionLifecycleManager` in `packages/core/src/session/SessionLifecycleManager.ts`. Methods: `createSession`, `getSessionPlan`, `endSession`, `getSessionTracker`, `deleteSessionCaches`. Storage abstracted via `NoesisStateStore`. Tests: lifecycle transitions.
- [ ] **H-1.D.3** Add `PlannerSnapshot` in `packages/core/src/planning/PlannerSnapshot.ts`. Captures BKT/FSRS state + planned items + visibility at session start. Used for replay determinism. Tests: snapshot round-trip.
- [ ] **H-1.D.4** Add `OptimisticLockingStateStore` in `packages/core/src/persistence/OptimisticLockingStateStore.ts`. Implements `NoesisStateStore` with `state_version` optimistic locking. Postgres-agnostic via injected db handle. Tests: concurrent-write conflict detection.
- [ ] **H-1.D.5** Add `SessionMetricsLogger` in `packages/core/src/logging/SessionMetricsLogger.ts`. Consumes `NoesisEvent[]`, produces session-level metrics (attempts, correct count, accuracy, durations). No I/O. Tests: aggregation correctness.

### Sub-phase H-1.E — Surface updates

- [ ] **H-1.E.1** Expand `getLearnerMetrics()` in `packages/core/src/engine/metrics.ts` to include `layeredMastery: Record<skillId, MasteryLayer>`, `fatigue: { detected, reason }`, `difficulty: { ratings, calibration }`. Additive only — existing fields untouched. Tests: shape + new fields.
- [ ] **H-1.E.2** Extend `createNoesisCoreEngine` factory to accept `EngineConfigOverrides`. Wires overrides through to BKT/FSRS/planner/mastery/fatigue. Tests: override propagation.
- [ ] **H-1.E.3** Update `packages/core/src/index.ts` to export all new modules + types. Verify barrel completeness.
- [ ] **H-1.E.4** Add `@noesis-edu/core/contracts` subpath export in `packages/core/package.json`. Types-only entry point so pack manifests can import types without pulling the runtime. Subpath maps to `dist/constitution.js` + the new minimal type files.

### Sub-phase H-1.F — Release prep

- [ ] **H-1.F.1** Bump `packages/core/package.json` version to `0.3.0-rc.0`. Update `VERSION` constant in `index.ts`.
- [ ] **H-1.F.2** Write `packages/core/CHANGELOG.md` entry covering all additions.
- [ ] **H-1.F.3** Write `docs/migration/0.2-to-0.3.md` migration guide for downstream consumers (delf/eng/math, noesis-proof, OSL, KT).
- [ ] **H-1.F.4** Run `npm run test:core`, `npm run smoke:core`, `npm run build:core`, `npm run verify:core:pack`. All must pass.
- [ ] **H-1.F.5** Open PR `phase-h-1/core-0.3.0` → main. Title: "feat(core): Phase H-1 — pull-up to 0.3.0-rc.0". Body links to ADR + divergence log + this plan.

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
