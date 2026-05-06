# PHASE_H_EQUIVALENCE_REPORT — Framework Smoke Test Against core 0.3.0-rc.0

**Date:** 2026-05-05
**Status:** Smoke test passing
**Owner:** noesis-core agent (Phase H-1 follow-up, handoff §6 item #3)
**Companion:** `noesis-proof/adelaide/docs/PHASE_H_EQUIVALENCE_FRAMEWORK.md` (framework design)

---

## 1. Why this exists

Before the H-2 / H-3 / H-4 push-downs start (where each vertical replaces its
local `bktService.ts` with `@noesis-edu/core@0.3.0-rc.0`'s
`MultiChannelBKTEngine`), the equivalence framework that proves byte-identical
behavior across old-and-new must itself be confirmed to run against the new
core modules. Catching a framework or wiring bug now is far cheaper than
catching it mid-H-2 against a vertical's real fixtures.

This report records that smoke run.

---

## 2. What was built

### Fixture

`packages/core/tests/phaseh/fixtures/smoke-mcbkt-001/`

A 10-event single-session fixture that exercises the four behaviors most
likely to differ between vertical impls and core's `MultiChannelBKTEngine`:

1. **Cold-init from `pInit`** — first attempt on an unseen `(skill, channel)`.
2. **Multi-channel state separation** — same skill across `recog_mc`, `cloze`,
   `prod_typed`; per-channel state must stay independent.
3. **Drilling-discount activation** — third+ attempt on the same
   `(skill, channel)` in the same session triggers the
   `attemptsBeforeDiscount=2` / `multiplier=0.3` reduction on the learning
   transition.
4. **`skillCategoryModifier` path** — the grammar-modifier slot
   (`pLearnMultiplier=0.85`, `pSlipAdd=0.03`) is applied to one skill but not
   the other, isolating the modifier's contribution.
5. **`correctDays` cross-day accumulation** — event 10 jumps to 2024-01-02 so
   the UTC-date-string append path is exercised on an existing
   `(skill, channel)` that already has 2024-01-01 in its `correctDays`.

Envelope conforms to `noesis-proof/adelaide/docs/PHASE_H_EQUIVALENCE_FRAMEWORK.md`
§4 (`fixture.json`, `initial-state.json`, `events.jsonl`, `expected-output.json`).
No `options.json` — defaults are accepted (snapshot every event, self-equiv on).

### Adapter

`packages/core/tests/phaseh/adapters/multichannel-bkt-new.ts`

Wraps `MultiChannelBKTEngine` in the framework's `ImplAdapter<MCBKTSnapshot>`
contract. Notable design choices:

- **Framework types are inlined**, not imported from the proof workspace. This
  avoids a cross-workspace dependency in `packages/core/`. The shapes mirror
  `noesis-proof/adelaide/tools/phaseh-equivalence/src/types.ts`; the
  inline copy is annotated with a pointer to the canonical source.
- **State snapshot returns plain `Record`s, not `Map`s.** The framework's
  comparator walks structures by JSONPath; `Map` would round-trip through
  JSON as `{}`. Keys are sorted lexicographically before serialization for
  stable output.
- **`now` is taken from the event's `timestamp`**, not from the framework-
  injected `clock`. `MultiChannelBKTEngine.applyAttempt` accepts `now: number`
  rather than reading from a clock — the framework's clock is honored
  defensively (passed through to `init`) but not consulted by MCBKT itself.
- **`skillCategory` lookup** lives in `initial-state.json` as a
  `skillCategories: Record<skillId, category>` map. The adapter reads it once
  in `init` and applies per attempt.

---

## 3. Smoke run results

### Cross-impl mode (adapter on both sides)

Drives the same adapter as both `--old` and `--new`. Self-equivalence runs on
each side; cross-side comparison should report `EQUIVALENT` trivially. Confirms
the framework can load the adapter, run its `init` / `step` / `finalize`, and
walk the snapshot structure end-to-end.

```
cd /Users/christelles/conductor/workspaces/noesis-proof/adelaide/tools/phaseh-equivalence
npm run start -- \
  --fixture /Users/christelles/conductor/workspaces/noesis-core/abuja-v1/packages/core/tests/phaseh/fixtures/smoke-mcbkt-001 \
  --old    /Users/christelles/conductor/workspaces/noesis-core/abuja-v1/packages/core/tests/phaseh/adapters/multichannel-bkt-new.ts \
  --new    /Users/christelles/conductor/workspaces/noesis-core/abuja-v1/packages/core/tests/phaseh/adapters/multichannel-bkt-new.ts
```

Result:

```
oldImpl: core.MultiChannelBKTEngine@0.3.0-rc.0 (selfEquivalent=true)
newImpl: core.MultiChannelBKTEngine@0.3.0-rc.0 (selfEquivalent=true)
Result:  EQUIVALENT
Snapshots compared: 11    (10 per-event + 1 finalize)
Exit code: 0
```

### Regression mode (adapter vs. expected-output.json)

`expected-output.json` was produced by running the adapter once and capturing
the full snapshot trace + `finalize()` output. Regression mode then drives the
adapter again and compares against that frozen reference. Confirms the
regression-mode comparison path also runs end-to-end and pins the adapter's
behavior so any future change to `MultiChannelBKTEngine` that alters the
output will be caught here without needing a cross-impl partner.

```
npm run start -- \
  --fixture .../smoke-mcbkt-001 \
  --old    .../multichannel-bkt-new.ts \
  --regression
```

Result:

```
oldImpl: core.MultiChannelBKTEngine@0.3.0-rc.0 (selfEquivalent=true)
newImpl: expected-output.json (selfEquivalent=true)
Result:  EQUIVALENT
Snapshots compared: 11
Exit code: 0
```

---

## 4. What this proves (and doesn't)

**Proves:**

- `noesis-proof/adelaide/tools/phaseh-equivalence` (the framework) loads,
  parses, and validates a noesis-core-side fixture envelope correctly.
- The framework can dynamically import a TS adapter from another workspace
  via tsx, smoke-validate its export shape, and drive `init` / `step` /
  `finalize` through the event sequence.
- `MultiChannelBKTEngine`'s `applyAttempt` is deterministic for replay (the
  framework's self-equivalence check ran the adapter twice on the same
  fixture and compared every snapshot — zero divergences).
