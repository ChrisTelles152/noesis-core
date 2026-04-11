# Production Readiness — Noesis Core

**Domain:** none (library package)
**Last reviewed:** 2026-04-11

---

## Current State

### What exists
- Adaptive learning engine (TypeScript library)
- Spaced repetition algorithm
- Mastery graph with prerequisite tracking
- Google OAuth integration added
- 5 investigation follow-up prompts sent (docs/INVESTIGATION_PROMPTS.md)

### What works
- Core engine compiles and passes existing tests
- Mastery scoring logic
- Google OAuth flow (added recently)

### What's broken / incomplete
- Investigation results not yet acted on
- Algorithm correctness issues (spaced repetition edge cases)
- Mastery graph edge cases unresolved
- No integration tests with noesis-math content pack
- Not published to npm
- This is the **bottleneck for all Noesis products** — noesis-pilot and noesis-eng both depend on it

---

## Claude Code Tasks

### Task 1 — Execute all 5 investigation follow-up prompts

```
You are working in /root/projects/noesis/noesis-core.

Read docs/INVESTIGATION_PROMPTS.md (it should exist — if not, check docs/ for any
file with "investigation" or "prompts" in the name).

Execute each of the 5 investigation follow-up prompts in order. For each:
1. Perform the investigation (read relevant code, run tests if needed)
2. Document findings in docs/INVESTIGATION_RESULTS.md (one section per prompt)
3. Identify actionable fixes

After all 5 are documented, summarize:
- What are the most critical bugs?
- What should be fixed before pilot launch?
- What can be deferred?

Do not fix anything yet — document first, then we'll prioritize.
```

### Task 2 — Fix algorithm issues

```
You are working in /root/projects/noesis/noesis-core.

Based on the investigation results from Task 1 (docs/INVESTIGATION_RESULTS.md),
fix the identified algorithm issues.

Focus on:
1. **Spaced repetition correctness** — SM-2 or FSRS algorithm implementation.
   Common bugs: incorrect interval computation after wrong answer, ease factor
   not clamped to minimum, initial interval not set correctly.
   Fix: compare your implementation against the SM-2 spec:
   https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method

2. **Mastery graph edge cases**:
   - Circular prerequisite detection (should throw, not infinite loop)
   - Node with no prerequisites: mastery should be computable independently
   - All prerequisites met but node shows 0 mastery: fix
   - Mastery regression: can mastery go backwards? (it should, on wrong answers)

3. After each fix, write a failing test first (TDD), then implement the fix.

Run full test suite after all fixes: npm test
Target: all tests pass, no regressions.
```

### Task 3 — Simplify for MVP

```
You are working in /root/projects/noesis/noesis-core.

Review the current API surface of the engine. The goal is a lean, working adaptive
engine for the noesis-pilot — not a feature-complete platform.

Identify abstractions that are:
- Not used by any consumer currently
- Too complex for a 10-learner pilot
- Planned for a future roadmap (defer, don't delete)

Create docs/MVP_SCOPE.md listing:
- KEEP: features needed for pilot (adaptive sessions, mastery tracking, spaced repetition)
- DEFER: features not needed for pilot but should stay in codebase (mark with // TODO: phase 2)
- REMOVE: dead code, unused abstractions with no planned use

Implement the removals and deferments. Do not break the public API — just simplify
internal implementation where possible. If a public API method needs to be deprecated,
mark it @deprecated but keep it working.

Run tests after cleanup.
```

### Task 4 — Integration tests with noesis-math

```
You are working in /root/projects/noesis/noesis-core.

noesis-math is at /root/projects/noesis/noesis-math (or linked as a package — check).

Write integration tests that use real noesis-math content:

1. Load a sample content pack from noesis-math
2. Create an adaptive session for a simulated learner
3. Answer 10 questions (mix of correct and incorrect)
4. Assert:
   - Mastery score changes correctly after each answer
   - Next question selection is sensible (not repeating just-answered questions immediately)
   - Spaced repetition intervals are computed
   - Session summary is correct

5. Test the full mastery achievement flow:
   - Answer all questions for a topic correctly with high confidence
   - Assert mastery reaches 100% and topic is marked complete

Save tests in tests/integration/noesis-math.test.ts.
Add a npm script: "test:integration"
```

### Task 5 — npm package publishing pipeline

```
You are working in /root/projects/noesis/noesis-core.

Set up the npm publishing pipeline:

1. Verify package.json is correct:
   - name: "@noesis/core" (or "noesis-core" — check current name)
   - version: follows semver
   - main/module/types fields point to built output
   - files: includes only dist/, not src/ or tests/
   - engines: specifies required Node version

2. Add build pipeline:
   - npm run build → compiles TypeScript to dist/
   - npm run prepublishOnly → runs build + tests before publishing
   - dist/ is in .gitignore but NOT in .npmignore

3. Add .npmignore (exclude: src/, tests/, docs/, .env*, *.test.ts)

4. Add CHANGELOG.md with initial version entry

5. For local development linking (without publishing):
   - npm run build
   - npm link
   - In noesis-pilot: npm link noesis-core (or @noesis/core)

Document the publish workflow in docs/PUBLISHING.md.
Do NOT actually publish to npm — just set up the pipeline.
```

---

## Edward Tasks

1. **Pull investigation results when complete** — after Claude Code Task 1 runs, read `docs/INVESTIGATION_RESULTS.md` and report key findings to Chris.

2. **Run tests after fixes**:
   ```bash
   cd /root/projects/noesis/noesis-core
   npm test
   npm run test:integration
   ```
   Report pass/fail and any remaining failures.

3. **Set up local linking for pilot**:
   ```bash
   cd /root/projects/noesis/noesis-core
   npm run build
   npm link
   cd /root/projects/noesis/noesis-pilot
   npm link noesis-core  # or @noesis/core
   ```
   Verify the pilot can import from the engine.

4. **Publish to npm if/when Chris approves** — use `npm publish --access public` after all tests pass.

---

## Chris Tasks

1. **Review algorithm audit findings** — the core question: does the adaptive engine actually produce sensible learning outcomes? Do the investigation results show the SM-2/spaced repetition math is correct? If the algorithm is fundamentally broken, this needs escalation before any pilot.

2. **Decide: which features to keep vs defer for pilot** — the pilot needs a minimal working engine, not a full platform. Review `docs/MVP_SCOPE.md` once Claude Code produces it. Your call on what's truly needed for 10 pilot learners.
