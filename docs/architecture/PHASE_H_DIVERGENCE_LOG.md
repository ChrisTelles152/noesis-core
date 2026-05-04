# PHASE_H_DIVERGENCE_LOG — Engine Code Divergence Across Verticals

**Date:** 2026-05-03
**Status:** Phase 1 input artifact for `UNIFICATION_ADR.md`
**Author:** Recon agents + synthesis
**Purpose:** Identify (a) what universal engine code is duplicated across `noesis-eng`, `noesis-math`, `noesis-delf` that should consolidate into `@noesis-edu/core@0.3.0`, (b) what universal modules the verticals built that core doesn't yet have (gaps), and (c) what is genuinely subject-specific and should stay in pack packages.

---

## Top-line findings

1. **DELF is the reference shape.** `noesis-delf` is ~95% an `@noesis-edu/core` facade; only ~5% is French-specific (`normalizeAnswer`, cloze parsing). It already imports `createNoesisCoreEngine`, `getLearnerMetrics`, `createPracticeEvent`, `DEFAULT_SESSION_CONFIG`, etc. **This is what eng and math should look like after Phase H.**

2. **ENG and MATH each fork the entire engine.** Both reimplement BKT, FSRS, mastery, planner, session-state, and logging locally in `src/lib/noesis/*Service.ts` — bypassing core's `BKTEngine`, `FSRSScheduler`, `SessionPlannerImpl`, `getLearnerMetrics`. Math imports literally **zero** from `@noesis-edu/core`. Eng imports only `DEFAULT_SESSION_CONFIG` + `SessionConfig` types.

3. **Math has built three modules core doesn't have.** `fatigueDetector.ts`, `difficultyCalibrator.ts` (Elo-based), and `difficultyService.ts` are universal-quality engine code that `@noesis-edu/core@0.2.0` simply doesn't ship. Core 0.3.0 needs to absorb these.

4. **Eng has built two extensions core doesn't have.** A multi-channel BKT (per-channel priors for RECOG_MC / CLOZE / PROD_TYPED) and a layered mastery model (Learned at p≥0.75 / Mastered at p≥0.85 with cooling-off, attempt counts, calendar-day requirements). Both are universal patterns that should land in core.

5. **The big trap: `config.ts` in each vertical mixes universal and subject-specific.** Splitting these will be the highest-friction part of Phase H. Recommended pattern: per-vertical `config.ts` becomes `EngineConfigOverrides` consumed by core, while subject-specific (item type → channel mapping, skill regex patterns, language-specific normalization) moves into the corresponding content pack.

---

## Side-by-side feature matrix

