# Algorithm Audit — Noesis Core

> Generated 2026-04-10 from source code analysis of all core learning engine files.
> Updated with detailed numerical verification and additional findings.
>
> **Files audited:**
> - `packages/core/src/learner/BKTEngine.ts`
> - `packages/core/src/memory/FSRSScheduler.ts`
> - `packages/core/src/planning/SessionPlannerImpl.ts`
> - `packages/core/src/graph/SkillGraphImpl.ts`
> - `packages/core/src/diagnostic/DiagnosticEngineImpl.ts`
> - `packages/core/src/transfer/TransferGateImpl.ts`
> - `packages/core/src/engine/NoesisCoreEngineImpl.ts`
> - `packages/core/src/constitution.ts`
> - `packages/sdk-web/src/policies/mastery.ts`

---

## Executive Summary

The core learning algorithms are **mathematically correct** in their Bayesian updates and scheduling formulas. The BKT implementation faithfully follows Corbett & Anderson (1995), and the FSRS scheduler is self-consistent (though it departs from the published FSRS v4/v5 spec in its decay curve and parameter structure). The skill graph, session planner, and diagnostic engine are well-designed with proper determinism guarantees.

**Three issues warrant attention:** (1) BKT converges to mastery extremely fast with default parameters (2 correct answers), which may cause premature mastery declarations in a pilot. (2) There are two completely independent, incompatible spaced repetition systems in the codebase (FSRS in core, exponential spacing in sdk-web's MasteryTracker). (3) `registerTransferTests()` in `NoesisCoreEngineImpl` discards custom planner config when re-creating the session planner.

---

## Critical Issues

### 1. `registerTransferTests()` discards planner config

**File:** `NoesisCoreEngineImpl.ts:275-285`
**Severity:** CRITICAL — silently loses configuration

When transfer tests are registered, the engine re-creates the session planner with an empty config `{}`:
```typescript
(this as any).sessionPlanner = new SessionPlannerImpl(
  {},                      // <-- should be the original planner config
  this.transferTests,
  this.transferResults
);
```

This means any custom `SessionPlannerConfig` (mastery thresholds, weights, etc.) passed at engine construction is **silently replaced with defaults** the first time `registerTransferTests()` is called. Additionally, the `(this as any)` cast bypasses the `readonly` modifier, which is a code smell.

**Recommended fix:** Store the planner config in the constructor and reuse it:
```typescript
private readonly plannerConfig: Partial<SessionPlannerConfig>;
// In constructor:
this.plannerConfig = config.planner || {};
// In registerTransferTests:
this.sessionPlanner = new SessionPlannerImpl(
  this.plannerConfig, this.transferTests, this.transferResults
);
```

---

## Warnings

### 1. BKT mastery convergence is very fast (2 correct answers to mastery)

**Status:** ACKNOWLEDGED — keeping current defaults for the pilot. See "Decision rationale" below.

**File:** `BKTEngine.ts` — default params `pInit=0.3, pLearn=0.1, pSlip=0.1, pGuess=0.2`

With these defaults, only **2 consecutive correct answers** bring `pMastery` from 0.3 to above the 0.85 mastery threshold. Specifically: 1 correct → 0.6927, 2 correct → 0.9193 (pinned in `bkt.test.ts > BKT convergence numbers`). Conversely, **2 consecutive incorrect answers** drop mastery from 0.85 to ~0.19. This is standard BKT behavior but very aggressive for pedagogical purposes — most ITS literature reports 4-6 correct answers as typical for mastery.

**Impact:** Learners may be declared "mastered" on a skill after just 2 lucky correct answers, leading to premature progression. The high volatility (2 wrongs to lose mastery) also means a learner's state fluctuates wildly with individual responses.

**Decision rationale (Phase J4):** The Brazilian-Portuguese-math pilot will run with ~10–20 learners over a few weeks. At that sample size we cannot statistically distinguish 2-attempt convergence from 4-attempt convergence — there isn't enough signal to validate either parameter set against the other. Tuning to what literature *says* without data from *our* learners would be cargo-cult adjustment.

The plan is therefore:
1. Ship the pilot with the current defaults.
2. Log every practice event so post-pilot we have a real dataset.
3. Fit the BKT params (and ideally a learner-specific learning-speed signal — see §5.1.2 follow-up note) against the pilot data to find what convergence rate actually predicts long-horizon retention for *our* curriculum and *our* learners.
4. Re-tune in a documented commit, with the fitted convergence test bumped to the new number.

The convergence numbers are pinned in `packages/core/src/__tests__/bkt.test.ts > BKT convergence numbers (default params)`. If the defaults are tuned later, those tests will fail and force this audit entry to be re-dated.

**Alternatives considered (and not chosen for the pilot):**
- Lower `pLearn` to 0.05 (slower convergence, but with `pInit=0.3` this only marginally moves the convergence count — still 2 attempts to cross 0.85 with default thresholds).
- Lower `pInit` to 0.1 (3 attempts to cross 0.85). Cleanest single change but rolls back our cold-start prior across all 25 skills, which interacts with the diagnostic propagation logic.
- Combined `pInit=0.1` + `pLearn=0.05` (3 attempts, smoother trajectory). Smallest behaviour change among the "more conservative" options.

Any of these is a one-line code change once we choose to act on real data. Until then: status quo with the rationale on record.

### 2. Two competing spaced repetition systems

**Files:**
- `packages/core/src/memory/FSRSScheduler.ts` — FSRS power-law decay with stability/difficulty model
- `packages/sdk-web/src/policies/mastery.ts` — Exponential spacing: `hours = 24 * spacingFactor^progress * 0.5`

These are completely independent, incompatible scheduling systems. The core engine tracks FSRS stability/difficulty per skill with a 4-point rating scale, while the SDK's `MasteryTracker` uses a simple weighted-average progress score with exponential review intervals.

If both are active in a pilot app, they will produce conflicting recommendations about when to review. The `MasteryTracker` also uses `Date.now()` directly (not injectable), breaking the determinism contract that the core engine guarantees.

The `MasteryTracker` is already marked `@deprecated` in favor of `CoreEngineAdapter`. This is the correct direction.

**Recommendation:** Use the core engine's FSRS for all new code. The `MasteryTracker` should only be kept alive as long as existing web-demo code depends on it, and should eventually be removed.

### 3. FSRS rating simplification loses nuance

**File:** `NoesisCoreEngineImpl.ts:168`

The core engine converts practice events to FSRS ratings as: `correct → 3 (Good)`, `incorrect → 1 (Again)`. The FSRS algorithm supports 4 ratings (Again/Hard/Good/Easy), but the `PracticeEvent.correct: boolean` interface only carries a binary signal.

**Impact:** Acceptable for a pilot. The rating 2/4 distinction mainly affects interval lengths, not correctness. Can be extended later by adding an optional `rating` field to `PracticeEvent`.

### 4. BKT mastery and FSRS state can diverge

**Files:** `NoesisCoreEngineImpl.ts`, `SessionPlannerImpl.ts`

The session planner checks **BKT pMastery** to determine if prerequisites are met (lines 329-333), but checks **FSRS memory state** for error-focused practice (lines 287-291). These two models can diverge: a skill can have high BKT pMastery (e.g., 0.9) while simultaneously being in FSRS 'relearning' state (because the learner failed a spaced review).

In this scenario, the planner would:
- Allow the learner to progress to dependent skills (high BKT mastery)
- Also assign error-focused practice on the same skill (FSRS relearning)

This isn't necessarily wrong — BKT tracks knowledge and FSRS tracks memory — but it could confuse learners who see themselves "mastered" on a skill while still being assigned remedial practice on it.

**Recommendation:** Document this as intended dual-model behavior, or consider using a combined signal (e.g., require both BKT mastery AND FSRS review state to be favorable before declaring a skill mastered).

---

## Observations

### 1. FSRS retention formula departs from published spec

**File:** `FSRSScheduler.ts:189-193`

| Property | Implementation | FSRS v4/v5 Spec |
|----------|---------------|--------------|
| Retention formula | `(1 + t/(9S))^(-1)` | `(1 + 19t/(81S))^(-2)` |
| Decay shape | Reciprocal (hyperbolic) | Power-law with exponent -2 |
| R at t=S | 0.9 | 0.9 |
| Stability update | Single `stabilityDecay` param for all exponents | Three separate weights (w8, w9, w10) |
| Difficulty update | Linear: `D' = D - (rating-3) * 0.1 * decay` | Mean-reversion: `D' = w7*D₀(G) + (1-w7)*(D - w6*(G-3))` |
| Rating modifier | Multiplicative outside main formula | Additive inside formula |

Both formulas satisfy `R(S) = 0.9` (the definition of stability), but they diverge significantly at other time points:

| t (multiples of S) | Implementation R | FSRS Spec R | Difference |
|-----|------|------|------|
| 0.5S | 0.947 | 0.900 | +0.047 |
| 1S | 0.900 | 0.810 | +0.090 |
| 2S | 0.818 | 0.656 | +0.162 |
| 5S | 0.643 | 0.381 | +0.262 |

The implementation decays **much more slowly** than the FSRS spec, meaning it's more "optimistic" about retention at longer intervals. This leads to longer review intervals than standard FSRS would recommend.

**Assessment:** Self-consistent and functional. The departure from spec is a design choice (simplicity over conformance), not a bug. Worth documenting for anyone expecting FSRS-compatible behavior.

### 2. FSRS stuck state analysis

**Scenario:** Repeated rating=1 (Again)

When a learner fails repeatedly, stability resets to `initialStability[0] = 0.4` each time. Difficulty increases toward the 0.9 cap. With R=0.9, the interval is:
```
interval = 0.4 * 9 * (1/0.9 - 1) = 0.4 days ≈ 9.6 hours
```

The minimum stability clamp is 0.1 (line 275), giving a theoretical floor interval of ~2.4 hours. In practice, the stability never drops below 0.4 because rating=1 always resets to `initialStability[0]` rather than using `updateStability()`.

**Assessment:** Not a stuck state. The 9.6-hour floor interval is reasonable — frequent enough to help the learner without being oppressive. The session planner's error-focus priority will also surface these skills for additional practice.

### 3. BKT update equations are correct (Corbett & Anderson 1995)

The Bayesian posterior updates follow the canonical formulation exactly:

**Correct response:**
```
P(mastery|correct) = (1-pSlip) * P(mastery) / P(correct)
where P(correct) = (1-pSlip)*P(mastery) + pGuess*(1-P(mastery))
```

**Incorrect response:**
```
P(mastery|incorrect) = pSlip * P(mastery) / P(incorrect)
where P(incorrect) = pSlip*P(mastery) + (1-pGuess)*(1-P(mastery))
```

**Learning transition** (applied after both):
```
P(final) = P(posterior) + (1-P(posterior)) * pLearn
```

This is the standard BKT formulation. The learning transition is correctly applied AFTER the Bayesian update. **Mastery is NOT monotonic** — incorrect answers significantly decrease pMastery (see numerical analysis below). The learning transition provides an upward floor (~0.11 equilibrium for repeated incorrect answers), preventing mastery from reaching exactly zero.

**Parameter validation:** The constraint `pSlip + pGuess < 1` (line 82) correctly enforces model identifiability. The epsilon guard (line 168) prevents division by zero in degenerate edge cases.

### 4. Default BKT parameters are within literature norms

| Parameter | Default | Literature Range | Assessment |
|-----------|---------|------------------|------------|
| pInit | 0.3 | 0.1-0.5 | Reasonable |
| pLearn | 0.1 | 0.05-0.4 | On the faster end |
| pSlip | 0.1 | 0.05-0.25 | Reasonable |
| pGuess | 0.2 | 0.1-0.3 | Reasonable |

### 5. Session planner is well-designed, no infinite loops

**File:** `SessionPlannerImpl.ts`

The 5-tier priority system (due reviews -> transfer tests -> error focus -> new skills -> consolidation) is sound. The `planSession` loop uses a `plannedSkills` set to avoid re-selecting the same skill, and breaks on `'rest'` action, preventing infinite loops. Each iteration either adds a new skill to `plannedSkills` or exits the loop.

**Edge case: All skills mastered + transfer tests disabled:**
- Due reviews: none (nothing due)
- Transfer tests: skipped (disabled)
- Error focus: none (no relearning states)
- New skills: none (all mastered)
- Consolidation: none (all above 0.85 threshold, so `pMastery < masteryThreshold` is false)
- Result: returns `'rest'` — **correct behavior**

**Edge case: Prerequisites in relearning state:**
The learner gets practice on the failed prerequisite via error-focus (priority 3). The dependent skill won't be introduced as new (priority 4) because its prerequisite has high BKT mastery. This is the BKT/FSRS divergence described in Warning #4.

**Diamond dependencies in leverage calculation:** `getDependents()` uses a visited set, so diamond patterns (A->B, A->C, B->D, C->D) don't cause double-counting. Leverage correctly reflects total transitive dependents.

### 6. SkillGraph algorithms are correct

**File:** `SkillGraphImpl.ts`

**Cycle detection (3-color DFS):** Correct. The DFS traverses prerequisites (backward edges). When a GRAY node is re-encountered, a back edge (cycle) is detected. All nodes on the cycle path are correctly identified. The DFS function does NOT return early on cycle detection — it continues to process remaining edges and properly sets all nodes to BLACK. No GRAY nodes are left behind after DFS completes.

**Topological sort (Kahn's algorithm):** Correct standard implementation with level-based BFS. Each level is sorted alphabetically for determinism. Note: does not detect cycles — returns a partial ordering if cycles exist. The caller should call `validate()` first.

**`removeSkill()`:** Correctly deletes the skill AND cleans up dangling prerequisite references in all remaining skills (lines 43-49).

**`getAllPrerequisites()`:** Uses a `visited` Set to prevent re-visiting nodes. **Cannot produce duplicates.** Diamond dependencies are handled correctly — each prerequisite appears exactly once in the result.

### 7. Diagnostic engine prerequisite propagation is correct

**File:** `DiagnosticEngineImpl.ts:269-305`

Propagation in reverse topological order (dependents before prerequisites) is correct. The logic: if a learner masters skill C, then prerequisites of C should be boosted (the learner must know them). Processing in reverse order ensures that when a node is boosted above threshold by a dependent, it can then boost its own prerequisites in the same pass.

`getAllPrerequisites()` returns all transitive prerequisites, so direct boosting handles deep chains correctly even without iterative propagation.

### 8. Diagnostic difficulty adjustment handles boundary correctly

**File:** `DiagnosticEngineImpl.ts:199-208`

```
estimate = accuracy + (avgDifficulty - 0.5) * difficultyWeight
```

With `difficultyWeight = 0.3`:
- **Maximum before clamp:** accuracy=1.0, avgDifficulty=1.0 -> estimate = 1.15
- **Minimum before clamp:** accuracy=0.0, avgDifficulty=0.0 -> estimate = -0.15

The clamp `Math.max(0.05, Math.min(0.95, estimate))` correctly prevents out-of-range values. The asymmetric clamp to [0.05, 0.95] rather than [0, 1] is a good design choice — it prevents the diagnostic from declaring absolute certainty about any skill.

### 9. Secondary skill weight of 0.5x is defensible

**File:** `DiagnosticEngineImpl.ts:179-186`

The 0.5 weight is applied uniformly to both `itemsAttempted` and `itemsCorrect`, which preserves the accuracy ratio but reduces the effective sample size for secondary skills. With 2 items, a primary skill gets n=2.0 effective observations while a secondary skill gets n=1.0.

The value 0.5 is not empirically calibrated, but it's a reasonable heuristic — secondary skills are tested indirectly and deserve less weight. The alternative (full weight) would over-count evidence for secondary skills that happen to appear in many items.

---

## Appendix: Numerical Analysis

### BKT: Consecutive correct answers to mastery

Starting from `pInit=0.3`, `pSlip=0.1`, `pGuess=0.2`, `pLearn=0.1`:

```
Step 1 (correct):
  P(correct) = 0.9*0.3 + 0.2*0.7 = 0.41
  Posterior = 0.9*0.3 / 0.41 = 0.6585
  After learn = 0.6585 + 0.3415*0.1 = 0.6927

Step 2 (correct):
  P(correct) = 0.9*0.6927 + 0.2*0.3073 = 0.6849
  Posterior = 0.9*0.6927 / 0.6849 = 0.9102
  After learn = 0.9102 + 0.0898*0.1 = 0.9192  -> ABOVE 0.85
```

**Result: 2 consecutive correct answers reach mastery.**

### BKT: Consecutive incorrect answers from mastery

Starting from `pMastery=0.85`:

```
Step 1 (incorrect):
  P(incorrect) = 0.1*0.85 + 0.8*0.15 = 0.205
  Posterior = 0.1*0.85 / 0.205 = 0.4146
  After learn = 0.4146 + 0.5854*0.1 = 0.4732

Step 2 (incorrect):
  P(incorrect) = 0.1*0.4732 + 0.8*0.5268 = 0.4688
  Posterior = 0.1*0.4732 / 0.4688 = 0.1009
  After learn = 0.1009 + 0.8991*0.1 = 0.1908  -> BELOW 0.3
```

**Result: 2 consecutive incorrect answers drop from mastery to below 0.3.**

### BKT: Equilibrium under repeated incorrect answers

With repeated incorrect answers, pMastery converges to an equilibrium near **0.11**. At this point, the Bayesian downward pull from incorrect evidence is balanced by the upward pull from `pLearn`. The learning transition prevents pMastery from ever reaching exactly 0.

### FSRS: Interval calculations

| Stability | Requested Retention | Interval (days) |
|-----------|-------------------|-----------------|
| 0.4 (Again) | 0.9 | 0.4 (~10 hours) |
| 0.9 (Hard) | 0.9 | 0.9 (~22 hours) |
| 2.3 (Good) | 0.9 | 2.3 days |
| 5.7 (Easy) | 0.9 | 5.7 days |
| 0.1 (minimum) | 0.9 | 0.1 (~2.4 hours) |

Formula: `interval = S * 9 * (1/R - 1)` -> at R=0.9: `interval = S * 1 = S`

### FSRS: Normal learning progression (repeated Good)

Starting from new card with Good rating:

| Review # | Stability | Interval (days) |
|----------|-----------|-----------------|
| 1 (new) | 2.30 | 2.3 |
| 2 | 2.59 | 2.6 |
| 3 | 2.91 | 2.9 |
| 4 | 3.25 | 3.3 |
| 5 | 3.63 | 3.6 |
| 6 | 4.05 | 4.0 |
| 7 | 4.50 | 4.5 |
| 8 | 5.00 | 5.0 |
| 9 | 5.53 | 5.5 |

Stability grows by ~12% per successful review, which is a reasonable progression rate.

### FSRS: Retention decay comparison with spec

| t (days) | S (days) | Implementation R | FSRS v4 Spec R | Delta |
|----------|----------|-----------------|----------------|-------|
| 10 | 5 | 0.818 | 0.463 | +0.355 |
| 10 | 10 | 0.900 | 0.656 | +0.244 |
| 30 | 10 | 0.750 | 0.345 | +0.405 |
| 1 | 1 | 0.900 | 0.656 | +0.244 |
| 7 | 2.3 | 0.747 | 0.340 | +0.407 |

The implementation is significantly more optimistic about retention at all time points except t=S. This means the implementation schedules longer intervals than standard FSRS would, potentially leading to more forgetting between reviews.
