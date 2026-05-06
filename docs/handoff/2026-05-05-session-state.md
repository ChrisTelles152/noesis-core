# Handoff — session state, 2026-05-05

**Audience:** A fresh Claude Code agent picking up `phase-h-1/core-0.3.0` after this session.
**Branch:** `phase-h-1/core-0.3.0` (pushed; PR #16 open at https://github.com/Noesis-Edu/noesis-core/pull/16)
**Workspace:** `/Users/christelles/conductor/workspaces/noesis-core/abuja-v1`
**Predecessor:** `docs/handoff/2026-05-04-phase-h-state.md` (Phase H-1 build state).

This doc captures what changed in the 2026-05-05 session: PR #16 went from never-green CI to all-green CI, the proof equivalence framework was smoke-tested against `MultiChannelBKTEngine`, and the three vertical workspaces were audited for whether their Phase H prep is actually framework-conformant. The earlier 2026-05-04 handoff is still accurate for everything it documented; this addendum supersedes it on points where reality has moved.

---

## 1. State of the world (one paragraph)

PR #16 is **fully green** on CI for the first time on this branch — 8/8 jobs pass, including two new core-specific gates added this session. `@noesis-edu/core@0.3.0-rc.0` is unchanged from yesterday (`d6cf1cdff860a75476f3b9d51572293ce6eff1ee`, 145.6 kB packed, 167 files, 742/742 tests). The proof equivalence framework was smoke-tested end-to-end against `MultiChannelBKTEngine` and reports `EQUIVALENT` in both cross-impl and regression mode. Vertical recon found the verticals have moved past `phase-h-prep` while we worked: **`noesis-delf` has shipped its H-2 push-down** (vendored byte-identical core tarball, content pack created at `packages/content-delf-fr/`, 129/129 tests pass, replay 3/3 pass); `noesis-math` has done H-3 prep (24 fixtures + 5 oldImpl adapters, but events.jsonl format diverges from the framework's required schema and `package.json` still pins core 0.1.0); `noesis-eng` has done H-4 foundation (legacy snapshots, file:link to live core source, 1050/1050 tests pass including 67 coreCompatibility checks, no oldImpl adapters yet). Edward has not yet published `0.3.0-rc.0` to npm — the verticals are using vendor tarball (delf) or `file:` link (eng) as workarounds.

---

## 2. Decisions taken this session

| # | Decision | Rationale |
|---|---|---|
| 1 | Two new CI gates: `Core Tests (named gate)` + `Core Package (build + smoke + pack)` as a **single combined job** for build/smoke/pack | Build → smoke → pack share `npm ci` install setup; combining is cheaper and gives one named PR-checklist line. Separate `test-core` named gate even though `test:core` runs transitively in the broader `test` job — clearer PR-checklist visibility when only core breaks. |
| 2 | Smoke adapter at `packages/core/tests/phaseh/adapters/multichannel-bkt-new.ts` **inlines the framework's `ImplAdapter` type** rather than importing from `@noesis/phaseh-equivalence` | Avoids a cross-workspace dependency from `packages/core` onto `noesis-proof`. Adapter is annotated with a pointer to the canonical types in `noesis-proof/adelaide/tools/phaseh-equivalence/src/types.ts`. |
| 3 | Smoke adapter's snapshot returns plain `Record`s, not `Map`s | Framework's path-based comparator walks structures by JSONPath; a `Map` round-trips through JSON as `{}`. Keys sorted lexicographically before serialization for stable output. |
| 4 | Fix pre-existing H-1 lint debt (4 ESLint errors + 2 warnings in `LayeredMasteryModel`, `SessionMetricsLogger`, `fatigue.test.ts`, `layeredMastery.test.ts`) rather than ignoring | Lint failures were blocking the new CI gates from being meaningful. The errors aren't new in this session but inherited the responsibility because the new CI gates depend on Lint passing. All mechanical, behavior-preserving. |
| 5 | Run `prettier --write` across all 58 off-format files in one pass | Pre-existing format drift across `apps/`, `docs/`, `packages/`, and `test/`. A single mechanical `npm run format` pass produces a 339+/569- diff that is purely whitespace, quote style, and line-break changes — no behavior shift, no per-file judgment calls needed. |
| 6 | Build core first via explicit `npm run build -w @noesis-edu/core` in `build:packages`, before the broader `--workspaces --if-present` | `npm` workspaces run in alphabetical order, not topological. Adapter packages (`adapters-attention-web`, `adapters-llm`, `content-pt-br-math`) all `import '@noesis-edu/core'` and need its `dist/*.d.ts` to type-resolve, but core builds last alphabetically. Explicit core-first is simpler than introducing project references, wireit, or turbo. The redundant rebuild via `--workspaces` is a tsc no-op (~1 s). |
| 7 | Sync `package-lock.json` (commit `bd1551b`) by running `npm install --package-lock-only` rather than asking permission | The lockfile drift (missing `@noesis/content-pt-br-math` workspace entry + stale `0.1.0` core version) was rendering every CI job since the version bump (commit `0b86d4b`, two days ago) red on `npm ci`. Without it, the new gates couldn't run. The diff was 19 lines and purely synthetic — no production deps changed. Treated as a hard prerequisite for "do item #1: CI workflow check," which the user had already authorized. |

---

## 3. Tasks completed this session (8 commits on `phase-h-1/core-0.3.0`)

In commit order, oldest first:

| Commit | Subject | Why |
|---|---|---|
| `9f2d928` | `ci: enforce smoke:core + verify:core:pack on every PR (H-1 follow-up)` | Closes handoff §6 item #5. Two new jobs in `.github/workflows/ci.yml`: `test-core` (named gate for `npm run test:core`) and `core-package` (build:core → smoke:core → verify:core:pack with the same test-files-leak guard `release.yml` uses). |
| `d960e54` | `test(phaseh): smoke-test equivalence framework against MultiChannelBKTEngine` | Closes handoff §6 item #3. New fixture envelope at `packages/core/tests/phaseh/fixtures/smoke-mcbkt-001/` exercises cold-init, multi-channel state, drilling discount, `skillCategoryModifier`, and cross-UTC-day `correctDays`. New adapter `multichannel-bkt-new.ts`. Both cross-impl and regression mode return `EQUIVALENT`. Documented at `docs/architecture/PHASE_H_EQUIVALENCE_REPORT.md`. |
| `bd1551b` | `chore: sync package-lock.json with workspaces (unblock CI)` | `npm install --package-lock-only`. Adds the missing `@noesis/content-pt-br-math` workspace entry; bumps `packages/core` from `0.1.0` → `0.3.0-rc.0` in the lockfile. |
| `fdc63d1` | `test(phaseh): drop non-null assertions in MCBKT adapter snapshot` | Iterate via `.entries()` rather than `.keys()` then `.get(key)!`. Drops the two non-null assertions ESLint flagged on the adapter; behavior unchanged, regression run still `EQUIVALENT`. |
| `684dcb2` | `fix(core): resolve H-1 lint failures (unblock CI Lint job)` | Four files: drop unused `beforeEach` import in `fatigue.test.ts`; drop unused `NEXT_DAY` constant in `layeredMastery.test.ts`; tighten `!= null` → `!== null` in `LayeredMasteryModel.ts` (`SkillChannelMapping.forSkill` returns `ChannelId \| null`, so the operators are equivalent there); replace `.keys() … .get(key)!` with `.entries()` iteration in `SessionMetricsLogger.ts`'s two aggregators. |
| `fff441e` | `style: prettier --write across the repo (unblock CI Lint job)` | `npm run format` across the repo. 58 files, 339+/569-, pure whitespace/quote/line-break normalization. Tests still 742/742. |
| `dcc38d7` | `build: build core before dependent workspaces (unblock CI Build job)` | `package.json`'s `build:packages` script now runs `npm run build -w @noesis-edu/core` first, then the broader `npm run build --workspaces --if-present`. Reproduced the failure locally with `rm -rf packages/*/dist && npm run build:packages`; confirmed the fix produces clean output for both `build:packages` and the full `npm run build` (packages + Vite app + esbuild server). |

Plus this handoff doc.

### Verification

After all commits, PR #16 CI matrix:

| Job | Result |
|---|---|
| Lint | ✅ pass (35s) |
| Type Check | ✅ pass (28s) |
| Test | ✅ pass (1m31s) |
| Core Tests (named gate) | ✅ pass (33s) — new |
| Core Package (build + smoke + pack) | ✅ pass (25s) — new |
| Replay Determinism Gate | ✅ pass (26s) |
| Security Audit | ✅ pass (25s) |
| Build | ✅ pass (40s) |
| Docker Build | skipping (only fires on push to main; expected) |

The handoff §8 caution "Don't merge PR #16 to main without CI green" is now satisfied.

---

## 4. Vertical workspace recon (what's true today)

Findings from auditing the four sister workspaces. The 2026-05-04 handoff said "Awaiting RC publish" for all of them — that's now stale. Reality:

### `noesis-delf/denpasar-v1` — H-2 push-down COMPLETE

- **Branch:** `phase-h-2/migrate-to-0.3.0` (pushed; not merged).
- **Commits:** `dc69b0e` (audit + fixtures), `45f2282` (H-2 push-down), `4166957` (vendor core tarball + Stripe API bump).
- **Vendored core:** `vendor/noesis-edu-core-0.3.0-rc.0.tgz` — SHA1 `d6cf1cdff860a75476f3b9d51572293ce6eff1ee`, byte-identical to our local pack. `package.json` pins `"@noesis-edu/core": "file:vendor/noesis-edu-core-0.3.0-rc.0.tgz"`.
- **Pack package:** `packages/content-delf-fr/` (`@noesis-content/delf-fr`) with `FrenchAnswerNormalizer` + 47-char French-diacritic test suite. The `engineService.ts` now imports the normalizer from this package.
- **Tests:** 129/129 passing, including `tests/phaseh/replay.test.ts` (3 fixtures: cold-start / mid-mastery / end-of-session, all match captured state).
- **Framework conformance:** all 3 fixtures load cleanly via `loadFixture`. Both `delf-engine-old.mts` and `delf-engine-new.mts` adapters wrap the same `createNoesisCoreEngine` call — explicit comment notes "smoke check that the bump didn't accidentally drift any output," since 0.2.0 → 0.3.0-rc.0 is a no-op for the single-channel surface delf uses.

### `noesis-math/athens` — H-3 PREP, push-down NOT done

- **Branch:** `phase-h-3/migrate-to-0.3.0`.
- **Commits:** `e33e327` (restructure fixtures + write oldImpl adapters), `877be11` (CI fix: local types for adapters).
- **Fixtures:** 24 canonical-envelope fixtures across 6 module dirs (`bkt`, `calibrator`, `fatigue`, `fsrs`, `mastery`, `planner`). The 2026-05-04 handoff's "73 fixtures" was the pre-canonicalization loose-file count.
- **Adapters:** 5 oldImpl adapters at `tests/phaseh/adapters/` (bkt, calibrator, fatigue, fsrs, mastery). Self-test `parity.test.ts` exercises 3 of 24 fixtures only.
- **Tests:** 597/597 passing — but math hasn't pulled the new core in yet.
- **`package.json` STILL pins `"@noesis-edu/core": "0.1.0"`** despite being on the migration branch. The H-3 prep adapters have not been compiled against the new core API.
- **Framework conformance: 0/24 fixtures load.** Two distinct failure modes:
  - 21 fixtures (bkt, calibrator, fatigue, fsrs, planner): events lack `id`, `learnerId`; `timestamp` is a string ISO date instead of a number; `sessionId` doesn't match meta.sessionId.
  - 3 mastery fixtures: `events.jsonl` doesn't contain events at all — it's a series of `{label, state}` snapshot rows. Wholly different shape from `ReplayEvent`.
- **What this means:** math's local `parity.test.ts` works because it bypasses framework validation — it imports adapters directly and reads events as opaque JSON. But math cannot drive cross-impl equivalence through the proof framework until the events are normalized.

### `noesis-eng/banjul` — H-4 FOUNDATION, push-down NOT done

- **Branch:** `phase-h-4/migrate-to-0.3.0`.
- **Commits:** `f7086e4` (foundation: bump core@0.3.0-rc.0 + fixture envelopes + legacy snapshots).
- **Core dep:** `"@noesis-edu/core": "file:../../noesis-core/abuja-v1/packages/core"` — symlinks directly to our live source. When we push to `phase-h-1/core-0.3.0`, eng's tests pick up the change immediately.
- **Legacy snapshots:** all 9 H-1 service files preserved as `*.legacy.ts` (byte-identical) for future cross-impl comparison against the post-migration `*.ts` versions.
- **Fixtures:** 24 canonical-envelope fixtures across 7 module dirs (`bkt-multichannel`, `fsrs`, `item-history`, `mastery-layered`, `planner`, `planner-snapshot`, `session-state`).
- **Adapters: NONE yet.** Eng's commit message says "First commit of three for the H-4 push-down" — adapters and engine deletion are scheduled for commits 2 and 3.
- **Tests:** 1050/1050 passing **against the live core 0.3.0-rc.0 source**, including `src/__tests__/coreCompatibility.test.ts` (67 tests proving eng's local `calculateBKTUpdate` matches core's `createBKTEngine` numerics) and `tests/phaseh/regression-runner.test.ts` (in-process parity check between current `bktService.ts` and `bktService.legacy.ts`).
- **Framework conformance: 24/24 fixtures load cleanly.**

### `noesis-proof/adelaide` — framework READY

- **Branch:** `ChrisTelles152/phase-h-prep`.
- **No further commits since `98d4327`** (the framework itself).
- **Verification:** smoke-tested by us this session against `MultiChannelBKTEngine` — works in both cross-impl and regression mode. See `docs/architecture/PHASE_H_EQUIVALENCE_REPORT.md`.

---

## 5. Open / up-next (priority order)

Critical path items first:

### Immediate (gating downstream work)

1. **Merge PR #16 to `main`.** All CI checks green for the first time. No more blockers from this side.

2. **Edward publishes `@noesis-edu/core@0.3.0-rc.0` to npm with `--tag rc`.** Instructions at `docs/release/0.3.0-rc.0-publish-instructions.md`. Once published, the verticals can drop their workarounds (`vendor/`-tarball in delf, `file:`-link in eng/math). Until then, those workarounds are functional but brittle.

### High-value, not blocking

3. **Push the math fixture-format fix down** *(new finding from this session)*. Math's 24 fixtures are rejected by the framework's `loadFixture`. Recommended action: send a focused prompt to the math agent's workspace describing the four divergences (`id`, `learnerId`, `timestamp` type, `sessionId` matching) and the wholly-different shape of the mastery fixtures. Math also needs to bump `@noesis-edu/core` to `0.3.0-rc.0`.

4. **Eng to write oldImpl adapters** *(in flight)*. Eng's commit message indicates this is "First commit of three" for H-4 push-down. Adapters + engine-code deletion expected in commits 2 + 3.

5. **Cross-module integration test** *(handoff §6 item #4, ~30 min)*. Test that `MultiChannelBKTEngine` → `LayeredMasteryModel` → `BudgetedSessionPlanner` work together end-to-end. File at `packages/core/src/__tests__/integration.test.ts`. Catches H-1 wiring bugs that no single-module unit test can.

6. **Add a canonical `core-default-engine-new.ts` adapter** *(~15 min, new finding)*. Both delf adapters' docstrings reference this expected file at `packages/core/tests/phaseh/adapters/core-default-engine-new.ts`. Wraps `createNoesisCoreEngine` for the single-channel case. Lets delf point its `--new` at our copy instead of the placeholder it inlines today.

### Phase H wrap-up

7. **H-5: promote `0.3.0-rc.0` → `0.3.0` stable.** Coordination only — gated on H-2/H-3/H-4 merging green plus proof certification.

8. **`STATUS.md` + `docs/site/` updates** *(handoff §6 item #10)*. The Astro Starlight docs site documents 0.2.0 only. Lands before stable 0.3.0, not blocking RC.

### Beyond Phase H

9. **Phase 2** of `UNIFICATION_ADR.md` migration plan: rename `noesis-pilot` → `noesis-app`, scaffold Next.js, set up Supabase project. ~1 week.

10. **Phase 3** — extract `apps/server` + `apps/web-demo` from `noesis-core` into `noesis-app`. ~2-3 weeks. After this, `noesis-core` is SDK-only.

11. **Phase 4** — reduce verticals to `@noesis-content/*` packages. ~3-4 weeks.

12. **Phase 5** — hardening + launch. ~2-3 weeks.

---

## 6. Things to watch (carry-over from 2026-05-04 plus new)

Original handoff §8 still applies; new things this session surfaced:

- **`dist/` is not excluded from ESLint.** When developers run `npm run lint` after `npm run build:core`, eslint hits the built `dist/engine/NoesisCoreEngineImpl.js` and reports `_event` unused. CI never sees this because CI doesn't build before linting. Low priority but a paper cut for local devs. Fix: add `dist/` to the eslint `ignorePatterns`.

- **20 npm audit vulnerabilities flagged on every install** (1 low, 10 moderate, 9 high). Pre-existing across the H-1 work — not a regression from this session. The CI `Security Audit` job runs `npm audit --omit=dev` with `continue-on-error: true`, so it doesn't block PR merges, but the vulnerability count is steadily climbing. Worth a triage pass before stable 0.3.0.

- **Math has not bumped to core 0.3.0-rc.0** despite being on `phase-h-3/migrate-to-0.3.0`. If math's H-3 prep agent picks up where they left off without first bumping the dependency, their adapter compilation will silently regress against the old API.

- **delf vendored a tarball SHA tied to `0.3.0-rc.0`.** When core ships `0.3.0-rc.1` or `0.3.0` stable, delf will need a re-vendor or — preferably — a switch to the npm-published version once available.

- **Eng's `file:` link to noesis-core's live source is fragile** to workspace path renames. If `noesis-core/abuja-v1/` ever moves, eng breaks. Same fix path: switch to npm-published version once available.

- **The MCBKT smoke fixture exercises 10 events on a single learner.** It's a wiring smoke, not a soak test. The vertical fixtures (math 24, eng 24) are richer; we should rely on those for thorough equivalence rather than expanding the smoke fixture.

---

## 7. Quick orientation for a fresh agent

1. **Read in order:** this doc → `docs/handoff/2026-05-04-phase-h-state.md` → `docs/architecture/UNIFICATION_ADR.md` → `docs/architecture/PHASE_H_DIVERGENCE_LOG.md` → `docs/architecture/PHASE_H_EQUIVALENCE_REPORT.md` → `packages/core/CHANGELOG.md`.
2. **Check git state:** `git -C /Users/christelles/conductor/workspaces/noesis-core/abuja-v1 log --oneline -10` — confirm you're on `phase-h-1/core-0.3.0` with `dcc38d7` at the tip.
3. **Run the test suite:** `cd /Users/christelles/conductor/workspaces/noesis-core/abuja-v1 && npm run test:core` — should report 742 passed.
4. **Check CI:** `gh pr checks 16` — should show all pass except `Docker Build` skipping.
5. **Check what's open:** §5 above is the priority-ordered list.
6. **Don't recreate work:** the user will tell you what's next. Don't re-run audits, don't re-do push-down prompts, don't rewrite the migration guide. Build on top.

---

## 8. Final state checklist

| Item | State |
|---|---|
| PR #16 CI fully green | ✅ first time on this branch |
| `Lint` passing (eslint + prettier:check) | ✅ |
| `Test` passing | ✅ 742/742 core, all workspaces clean |
| `Build` passing (workspace topo order fixed) | ✅ |
| `Core Tests` + `Core Package` named gates wired | ✅ |
| Equivalence framework smoke-tested vs MCBKT | ✅ — `EQUIVALENT` cross-impl + regression |
| `package-lock.json` synced with workspaces | ✅ |
| Vertical recon documented | ✅ — §4 above |
| Edward published to npm | ❌ awaiting Edward |
| H-2 push-down (delf) | ✅ on `phase-h-2/migrate-to-0.3.0` (not merged) |
| H-3 push-down (math) | 🟡 prep only — fixtures need normalization, dep needs bump |
| H-4 push-down (eng) | 🟡 foundation only — adapters and engine deletion still pending |
| Cross-module integration test | ❌ open (§5 item #5) |
| H-5 stable promotion | ❌ awaiting H-2/H-3/H-4 |
| Pre-existing npm audit triage | ❌ deferred |

---

End of handoff. Next-agent prompt at `docs/handoff/2026-05-04-fresh-agent-prompt.md` is still applicable; replace the "read-this-first" reference with this document.