| Engine concern | core 0.2.0 | noesis-eng | noesis-math | noesis-delf | Phase H action |
|---|---|---|---|---|---|
| **Skill graph / DAG** | ✅ `SkillGraphImpl`, `loadSkillGraphFromJSON` | uses core (graph only) | uses core (graph only) | ✅ uses core | Keep core; verticals already aligned. |
| **BKT (single-channel)** | ✅ `BKTEngine` | ❌ reimpl (`bktService.ts`) | ❌ reimpl (`bktService.ts`) | ✅ uses core | De-dup — verticals delete local. |
| **BKT multi-channel** | ❌ | ✅ (RECOG_MC, CLOZE, PROD_TYPED with per-channel priors) | ✅ (TYPED_ANSWER, MCQ) | n/a | **Add to core 0.3.0** as `MultiChannelBKTEngine`. |
| **BKT grammar modifier** | ❌ | ✅ (`pLearnMultiplier=0.85`, `pSlipAdd=0.03`) | ❌ | n/a | Subject-specific → stays in `@noesis-content/eng` as a `BKTConfig` override. |
| **BKT drilling discount** | ❌ | ✅ (0.3 after 2 attempts) | ✅ (0.3 after 2 attempts) | n/a | Universal → add to core 0.3.0 (`BKT_DISCOUNT_AFTER_2_ATTEMPTS`). |
| **FSRS scheduler** | ✅ `FSRSScheduler` + `learningSpeed` multiplier | ❌ reimpl (`fsrsService.ts`) | ❌ reimpl (`fsrsService.ts`) | ✅ uses core | De-dup. |
| **FSRS intervals (10min/1d/2d/4d)** | ✅ `DEFAULT_FSRS_PARAMS` | ✅ (same values) | ✅ (same values) | uses core defaults | Already converged; verticals delete local. |
| **FSRS response-time thresholds** | ❌ | ✅ (per-channel: 4500/7000/9000ms) | ✅ (typed=6000ms, MCQ=3500ms) | n/a | Universal pattern → add to core (`ResponseTimeConfig`); per-channel values are pack overrides. |
| **Layered mastery (Learned/Mastered)** | ❌ (only single pMastery) | ✅ (Learned ≥0.75, Mastered ≥0.85 + cooling-off) | ✅ (same thresholds) | n/a | **Add to core 0.3.0** as `LayeredMasteryModel`. |
| **Mastery cooling-off (24h, 2 cal-days, lastCorrect)** | ❌ | ✅ | ✅ | n/a | **Add to core 0.3.0**. |
| **Channel concept (skill primary/secondary channel)** | ❌ | ✅ (Grammar→CLOZE primary, Vocab→RECOG_MC primary) | ✅ (always TYPED_ANSWER primary) | n/a | Add a generic `SkillChannelMapping` interface to core; the actual mappings live in pack manifests. |
| **Session planner (gap-targeting)** | ✅ `SessionPlannerImpl` | ❌ reimpl (`plannerService.ts`) | ❌ reimpl (`plannerService.ts`) | uses core | De-dup. |
| **Session planner (review/error/new allocation)** | ❌ | ✅ (60% reviews, 25% errors, new-item caps) | ✅ (same shape, different budget: 20 vs 18 items) | n/a | **Add to core 0.3.0** as `BudgetedSessionPlanner`; verticals supply `SessionBudgetConfig`. |
| **Session planner (backlog control)** | ❌ | ✅ (50% reduction after 3 growth sessions) | ✅ (same logic) | n/a | **Add to core 0.3.0**. |
| **Session planner (skill-introduction caps)** | ❌ | ✅ (1 early, 2 later, threshold session 10) | ✅ (same) | n/a | **Add to core 0.3.0**. |
| **Session planner snapshot (replay)** | ❌ | ✅ (`plannerSnapshot.ts`) | ❌ | ❌ | **Add to core 0.3.0** — required for replay determinism. |
| **Session state persistence (optimistic lock)** | ❌ (only `NoesisStateStore` interface) | ✅ (`sessionStateService.ts` with `state_version`) | ✅ (same pattern) | uses core's interface | **Add to core 0.3.0** as a default `OptimisticLockingStateStore` impl pattern. |
| **Session lifecycle (createSession, getSessionPlan)** | ❌ | ✅ (`sessionManagementService.ts`) | partial (in `engineService.ts`) | ✅ (in `engineService.ts`) | **Add to core 0.3.0** as `SessionLifecycleManager`. |
| **Item history aggregation (accuracy, weak items)** | ❌ | ✅ (`itemHistoryService.ts`, threshold 0.8) | partial (mixed into engineService) | ❌ | **Add to core 0.3.0** as `ItemHistoryAggregator`. |
| **Logging / SessionAttemptTracker** | partial (events only) | ✅ (`loggingService.ts`, `SessionAttemptTracker`) | ✅ (same) | ❌ | **Add to core 0.3.0** as `SessionMetricsLogger` consuming events. |
| **Fatigue detector** | ❌ | ❌ | ✅ (`fatigueDetector.ts`: 10-item window, +20% latency, -10% accuracy, 15min cap) | ❌ | **Add to core 0.3.0** as `FatigueDetector`. |
| **Difficulty calibrator (Elo)** | ❌ | ❌ | ✅ (`difficultyCalibrator.ts`: K=32 learner / K=16 item, default 1200, bounds 100–3000) | ❌ | **Add to core 0.3.0** as `EloDifficultyCalibrator` (or split into `@noesis-edu/calibrator`). |
| **Difficulty persistence wrapper** | ❌ | ❌ | ✅ (`difficultyService.ts`, gracefully degrades if table missing) | ❌ | **Add to core 0.3.0** alongside calibrator. |
| **Transfer gate** | ✅ `TransferGateImpl` | not used | not used | not used | Keep in core; verticals adopt during Phase 4. |
| **Diagnostic engine** | ✅ `DiagnosticEngineImpl` | not used | not used | not used | Keep in core; verticals adopt during Phase 4. |
| **Event sourcing** | ✅ (`PracticeEvent`, factories, validation) | partial (logs attempts, not as core events) | partial | ✅ uses `createPracticeEvent` | De-dup; eng/math switch to core's event factories. |
| **Determinism (clock + idGenerator injection)** | ✅ `createDeterministicEngine` | ad-hoc | ad-hoc | ✅ uses core | De-dup. |
| **Answer normalization (typo, accent, contraction)** | ❌ | ✅ (`answerService.ts`: Levenshtein + 40+ English contractions + Portuguese accents + numeric/fraction parsing) | ❌ (math-specific in `engineService.ts`: `parseFraction`, etc.) | ✅ (French diacritics + cloze comma parse) | Universal core: `AnswerNormalizer` interface + `LevenshteinMatcher`. Per-pack impls: `EnglishAnswerNormalizer`, `MathAnswerNormalizer`, `FrenchAnswerNormalizer`. |
| **Item type → channel mapping** | ❌ | ✅ (9 types → 3 channels, hardcoded) | ✅ (math types → 2 channels) | n/a | **Subject-specific.** Lives in pack manifest, not core. |
| **Subject skill classification (e.g., grammar regex)** | ❌ | ✅ (25 regex patterns) | n/a | n/a | **Subject-specific.** Lives in `@noesis-content/eng`. |
| **Procedural item generation (math)** | ❌ | ❌ | ✅ (`generateMathItem`, `parseFraction`, `simplifyFraction`) | ❌ | **Subject-specific.** Lives in `@noesis-content/math-br`. |
| **Preflight DB checker** | ❌ | ✅ (`preflightChecker.ts`) | ❌ | ❌ | App-infra (not engine). Lives in `noesis-app/lib/preflight/`. |
| **Canonical event Parquet export** | ❌ | ✅ (`exportCanonicalEvents.ts`) | ❌ | ❌ | App-infra (analytics adapter). Lives in `noesis-app/lib/analytics/` or new `@noesis-edu/analytics-adapter`. |
| **Billing / answer orchestrator** | ❌ | ✅ (`answerOrchestrator.ts`) | ❌ | ❌ | App-infra. Lives in `noesis-app/api/`. |

