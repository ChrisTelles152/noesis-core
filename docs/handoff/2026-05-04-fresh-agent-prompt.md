# Fresh-agent prompt — Phase H state, 2026-05-04

Paste this into a new Claude Code window opened at the same workspace. The
agent will orient itself, read the handoff doc, and stand ready for whatever
you direct next.

---

```
You are picking up the noesis-core repo mid-migration. Workspace path:
/Users/christelles/conductor/workspaces/noesis-core/abuja-v1
Current branch: phase-h-1/core-0.3.0 (24 commits ahead of main, pushed; PR #16 open)

ORIENTATION (do this first, in order):

1. Read docs/handoff/2026-05-04-phase-h-state.md end-to-end. It's the
   handoff doc — captures all decisions, all research, what was built, what's
   open, things to watch. ~600 lines. Don't skip; this conversation isn't
   short and the doc compresses it efficiently.

2. Read docs/architecture/UNIFICATION_ADR.md (strategic decisions, 5-phase
   migration plan). About 300 lines.

3. Skim docs/architecture/PHASE_H_DIVERGENCE_LOG.md (module-by-module catalog
   of what's universal vs subject-specific vs app-infra). Read the top-line
   findings + side-by-side feature matrix. Skim the rest.

4. Skim docs/architecture/PHASE_H_EXECUTION_PLAN.md (Phase H atomized
   subtasks with progress markers). H-1 sub-phases A through F are all marked
   done with commit hashes; H-2/H-3/H-4 are delegated to vertical agents.

5. Skim packages/core/CHANGELOG.md 0.3.0-rc.0 entry (what shipped — twelve
   modules + surface changes).

6. Skim docs/migration/0.2-to-0.3.md (consumer migration guide for verticals).

7. Optional: docs/release/0.3.0-rc.0-publish-instructions.md if the user asks
   about Edward / npm publish.

8. Run: `cd /Users/christelles/conductor/workspaces/noesis-core/abuja-v1 && npm run test:core`
   Expect 742 tests passing in ~3 seconds. If anything fails, stop and
   investigate before doing other work.

9. Run: `git -C /Users/christelles/conductor/workspaces/noesis-core/abuja-v1 log --oneline -25`
   Confirm you see commits from `af5c705` (planning artifacts) through
   `d47b77e` (post-H-1 housekeeping). The PR was opened at commit `0b86d4b`.

KEY RULES:

- Do NOT recreate work. The user will tell you what to do next. Don't re-run
  audits, don't re-write the push-down prompts, don't redraft the migration
  guide.

- Do NOT write to other Conductor workspaces. Each vertical workspace
  (noesis-delf/denpasar-v1, noesis-math/athens, noesis-eng/banjul,
  noesis-proof/adelaide) has its own agent and its own branch. Cross-workspace
  edits create silent merge conflicts and break the parallelization model.
  Coordination happens via prompts you draft and the user pastes there.

- Do NOT change behavior of any 0.2.0 surface. The whole H-1 design pivots
  on additive-only API expansion. If you discover a behavior in 0.2.0 that's
  wrong but landed accidentally, file an issue but do not fix it on this
  branch. Behavior fixes wait for 0.4.0.

- Do NOT use Date.now() directly anywhere in core. Always use the injected
  ClockFn (from events/index.ts) or accept `now: number` as a parameter.
  Replay determinism depends on this.

- The pinned-version test (packages/core/src/__tests__/version.test.ts:24)
  is intentional: if you bump the package version, bump it there too.

- One long-lived branch + one PR (#16). Don't chunk into separate PRs without
  user direction.

WHAT'S OPEN (priority order, full detail in handoff doc §6):

  Critical path:
  1. PR #16 merge (user-driven)
  2. Edward publishes 0.3.0-rc.0 to npm with --tag rc
  3. Smoke-test noesis-proof's equivalence framework against core 0.3.0-rc.0
     (write a fixture + core-side adapter; run via proof's CLI; document the
     result in docs/architecture/PHASE_H_EQUIVALENCE_REPORT.md)

  High value:
  4. Cross-module integration test (MCBKT → LayeredMastery → BudgetedPlanner
     end-to-end) at packages/core/src/__tests__/integration.test.ts
  5. CI workflow check / add workflow if missing

  Phase H push-downs (delegated to vertical workspace agents — prompts at
  .context/h2-h3-h4-pushdown-prompts.md):
  6. H-2 push-down delf (~2-3 days)
  7. H-3 push-down math (~1 week)
  8. H-4 push-down eng (~1.5 weeks)

  Phase H wrap:
  9. H-5 promote 0.3.0-rc.0 → 0.3.0 stable (gated on H-2/H-3/H-4 + proof
     certification)
  10. STATUS.md + docs/site/ updates

  Beyond Phase H:
  11-14. Phases 2-5 of UNIFICATION_ADR.md (noesis-app skeleton, apps
  extraction, verticals → packs, hardening + launch)

REPORT BACK:

Do NOT start work yet. After orienting, send a short reply (under 300 words)
confirming:
  (a) you read the handoff doc + companion docs;
  (b) the test suite is green at 742;
  (c) you understand which workspace + branch you're on;
  (d) one or two things you noticed in the handoff that the user might want
      to address (don't fabricate; only flag if you see something real);
  (e) await direction on what to work on next.

The user will tell you what to do. Pick from the priority list above (item
3 — equivalence framework smoke test — is the highest-leverage thing
remaining if you have to recommend something), or wait for direction.

When you do start work, commit each discrete task with a clear commit message
matching the existing pattern (look at recent commits for the conventional
prefix + body shape). Push to origin/phase-h-1/core-0.3.0 to update PR #16.
```

---

## How to use this prompt

1. Open a new Claude Code window in this same workspace (or any window with
   read/write access to it).
2. Paste the prompt above (the block between the triple-tick fences).
3. The fresh agent will orient itself, run tests, and report back without
   starting any work.
4. Direct it from there.
