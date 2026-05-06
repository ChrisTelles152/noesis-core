# Handoff — Phase H state, 2026-05-04

**Audience:** A fresh Claude Code agent picking up this branch in a new window.
**Branch:** `phase-h-1/core-0.3.0` (pushed; PR #16 open)
**Workspace:** `/Users/christelles/conductor/workspaces/noesis-core/abuja-v1`
**Companion docs (read these in order):**
1. `docs/architecture/UNIFICATION_ADR.md` — strategic decisions
2. `docs/architecture/PHASE_H_DIVERGENCE_LOG.md` — module-by-module catalog
3. `docs/architecture/PHASE_H_EXECUTION_PLAN.md` — atomized subtask plan with progress markers
4. `packages/core/CHANGELOG.md` — what shipped in 0.3.0-rc.0
5. `docs/migration/0.2-to-0.3.md` — consumer migration guide
6. `docs/release/0.3.0-rc.0-publish-instructions.md` — Edward's VPS publish steps
7. `.context/h2-h3-h4-pushdown-prompts.md` — push-down prompts for verticals (gitignored)

This handoff captures the parts that aren't in those docs: the negotiation that produced them, the open items, the things to watch.

---

## 1. State of the world (one paragraph)

`@noesis-edu/core@0.3.0-rc.0` is built, tested (742 tests, all green), packed (`noesis-edu-core-0.3.0-rc.0.tgz`, 145.6 kB / 595.9 kB unpacked / 167 files), and waiting on (a) PR #16 review/merge, (b) Edward to publish to npm with `--tag rc`. It absorbed 12 universal engine modules from the verticals (eng/math/delf), keeping the existing 0.2.0 surface untouched. After Edward publishes, the vertical workspace agents (in `noesis-eng/banjul`, `noesis-math/athens`, `noesis-delf/denpasar-v1`) will run H-2/H-3/H-4 push-downs in parallel — each deletes its local `src/lib/noesis/*` services and imports from core. `noesis-proof/adelaide` certifies byte-for-byte equivalence between old and new via its `tools/phaseh-equivalence/` framework. Once all three certify, `0.3.0-rc.0` → `0.3.0` stable.

---

## 2. Strategic context (the why)

The Noesis ecosystem started as one repo (`noesis-core`) and three vertical product apps (eng = English for BR, math = K-12 arithmetic/algebra, delf = French DELF prep). Each vertical reimplemented the engine (BKT/FSRS/planner/mastery/session-state/logging) locally instead of importing from core. By the time we audited:

- `noesis-eng/banjul` had 16 service files, ~3,191 LOC of duplicated engine code.
- `noesis-math/athens` had 12 service files plus 3 modules core didn't have (FatigueDetector, EloDifficultyCalibrator, DifficultyService).
- `noesis-delf/denpasar-v1` was the cleanest — already ~95% on core via a thin facade.
- `noesis-proof/adelaide` is the truth-harness; consumes core, doesn't reimplement.

The first big strategic question was **Path A vs Path B** in `PLAN.md` Phase K (now resolved by `UNIFICATION_ADR.md`):
- Path A: extract `apps/server` + `apps/web-demo` from noesis-core; keep core SDK-only.
- Path B: rename noesis-core → noesis-platform; legitimize the monorepo.

**Decision: Path A**, because six sibling repos (eng/math/delf/proof/OSL/KT) already consume `@noesis-edu/core` as a published npm package. They voted with their `package.json` files; renaming to `noesis-platform` would orphan that pattern.

Then the bigger strategic call: **one unified consumer app** (`noesis-app`, renamed from `noesis-pilot`), with subject curricula as content packs (`@noesis-content/math-br`, `@noesis-content/eng`, `@noesis-content/delf-fr`). Three forks of the consumer surface collapse into one Next.js app. Engine open-source; moat lives in content + calibration data + B2B outcomes (anti-Duolingo posture: optimize for learning velocity, not engagement).

Phase H — engine consolidation — is the first migration step. Pull universal modules into core 0.3.0 (H-1 ✅), then push down (H-2/H-3/H-4), then promote stable (H-5). Subsequent unification phases (Phase 2 noesis-app skeleton, Phase 3 apps extraction, Phase 4 verticals → packs, Phase 5 hardening + launch) come after.

---

## 3. Decision log (locked, with quick rationale)

### Strategic (made earlier in the conversation, before H-1)

| # | Decision | Rationale |
|---|---|---|
| Path A | Extract apps; noesis-core stays SDK-only | Six sibling repos already consume core as npm; original `INTENTION.md:64` committed to this |
| One unified app | Consolidate three vertical apps into `noesis-app` | NALS cognitive-state vector is domain-agnostic; cross-subject transfer is the differentiator |
| Open-source engine | Keep `@noesis-edu/core` MIT/public | Moat is content + data + outcomes, not engine code; standards win categories |
| Anti-Duolingo | Optimize learning velocity, not engagement | Pricing model lever; B2B-anchored outcomes-priced revenue |
| Defer A/B testing | No live A/B until ~10k MAU | Until then, replay-based offline experiments using core's deterministic engine |
| Stack | Next.js 16 + React 19 + App Router + Supabase SSR + Drizzle on Supabase Postgres | 3-of-4 verticals already there; SEO matters for B2C |
| Auth | Supabase Auth | Matches stack; less code to maintain than Passport |
| Pack location | Inside `noesis-app/packages/content-*` | One repo, one CI; can extract to standalone monorepo later if 3rd-party authors emerge |
| Content pack npm scope | `@noesis-content/*` | User confirmed namespace is theirs |
| Domain | `noesis.app/<subject>` (root-with-paths) | Shared brand equity; one analytics surface |
| Mobile | Next.js → PWA only; native deferred | Native is out of v1 scope |

### H-1 implementation (made during the build)

| # | Decision | Rationale |
|---|---|---|
| 1 | Single long-lived branch + one PR | Easier review than chunked PRs for a 24-commit feature |
| 2 | Layered mastery thresholds: Learned (≥0.75 + ≥3) / Mastered (all 6 gates) | Both eng + math independently converged on these values; pilot-data retune later |
| 3 | Default session budget = 20 | Math's value; planner is the most mature in the divergence log |
| 4 | `OptimisticLockingStateStore` = interface + memory only | Postgres adapter lives outside core; keeps core dependency-free |
| 5 | `MultiChannelBKTEngine` extends `BKTEngine` (no replacement) | Single-channel callers (delf, proof) see no API change |
| 6 | Drilling discount in core (universal) | Both eng + math converged on 0.3 multiplier after 2 attempts |
| 7 | Grammar modifier slot in core (values pack-supplied) | Mechanism universal; values English-specific |
| 8 | Ship `@noesis-edu/core/contracts` types-only subpath | Pack manifest packages need types without runtime |
| 9 | Public npm publish target | 0.2.0 already there |
| 10 | keep-a-changelog format | Standard, scannable |
| 11/14 | Packs live `noesis-app/packages/content-*` | YAGNI: extract to standalone repo later if needed |
| 12 | `@noesis-content/*` npm scope is yours | User confirmed |
| 15 | v1 hard-coded packs; runtime registry deferred | YAGNI |
| 16 | KT/OSL positioning deferred | They already consume `@noesis-edu/core` as standalone products |

### Coordination decisions (deferred / leaning, NOT blocking H-1)

| Item | Status | Lean |
|---|---|---|
| DB column-name strategy (math writes `MULTIPLE_CHOICE` to eng's `recog_mc_*` columns) | Deferred | (c) punt to `noesis-app` schema design post-Phase 4 |
| Pack-load-time A1 vs A2+ ordering (eng) | Deferred | Pack-author code does its own sort; not a runtime config knob |
| Pricing model | Deferred | B2B-anchored outcomes-priced (per-program completion with refund clause; B2B school per-seat with outcome SLA) |
| Calibrator: in-core vs separate package | Resolved | In-core (math built it; small enough; one less package) |
| Drop `-rc.0` criteria | Resolved | After all 3 vertical push-downs land green + proof certifies parity |

---

## 4. What was built in H-1 (24 commits on `phase-h-1/core-0.3.0`)

### 12 new modules in `packages/core/src/`

| Module | Path | Tests | Source |
|---|---|---|---|
| `MultiChannelBKTEngine` | `learner/MultiChannelBKTEngine.ts` | 41 | eng audit §3.7 |
| `LayeredMasteryModel` | `mastery/LayeredMasteryModel.ts` | 42 | eng `masteryService.ts` + audit §4 |
| `BudgetedSessionPlanner` | `planning/BudgetedSessionPlanner.ts` | 33 | eng `plannerService.ts` (~791 LOC) + math (~556 LOC) |
| `SessionLifecycleManager` | `session/SessionLifecycleManager.ts` | 35 | eng `sessionManagementService.ts` |
| `PlannerSnapshot` | `planning/PlannerSnapshot.ts` | 16 | eng `plannerSnapshot.ts` (~503 LOC) |
| `OptimisticLockingStateStore` | `persistence/OptimisticLockingStateStore.ts` | 24 | eng `bktService.ts:325–428` + `sessionStateService.ts` |
| `SessionMetricsLogger` | `logging/SessionMetricsLogger.ts` | 30 | eng + math `loggingService.ts` |
| `FatigueDetector` | `fatigue/FatigueDetector.ts` | 14 | math `fatigueDetector.ts` |
| `EloDifficultyCalibrator` | `calibration/EloDifficultyCalibrator.ts` | 23 | math `difficultyCalibrator.ts` |
| `ItemHistoryAggregator` | `history/ItemHistoryAggregator.ts` | 23 | eng `itemHistoryService.ts` |
| `AnswerNormalizer` + `LevenshteinMatcher` | `answer/AnswerNormalizer.ts` | 29 | eng `answerService.ts` (universal portion) |
| `EngineConfigOverrides` | `config/EngineConfigOverrides.ts` | 27 | new (typed pack-tuning surface) |

### Surface changes

- `getLearnerMetrics(engine, learnerId, atTime?, options?)` — additive `layeredMastery` / `fatigue` / `difficulty` sections (7 tests).
- `createNoesisCoreEngine(...{ overrides })` — accepts `EngineConfigOverrides`, validates eagerly, exposes via `getConfigOverrides()` (8 tests + 9 validator tests).
- `@noesis-edu/core/contracts` subpath in `package.json` exports (9 tests).
- Top-level barrel completeness lock (`__tests__/barrel.test.ts`, 20 tests).

### Documentation

- `docs/architecture/UNIFICATION_ADR.md` — full strategic rationale + 5-phase migration plan
- `docs/architecture/PHASE_H_DIVERGENCE_LOG.md` — module-by-module catalog (universal vs subject-specific vs app-infra)
- `docs/architecture/PHASE_H_EXECUTION_PLAN.md` — atomized subtask plan; H-1 marked done with commit hashes
- `docs/migration/0.2-to-0.3.md` — consumer migration guide (per-vertical notes + adoption order)
- `docs/release/0.3.0-rc.0-publish-instructions.md` — Edward's VPS publish steps with `--tag rc` gotcha + recovery
- `packages/core/CHANGELOG.md` — keep-a-changelog 0.3.0-rc.0 entry

### Tooling

- Root `package.json`: added `release:core:rc` + `release:core:rc:dry-run` scripts.
- `packages/core/package.json`: added `./contracts` subpath to `exports`.
- All vitest tests pass: **742/742**. Smoke test 6/6 against the new build.

---

## 5. Research / recon record

### 4-repo audit cycle (sent earlier in the conversation; results landed in vertical workspaces)

I sent four parallel audit prompts to the vertical agents. Each committed an audit doc + replay-equivalence fixtures to its workspace:

| Repo | Audit commit | Branch | Fixtures | Doc |
|---|---|---|---|---|
| `noesis-delf/denpasar-v1` | `283d678` | `ChrisTelles152/phase-h-prep` | 3 (cold-start / mid-mastery / end-of-session) | `docs/PHASE_H_AUDIT.md` |
| `noesis-math/athens` | `04dcf5d` | `phase-h-prep` | 73 across 6 modules | `docs/PHASE_H_AUDIT.md` |
| `noesis-eng/banjul` | `4ca48ca` | `ChrisTelles152/phase-h-prep` | 24 across 7 modules | `docs/PHASE_H_AUDIT.md` |
| `noesis-proof/adelaide` | `98d4327` | `ChrisTelles152/phase-h-prep` | n/a (built the framework instead) | `docs/PHASE_H_EQUIVALENCE_FRAMEWORK.md` |

Key findings the audits surfaced (NOT all already in `PHASE_H_DIVERGENCE_LOG.md`):

- **Eng has 16 service files**, not the 9 the divergence log originally counted. `answerService.ts` (515 LOC, English contractions + Portuguese accents + Levenshtein) was missed in the first pass.
- **Math's `loggingService.ts:154-158` writes math `MULTIPLE_CHOICE` accuracy to columns named `recog_mc_*`** because the two apps share a Supabase project. Silent compat shim. Coord decision: punt to noesis-app post-Phase 4.
- **Math's calibrator + fatigue are load-bearing in production**, wired into the answer flow. Not optional add-ons. Replay-equivalence must include them in end-to-end tests.
- **Eng's optimistic locking** (`bkt_state.version`, `fsrs_state.version`) was added by migrations 014/015 to fix a real production race. Single-retry-then-throw must be preserved.
- **Eng has the `MultiChannelBKTEngine` API spec in §3.7** of its audit — battle-tested shape, which I adopted with two adaptations: `now: number` parameter (vs injected ClockFn) for clock-free engine, and no `BKTStateStore` coupling (state-store interface deferred to D.4).
- **Delf missed `src/lib/packs/loadPack.ts`** in its audit — also imports core (`loadSkillGraphFromJSON`). Not a blocker; types are unchanged in 0.3.0.

### Second-round recon (just before drafting this handoff)

Re-checked all 4 vertical workspaces' state to inform the push-down prompts. Findings:

- All vertical engine code has been **frozen since the audit commits** — no further engine changes.
- Delf has shipped 15 commits of pure content/UX (3 packs, billing, dashboard).
- Math has shipped 18 commits of pure content + `DECISIONS.md` updates D008–D011 (pack-version drift detection, planMetadata persistence, RLS strategy, new item types fill_in_blank/multi_step/ordering/matching that **skip the procedural generator**).
- Eng has shipped 1 huge commit: **Phase P content expansion** — 8 new packs (eng_b2 / cambridge_b1 / cambridge_b2_first / toefl / ielts_academic / efset / enem_english / eng_a1_es), 5,986 new items, 6 new item types (listening_typed, listening_mc, reading_typed, reading_mc, dialogue_complete, sentence_order, sentence_transform), learning paths infrastructure (`/paths` and `/paths/[pathId]` routes). Engine code untouched. Phase P deferred T14 (path-aware planner, frequency-aware planner, hard-item recognition, mistakes-deck UI, mock-test mode, drag-and-drop, streak toast).
- Proof's framework hasn't been touched since `98d4327`. CI for the framework is documented but **not wired**. The framework is engine-agnostic — does NOT import `@noesis-edu/core`. Adapters bridge.
- All verticals are pinned to **old core versions**: delf @ 0.2.0, eng + math + proof @ 0.1.0. They jump straight to 0.3.0-rc.0 during their push-downs.

### Source files I read in detail (for porting)

To produce the H-1 modules, I read each source file from the verticals and ported the universal portions (stripping Supabase coupling, adding determinism guards, fixing bugs along the way):

- `noesis-eng/banjul/src/lib/noesis/bktService.ts` (630 LOC, multi-channel + optimistic lock + grammar modifier + drilling discount)
- `noesis-eng/banjul/src/lib/noesis/masteryService.ts` (415 LOC)
- `noesis-eng/banjul/src/lib/noesis/sessionManagementService.ts` (252 LOC)
- `noesis-eng/banjul/src/lib/noesis/itemHistoryService.ts` (176 LOC, Supabase-coupled CRUD)
- `noesis-eng/banjul/src/lib/noesis/plannerSnapshot.ts` (~503 LOC, DB-coupled capture)
- `noesis-math/athens/src/lib/noesis/fatigueDetector.ts` (130 LOC)
- `noesis-math/athens/src/lib/noesis/difficultyCalibrator.ts` (154 LOC)
- `noesis-math/athens/src/lib/noesis/bktService.ts` (cross-reference for two-channel set + same Bayesian formula)
- Plus all the existing core modules (BKTEngine, FSRSScheduler, SessionPlannerImpl, NoesisCoreEngineImpl, getLearnerMetrics, NoesisStateStore, etc.) for integration patterns.

### Bugs I caught + fixed during the port

- **Math's `EloDifficultyCalibrator.selectBestItem`** returned the first occurrence on ties — caller-array-order-dependent. Core's version breaks ties by lexicographic `itemId` (replay-safe).
- **Eng's `getWeakItems`** returned DB-driver-order. Core's `ItemHistoryAggregator.getWeakItems()` sorts by accuracy asc, attempts desc, itemId asc.
- **Math's `FatigueDetector` had no zero-baseline-latency guard** — would NaN the fractional latency increase. Core's port adds the guard.
- **Math's calibrator was in-memory only**, no save/load. Core's port adds `serialize()` / `deserialize()`.
- **Eng's `itemHistoryService` was DB-only**, no in-memory mode. Core's port is pure in-memory; persistence is the caller's responsibility via `NoesisStateStore`.

---

## 6. What's still open (priority order)

### Critical path (blocks downstream work)

1. **PR #16 review + merge.** No external dependency; user must direct.
2. **Edward publishes `0.3.0-rc.0` to npm with `--tag rc`.** Instructions at `docs/release/0.3.0-rc.0-publish-instructions.md`. Until this happens, vertical agents can't `npm install` the new core.
3. **Smoke-test the equivalence framework against core 0.3.0-rc.0** *(deferred from this conversation's "1-9" list, item #2)*. Steps:
   - Write a tiny BKT fixture by hand at `packages/core/tests/phaseh/fixtures/smoke-bkt-001/` (5-file envelope: `fixture.json`, `initial-state.json`, `events.jsonl`, `expected-output.json`, optional `options.json`).
   - Write the core-side adapter at `packages/core/tests/phaseh/adapters/multichannel-bkt-new.ts` implementing `ImplAdapter<TState, TDecision, TMetric>` from `noesis-proof/adelaide/tools/phaseh-equivalence/src/types.ts`.
   - Either install the framework as a dev dep (`@noesis/phaseh-equivalence` from workspace) OR run via the proof CLI: `cd /Users/christelles/conductor/workspaces/noesis-proof/adelaide && npm run phaseh -- --fixture <path> --new <adapter>`.
   - Goal: confirm the framework runs against `MultiChannelBKTEngine` without error, even if there's no `oldImpl` to compare against (regression mode with `expected-output.json`).
   - If it works, document the result in a new `docs/architecture/PHASE_H_EQUIVALENCE_REPORT.md`.

### High value, not blocking

4. **Cross-module integration test** *(item #6)*. ~30 min. Test that `MultiChannelBKTEngine` → `LayeredMasteryModel` → `BudgetedSessionPlanner` work together end-to-end. Catches interaction bugs no unit test can. File at `packages/core/src/__tests__/integration.test.ts`.

5. **CI workflow check** *(item #7)*. Read `.github/workflows/`. If `test:core + build:core + smoke:core + verify:core:pack` aren't enforced on every PR, add a workflow file. Until this lands, the F.4 manual checks are one-shot.

### Phase H push-downs (delegated to vertical workspace agents)

6. **H-2 push-down delf** (~2-3 days). Prompt at `.context/h2-h3-h4-pushdown-prompts.md` (PROMPT 1).
7. **H-3 push-down math** (~1 week). Prompt #2.
8. **H-4 push-down eng** (~1.5 weeks). Prompt #3.

These run in parallel after Edward publishes. If any vertical surfaces a real divergence, iterate to `0.3.0-rc.1` BEFORE the next vertical starts.

### Phase H wrap

9. **H-5 promote `0.3.0-rc.0` → `0.3.0` stable.** Coordination only — gated on H-2/H-3/H-4 plus proof certification.
10. **`STATUS.md` + `docs/site/` updates** *(item #5)*. The Astro Starlight docs site documents 0.2.0 only. Should land before stable `0.3.0`, not blocking RC.

### Beyond Phase H (per `UNIFICATION_ADR.md` Migration Plan)

11. **Phase 2** — Establish `noesis-app` skeleton (rename `noesis-pilot` → `noesis-app`, scaffold Next.js, set up Supabase project). ~1 week.
12. **Phase 3** — Extract `apps/server` + `apps/web-demo` from `noesis-core` into `noesis-app` (Vite → Next.js port; Express → Route Handlers; Passport → Supabase Auth). ~2-3 weeks.
13. **Phase 4** — Reduce verticals to `@noesis-content/*` packages. ~3-4 weeks.
14. **Phase 5** — Hardening + launch (Sentry, Upstash, ServiceWorker, Stripe, mentor + admin tooling). ~2-3 weeks.

Total beyond H: ~10-14 weeks calendar time. H-2/H-3/H-4 (engine push-down) can run in parallel with Phase 2 (`noesis-app` skeleton) if you want.

---

## 7. Coordination state

### Vertical workspaces

| Workspace | Branch | Pinned core | State | Awaiting |
|---|---|---|---|---|
| `noesis-delf/denpasar-v1` | `ChrisTelles152/phase-h-prep` | 0.2.0 | Audit + 3 fixtures committed; engine frozen since audit | RC publish + push-down prompt |
| `noesis-math/athens` | `phase-h-prep` | 0.1.0 | Audit + 73 fixtures committed; engine frozen since audit | RC publish + push-down prompt |
| `noesis-eng/banjul` | `ChrisTelles152/phase-h-prep` | 0.1.0 | Audit + 24 fixtures committed; engine frozen since audit | RC publish + push-down prompt |
| `noesis-proof/adelaide` | `ChrisTelles152/phase-h-prep` | 0.1.0 | Equivalence framework built; CI not wired | (smoke-test step item #3) |

### Edward (or whoever has the npm publish token)

- Has not yet published `0.3.0-rc.0`. Instructions at `docs/release/0.3.0-rc.0-publish-instructions.md`.
- Critical: must use `--tag rc` to avoid silently shifting `npm install @noesis-edu/core@latest` to the RC.

### `knowledgetracker-v1` and `open-source-logic-v1`

Adjacent products that consume `@noesis-edu/core` standalone. Per coord decision #16, deferred — they bump pinned version when they want, no migration coordination needed.

---

## 8. Things to be careful about

- **Don't break replay determinism.** Every new module includes an explicit replay-determinism test (two identical event sequences → identical serialized state). If you add code anywhere that uses `Date.now()` directly, it WILL break replay. Always use the injected `ClockFn` (events module) or accept `now: number` as a parameter.
- **Don't merge PR #16 to main without CI green.** No CI workflow exists yet (item #7 above). The F.4 manual checks were one-shot.
- **Don't unpublish a published version.** If `0.3.0-rc.0` ships and turns out to have a bug, ship `0.3.0-rc.1` rather than unpublishing. Once an artifact has been installed by anyone, unpublishing breaks their lockfile.
- **Don't write to other workspaces from here.** Each Conductor workspace has its own agent + branch. Cross-workspace edits create silent merge conflicts. The push-down prompts go to the vertical workspaces' agents.
- **Don't change behavior in the push-downs.** The whole point of the equivalence framework is byte-identical state. If you find a behavior in 0.2.0 that's wrong but landed accidentally, file an issue but DO NOT fix it in the push-down PR. Behavior fixes wait for 0.4.0.
- **Don't add features to core that aren't on the divergence log.** The divergence log is the contract for what core absorbs. Anything else is scope creep.

### Pinned-version test gotcha

`packages/core/src/__tests__/version.test.ts:24` pins the expected `VERSION` constant. When you bump the version in `packages/core/package.json`, also bump it here — otherwise the test fires (which is the point: it's a "did you forget to update both?" gate).

### `EngineConfigOverrides` reserved fields are now typed

In an earlier 0.3.0-rc draft, the reserved fields (`layeredMastery`, `budgetedPlanner`, `fatigue`, `calibrator`) were `unknown`. They're now typed (per H-1.E.2). Tests that previously passed `42` or `{ K_LEARNER: 32 }` for those fields had to be rewritten to use proper-shaped values.

---

## 9. Quick orientation for a fresh agent

If you're a fresh agent picking this up:

1. **Read in order:** this doc → `UNIFICATION_ADR.md` → `PHASE_H_DIVERGENCE_LOG.md` → `PHASE_H_EXECUTION_PLAN.md` → `CHANGELOG.md` 0.3.0-rc.0 entry → `migration/0.2-to-0.3.md`.
2. **Check git state:** `git -C /Users/christelles/conductor/workspaces/noesis-core/abuja-v1 log --oneline -25` — confirm you're on `phase-h-1/core-0.3.0` with the 24 H-1 commits (the "Phase H planning artifacts" commit `af5c705` is the parent of all H-1 work).
3. **Run the test suite:** `cd /Users/christelles/conductor/workspaces/noesis-core/abuja-v1 && npm run test:core` — should report 742 passed.
4. **Check what's open:** §6 above is the priority-ordered list.
5. **Don't recreate work:** the user will tell you what's next. Don't re-run the audits, don't re-do the push-down prompts, don't rewrite the migration guide. Build on top.

### Memory note for the agent

There's a memory entry at `~/.claude/projects/-Users-christelles-Documents-Coding-EdTech-Noesis-noesis-core/memory/project_phase_h_1_shipped.md` that captures this state succinctly. Future-you will see it on session start.

---

## 10. Open questions the user might ask

If the user comes back with one of these, the answer is already prepared:

| Question | Answer |
|---|---|
| "Did Edward publish?" | Check `npm view @noesis-edu/core dist-tags`. Expected: `{ latest: '0.2.0', rc: '0.3.0-rc.0' }`. |
| "Are the verticals migrated yet?" | Check their `package.json` pin and the existence of branches `phase-h-2/migrate-to-0.3.0`, etc., in their workspaces. If none exists, push-downs haven't started. |
| "Did the smoke test pass?" | Look for `docs/architecture/PHASE_H_EQUIVALENCE_REPORT.md` — only exists if item #3 (§6) ran. |
| "What's left in H-1?" | Nothing in H-1 itself. Everything else is downstream. |
| "Should I publish 0.3.0 stable now?" | NO. Need all 3 verticals to certify push-down equivalence first. Publishing stable prematurely is the kind of thing that creates a 4-week support tail. |
| "Can I skip H-2 push-down for delf since it's so light?" | NO. Delf is the smoke test for the new core API. If we can't migrate the lightest case, math + eng will be worse. Run them in order. |
| "What about pricing?" | Deferred. Suggestions in earlier conversation: per-program completion with refund clause for B2C, B2B school per-seat with outcome SLA. Pick after pilot validates learning velocity. |
| "Is the polymath story still alive?" | Yes — that's the whole point of the unified-app + cross-subject NALS state. After Phase 4 the engine sees one cognitive-state vector per learner across all subjects. |

---

## 11. Final state checklist

| Item | State |
|---|---|
| Branch `phase-h-1/core-0.3.0` pushed to origin | ✅ |
| PR #16 open at https://github.com/Noesis-Edu/noesis-core/pull/16 | ✅ |
| 24 commits on the branch | ✅ |
| 742/742 tests passing | ✅ |
| `npm run smoke:core` passing 6/6 against new build | ✅ |
| `npm run verify:core:pack` produces `noesis-edu-core-0.3.0-rc.0.tgz` | ✅ |
| `release:core:rc` script available for Edward | ✅ |
| Edward's publish guide written | ✅ |
| Migration guide written | ✅ |
| Three push-down prompts staged | ✅ (in `.context/`) |
| Plan checkboxes marked done | ✅ |
| Memory entries saved | ✅ |
| Equivalence framework smoke test | ❌ Open (item #3) |
| Cross-module integration test | ❌ Open (item #4) |
| CI workflow | ❌ Open (item #5) |
| Edward published to npm | ❌ Awaiting Edward |
| H-2/H-3/H-4 push-downs | ❌ Awaiting RC publish |
| H-5 stable promotion | ❌ Awaiting push-downs |

---

End of handoff. The fresh-agent prompt to paste lives at `docs/handoff/2026-05-04-fresh-agent-prompt.md`.