---

## Per-vertical summary

### `noesis-eng/banjul/src/lib/noesis/` (16 files, ~60% universal)

**Universal (de-dup against core 0.3.0):** `bktService.ts`, `fsrsService.ts`, `plannerService.ts`, `loggingService.ts`, `sessionStateService.ts`, `sessionManagementService.ts`, `engineService.ts`, `itemHistoryService.ts`, `plannerSnapshot.ts`, `masteryService.ts` (universal portion), `config.ts` (universal portion).

**Subject-specific (move to `@noesis-content/eng`):**
- English contractions (40+ entries) from `answerService.ts`
- Portuguese accent rules from `answerService.ts`
- Grammar skill regex (25 patterns) from `config.ts`
- BKT grammar modifier (`pLearnMultiplier=0.85`, `pSlipAdd=0.03`) from `config.ts`
- Item type → channel map (9 types → RECOG_MC/CLOZE/PROD_TYPED) from `config.ts`
- Per-channel BKT priors from `config.ts`
- Per-channel response-time thresholds from `config.ts`

**App-infra (move to `noesis-app/`):** `answerOrchestrator.ts`, `preflightChecker.ts`, `exportCanonicalEvents.ts`, `dbWriteSurface.ts`.

### `noesis-math/athens/src/lib/noesis/` (12 files, ~85% universal — incl. 3 modules core lacks)

**Universal (de-dup against core 0.3.0):** `bktService.ts`, `fsrsService.ts`, `masteryService.ts`, `plannerService.ts`, `sessionStateService.ts`, `loggingService.ts`, `utils.ts`, `config.ts` (universal portion).

**Universal-but-missing-from-core (pull up to core 0.3.0 first):** `fatigueDetector.ts`, `difficultyCalibrator.ts`, `difficultyService.ts`.

**Subject-specific (move to `@noesis-content/math-br`):**
- Math item generation (`generateMathItem`) from `engineService.ts`
- Fraction utilities (`parseFraction`, `parseMixedNumber`, `simplifyFraction`) from `engineService.ts`
- Math channel set (TYPED_ANSWER, MCQ) and item type map from `config.ts`
- Math-tuned BKT priors and response-time thresholds from `config.ts`