- Both cross-impl and regression comparison paths execute end-to-end without
  framework-side errors.
- The state shape returned by the adapter (sorted-key plain objects, full
  `ChannelSkillProbability` records under `skills[skillId][channelId]`) is
  JSONPath-walkable by the comparator.

**Does NOT prove:**

- That core's `MultiChannelBKTEngine` produces the same outputs as any
  vertical's existing `bktService.ts`. That's the cross-impl test the
  vertical agents will run during H-2 / H-3 / H-4, with their own fixtures
  + their own old-impl adapters.
- That every other H-1 module (FSRS, planner, mastery, …) round-trips through
  the framework. Each will need its own fixture + adapter at push-down time.
  This smoke covers the wiring; per-module coverage is push-down work.
- Cross-repo CI integration. `PHASE_H_EQUIVALENCE_FRAMEWORK.md` §10 describes
  Layer 2 as documented but not wired; that remains open work.

---

## 5. Files committed

| Path | Role |
|---|---|
| `packages/core/tests/phaseh/fixtures/smoke-mcbkt-001/fixture.json` | metadata + adapter routing |
| `packages/core/tests/phaseh/fixtures/smoke-mcbkt-001/initial-state.json` | MCBKT config + skillCategories map |
| `packages/core/tests/phaseh/fixtures/smoke-mcbkt-001/events.jsonl` | 10 practice events |
| `packages/core/tests/phaseh/fixtures/smoke-mcbkt-001/expected-output.json` | per-event snapshots + finalState (regression-mode reference) |
| `packages/core/tests/phaseh/adapters/multichannel-bkt-new.ts` | core-side adapter |
| `packages/core/tests/outputs/` (gitignored) | generated framework run reports |

Reports under `tests/outputs/` are regenerated on every framework run; they
are gitignored so each run starts clean.

---

## 6. How to re-run

The bundled `start` script runs the framework via `tsx` against its TS
sources, which is the form that handles dynamic-import of TS adapters
correctly. From the proof workspace:

```bash
cd /Users/christelles/conductor/workspaces/noesis-proof/adelaide/tools/phaseh-equivalence
npm run start -- \
  --fixture <abs-path-to-fixture-dir> \
  --old    <abs-path-to-adapter.ts> \
  [--new   <abs-path-to-other-adapter.ts>] \
  [--regression]
```

`--old` is required in both modes. In regression mode `--new` is omitted and
the framework compares the `--old` adapter's output against the fixture's
`expected-output.json`.

To regenerate `expected-output.json` after a deliberate behavior change to
`MultiChannelBKTEngine` (e.g., a future tuning of the drilling discount), run
the adapter once and capture the snapshots — see the one-shot script pattern
the smoke run used (committed only to the conversation log, not the repo,
because the framework will eventually ship its own
`scripts/emit-expected.ts` per `PHASE_H_EQUIVALENCE_FRAMEWORK.md` §11).

---

## 7. Next steps

In priority order:

1. **Vertical agents adopt the same fixture-envelope shape** for their H-2 /
   H-3 / H-4 push-down work. Their `phase-h-prep` branches already commit
   fixtures (delf: 3, math: 73, eng: 24); confirm those conform to the v0
   envelope and add a per-vertical `bkt-old.ts` adapter that wraps the
   local `bktService.ts`.

2. **Per-module adapters at push-down time.** When H-2/H-3/H-4 starts on each
   vertical, add the corresponding `<module>-new.ts` adapter under
   `packages/core/tests/phaseh/adapters/` for every module under push-down
   (FSRS, layered mastery, budgeted planner, optimistic-locking store,
   session metrics, fatigue, calibrator, item history, answer normalizer).
   Re-use this MCBKT adapter as the structural template.

3. **Wire Layer-2 CI** (per `PHASE_H_EQUIVALENCE_FRAMEWORK.md` §10) once the
   cross-repo `actions/checkout` permissions are in place. Until then, the
   framework runs are manual and developer-driven, as in this report.