### `noesis-delf/denpasar-v1/src/lib/noesis/` (2 files, ~95% facade — already nearly there)

**Universal (already on core):** `engineService.ts` is a thin wrapper around `createNoesisCoreEngine`, `getLearnerMetrics`, `createEventFactoryContext`, `createPracticeEvent`, `DEFAULT_SESSION_CONFIG`.

**Subject-specific (move to `@noesis-content/delf-fr`):**
- French diacritic normalization (`normalizeAnswer` lines 210–246)
- Cloze parsing assuming French grammar (e.g., `"ne, pas"` for negation, lines 235–242)
- Item types `fr_to_en`, `en_to_fr`

**Action:** delf is the migration template for eng and math, not a subject of major change itself.

### `noesis-core/abuja-v1/packages/core/` (current 0.2.0)

**Has:** SkillGraph, BKTEngine (single-channel), FSRSScheduler, SessionPlannerImpl (gap-targeting), TransferGateImpl, DiagnosticEngineImpl, NoesisCoreEngineImpl, getLearnerMetrics, event factories, NoesisStateStore interface, InMemoryStateStore, determinism scaffolding.

**Missing (Phase H gaps to fill):** layered mastery model, multi-channel BKT, fatigue detector, difficulty calibrator, budgeted session planner, backlog control, skill-introduction caps, item history aggregator, session metrics logger, planner snapshot, optimistic-locking state-store impl, answer normalizer interface.

---

## Hardcoded magic numbers — convergence vs divergence

### Already converged (same value across verticals → safe to lift to core defaults)

| Constant | Value | Verticals |
|---|---|---|
| FSRS again interval | 10 min | eng + math |
| FSRS hard interval | 1 day | eng + math |
| FSRS good interval | 2 days | eng + math |
| FSRS easy interval | 4 days | eng + math |
| Learned threshold | pMastery ≥ 0.75, ≥3 attempts | eng + math |
| Mastered threshold | pMastery ≥ 0.85, ≥6 attempts, ≥3 correct, ≥2 cal-days, ≥24h cooling | eng + math |
| BKT drilling discount | 0.3 after 2 attempts | eng + math |
| Easy grade days | ≥2 consecutive correct | eng + math |
| Review allocation | 60% of session | eng + math |
| Error allocation | 25% of session | eng + math |
| Backlog reduction | 50% after 3 growth sessions | eng + math |
| Max FSRS interval | 180 days | eng (math TBD) |
| Correct days cap | 30 | math (eng TBD) |

### Diverged (per-pack overrides via `EngineConfigOverrides`)

| Constant | eng | math | delf |
|---|---|---|---|
| Default session budget | 18 items | 20 items | 15 items |
| Min/max session size | 15/20 | 15/25 | n/a |
| Channels | RECOG_MC, CLOZE, PROD_TYPED | TYPED_ANSWER, MCQ | core defaults |
| BKT priors | per-channel × 3 | per-channel × 2 | core defaults |
| Response-time thresholds | 4500/7000/9000ms | 6000/3500ms | n/a |
| Skill-intro cap (early/late) | 1/2, threshold session 10 | same | n/a |
| Block size | n/a | 10 (5–15 range) | n/a |
| Session timeout | n/a | 24h auto-close | n/a |

**Implication:** core 0.3.0 ships sane defaults matching the converged values; the diverged values become pack-supplied overrides via a new `EngineConfigOverrides` type.

---

## Recommended `@noesis-edu/core@0.3.0` surface additions

Sorted by priority (highest = blocks the most de-dup downstream):

1. **`MultiChannelBKTEngine`** — replaces single-channel `BKTEngine` (or extends it). Accepts `Record<ChannelId, BKTConfig>`. Per-channel pMastery, aggregated per-skill. Eng and math both depend on this.

2. **`LayeredMasteryModel`** — Learned/Mastered tiers with cooling-off, attempt counts, calendar-day requirements, lastCorrect gate. Used by both eng and math identically.

3. **`BudgetedSessionPlanner`** — extends `SessionPlannerImpl` with explicit review/error/new allocation, weakness-threshold-based error repair, backlog control, skill-introduction caps. Eng and math both depend on this.

4. **`SessionLifecycleManager`** — `createSession`, `getSessionPlan`, `endSession`, `getSessionTracker`, `deleteSessionCaches`, plan snapshotting. Currently smeared across eng's `sessionManagementService.ts` and math's `engineService.ts`.

5. **`OptimisticLockingStateStore`** — default impl of `NoesisStateStore` with `state_version` optimistic locking. Postgres-agnostic via injected db handle.

6. **`SessionMetricsLogger` / `SessionAttemptTracker`** — consumes events, produces session-level metrics. Currently in eng's `loggingService.ts`.

7. **`PlannerSnapshot`** — captures BKT/FSRS state + SessionPlan + item visibility at session start, for replay. Currently in eng's `plannerSnapshot.ts`.

8. **`ItemHistoryAggregator`** — `getSeenItemIds`, `getWeakItems`, `recordItemHistory`. Currently in eng's `itemHistoryService.ts`.

9. **`FatigueDetector`** — rolling-window latency/accuracy degradation + hard session cap. Currently in math's `fatigueDetector.ts`.

10. **`EloDifficultyCalibrator` + `DifficultyStateStore`** — Elo-based item-difficulty / learner-ability rating with persistence. Currently in math's `difficultyCalibrator.ts` + `difficultyService.ts`. *(Alternative: split into separate `@noesis-edu/calibrator` package per CORE_SDK_CONSTITUTION minimalism.)*

11. **`AnswerNormalizer` interface + `LevenshteinMatcher`** — universal typo tolerance + numeric matching. Subject-specific normalizers (English contractions, French diacritics, math fractions) implement this interface in pack code.

12. **`EngineConfigOverrides` type** — pack-supplied tuning surface (channels, BKT priors per channel, session budget, response-time thresholds, skill-intro caps, channel mappings).

13. **`@noesis-edu/core/contracts` subpath export** *(if `PackManifest` references core types)* — types-only import surface for pack packages, so packs don't pull in the full engine runtime.

---

## What stays subject-specific (lives in `@noesis-content/<id>`)

| Pack | Owns |
|---|---|
| `@noesis-content/eng` | English contractions, Portuguese accent rules, grammar skill regex (25 patterns), grammar-channel mapping, grammar BKT modifier, item type → channel map (9 types), per-channel BKT priors |
| `@noesis-content/math-br` | Math item generation (`generateMathItem`), fraction utilities (`parseFraction`, `simplifyFraction`, `parseMixedNumber`), math channel set, math-tuned BKT priors, math response-time thresholds, procedural item config |
| `@noesis-content/delf-fr` | French diacritic normalization, French cloze parsing (e.g., `"ne, pas"`), French item types (`fr_to_en`, `en_to_fr`) |

---

## Phase H execution order

### Phase H-1 — Pull-up (in `noesis-core`)

Add modules 1–11 above to `@noesis-edu/core` source. Add tests for each (port from the corresponding vertical's `__tests__/` where they exist). Bump version to `0.3.0-rc.0`. Publish to npm under `@noesis-edu/core@0.3.0-rc.0` (or use a private registry if available for RC testing).

**Verification:** all existing core tests still pass; new modules have ≥80% line coverage; contract tests in `noesis-proof/adelaide` pass against `0.3.0-rc.0` with no behavior change for delf-style usage.

**Estimated effort:** 1.5–2 weeks.

### Phase H-2 — Push-down delf first (lowest-risk reference migration)

In `noesis-delf/denpasar-v1`:
- Bump `@noesis-edu/core` to `0.3.0`.
- Move French normalization into a new `@noesis-content/delf-fr` package implementing `AnswerNormalizer`.
- Verify all existing delf tests pass.

**Estimated effort:** 2–3 days. This validates the new core API surface before touching the harder migrations.

### Phase H-3 — Push-down math (medium risk)

In `noesis-math/athens`:
- Bump `@noesis-edu/core` to `0.3.0`.
- Replace `bktService.ts`, `fsrsService.ts`, `masteryService.ts`, `plannerService.ts`, `sessionStateService.ts`, `loggingService.ts`, `fatigueDetector.ts`, `difficultyCalibrator.ts`, `difficultyService.ts` with core imports.
- Move math-specific code (`generateMathItem`, `parseFraction`, etc.) to `@noesis-content/math-br`.
- Pass math-specific config via `EngineConfigOverrides`.
- Verify all 17 test files still pass.

**Estimated effort:** 1 week.

### Phase H-4 — Push-down eng (highest risk — most divergence)

In `noesis-eng/banjul`:
- Bump `@noesis-edu/core` to `0.3.0`.
- Replace 9 service files with core imports.
- Move English contractions, Portuguese accents, grammar regex, grammar BKT modifier, item type map to `@noesis-content/eng`.
- Move `answerOrchestrator.ts`, `preflightChecker.ts`, `exportCanonicalEvents.ts`, `dbWriteSurface.ts` to `noesis-app/` (deferred until Phase 3 of `UNIFICATION_ADR.md` migration plan; for Phase H, leave them in eng).
- Verify all eng tests pass; run Playwright e2e suite.

**Estimated effort:** 1.5 weeks.

### Phase H-5 — Promote 0.3.0-rc to stable

Once eng/math/delf are all green on `0.3.0-rc`, publish `@noesis-edu/core@0.3.0` and downstream consumers (eng/math/delf, `noesis-proof`, `open-source-logic`, future `knowledgetracker-v1` integration) update their pinned version.

**Total Phase H estimated effort:** ~4–5 weeks of focused contributor time.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Subtle behavioral divergence in BKT/FSRS reimplementations (eng vs math vs core) — same magic numbers but different code paths | Replay-equivalence test: feed the same event log through old `bktService.ts` and new `MultiChannelBKTEngine`; assert identical pMastery sequences. Land this test before deleting old code. |
| Layered mastery cooling-off uses wall-clock time → non-deterministic | Already core's pattern: inject clock. Port verticals to use core's `EventFactoryContext.clock`. |
| Multi-channel BKT extension breaks single-channel `BKTEngine` consumers (delf, `noesis-proof`) | Keep `BKTEngine` as a thin wrapper over `MultiChannelBKTEngine` with a default channel. Single-channel consumers see no API change. |
| Fatigue / calibrator add runtime weight to core (`CORE_SDK_CONSTITUTION` says "minimal dependencies") | Both are pure TypeScript with no new deps. If concern remains, split into separate `@noesis-edu/calibrator` and `@noesis-edu/fatigue` packages — mechanical refactor later. |
| Pack-supplied `EngineConfigOverrides` validated lazily → bad config crashes at runtime | Ship a `validateEngineConfig()` function in core; pack manifests run it at load time. |
| Phase H drags on while eng/math ship features that re-add divergence | Branch freeze on `src/lib/noesis/` in eng and math during Phase H execution. New engine features land in core only. |

---

## Open questions

1. **Calibrator: in-core or separate package?** Math built `EloDifficultyCalibrator` as a clean module. `CORE_SDK_CONSTITUTION` favors minimalism but adds no hard rule against pure-TS modules. *Lean: in-core for now (one less package to publish); split later if it grows.*

2. **Layered mastery: replace single pMastery, or layer on top?** Recommend: keep `SkillProbability.pMastery` as raw BKT estimate; add `MasteryLayer` enum (Unstarted/Learning/Learned/Mastered) computed from pMastery + history. Non-breaking for existing core consumers.

3. **Should `getLearnerMetrics` expand to include the new layered mastery + fatigue + difficulty signals?** Yes — single metrics surface for downstream consumers. Would bump `LearnerMetrics` shape (semver minor since additive).

4. **Should `noesis-proof` participate in Phase H validation?** Yes — its replay infrastructure is the natural integration test for "old code path equals new code path." Add a Phase H replay-equivalence suite to `noesis-proof/adelaide/tools/`.

---

## Cross-references

- `noesis-core/abuja-v1/docs/architecture/UNIFICATION_ADR.md` — the Phase H work this log enables, sub-decision 7 + Migration Phase 1.
- `noesis-math/athens/DECISIONS.md` D007 — original "defer Phase H" decision, now superseded by the unification ADR.
- `noesis-core/abuja-v1/docs/architecture/CORE_SDK_CONSTITUTION.md` — constraints on what can land in core (minimalism, determinism, dependency-free).
- `noesis-eng/banjul/src/lib/noesis/` — primary source of multi-channel BKT, layered mastery, item history, planner snapshot.
- `noesis-math/athens/src/lib/noesis/` — primary source of fatigue detector, difficulty calibrator.
- `noesis-delf/denpasar-v1/src/lib/noesis/engineService.ts` — reference for the post-Phase-H facade shape.
