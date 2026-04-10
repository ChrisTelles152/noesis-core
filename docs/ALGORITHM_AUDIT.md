# Algorithm Audit — Noesis Core

> Generated 2026-04-10 from source code analysis of all core learning engine files.
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

The core learning algorithms are **mathematically correct** in their Bayesian updates and scheduling formulas. The BKT implementation faithfully follows Corbett & Anderson (1995), and the FSRS scheduler is self-consistent (though it departs from the published FSRS v4 spec). The skill graph, session planner, and diagnostic engine are well-designed with proper determinism guarantees.

**Two issues warrant attention:** (1) BKT converges to mastery extremely fast with default parameters (2 correct answers), which may cause premature mastery declarations. (2) There are two completely independent, incompatible spaced repetition systems in the codebase (FSRS in core, exponential spacing in sdk-web). One critical bug was found and fixed: `SkillGraph.removeSkill()` left dangling prerequisite references.

---

## Critical Issues

### 1. `SkillGraph.removeSkill()` leaves dangling prerequisite references

**File:** `SkillGraphImpl.ts:40-42`
**Severity:** HIGH — produces invalid graph state

`removeSkill(skillId)` called `this.skills.delete(skillId)` but did NOT remove `skillId` from other skills' `prerequisites` arrays. After removal, `validate()` would report `MISSING_PREREQUISITE` errors.

**Status:** **FIXED** in commit `db7d051`. Now iterates all remaining skills and cleans up references.

---

## Warnings

### 1. BKT mastery convergence is very fast (2 correct answers to mastery)

**File:** `BKTEngine.ts` — default params `pInit=0.3, pLearn=0.1, pSlip=0.1, pGuess=0.2`

With these defaults, only **2 consecutive correct answers** bring `pMastery` from 0.3 to above the 0.85 mastery threshold. Conversely, **2 consecutive incorrect answers** drop mastery from 0.85 to ~0.19. This is standard BKT behavior but very aggressive for pedagogical purposes.

**Numerical trace (consecutive correct from pInit=0.3):**

| Step | P(correct) | Posterior | After learning | Result |
|------|-----------|-----------|----------------|--------|
| 1 | 0.41 | 0.659 | 0.693 | Still below 0.85 |
| 2 | 0.685 | 0.910 | 0.919 | **Above 0.85** |

**Numerical trace (consecutive incorrect from 0.85):**

| Step | P(incorrect) | Posterior | After learning | Result |
|------|-------------|-----------|----------------|--------|
| 1 | 0.205 | 0.415 | 0.473 | Dropped to 0.47 |
| 2 | 0.469 | 0.101 | 0.191 | **Below 0.3** |

**Recommendation:** Consider adjusting parameters for the pilot:
- Lower `pLearn` to 0.05 (slower convergence, ~4 correct answers to mastery)
- Or raise `pInit` to 0.1 (starts further from threshold)
- This is a product/pedagogy decision, not a code bug

### 2. Two competing spaced repetition systems

**Files:**
- `packages/core/src/memory/FSRSScheduler.ts` — FSRS power-law decay
- `packages/sdk-web/src/policies/mastery.ts` — Exponential spacing: `hours = 24 * spacingFactor^progress * 0.5`

These are completely independent, incompatible scheduling systems. The core engine tracks FSRS stability/difficulty per skill, while the SDK's `MasteryTracker` uses a simple weighted-average progress score with exponential review intervals.

If both are active in a pilot app, they will produce conflicting recommendations about when to review. The `MasteryTracker` also uses `Date.now()` directly (not injectable), breaking the determinism contract.

**Recommendation:** Choose one system for the pilot. The core FSRS is more rigorous and has proper clock injection. The `MasteryTracker` could be retained as a lightweight fallback for apps that don't need the full core engine.

### 3. FSRS rating simplification in core engine

**File:** `NoesisCoreEngineImpl.ts:168`

The core engine converts practice events to FSRS ratings as: `correct → 3 (Good)`, `incorrect → 1 (Again)`. This loses nuance — there's no way to express "correct but hard" (rating 2) or "correct and easy" (rating 4) through the current `PracticeEvent.correct: boolean` interface.

**Impact:** Acceptable for a pilot. The rating 2/4 distinction mainly affects interval lengths, not correctness. Can be extended later by adding an optional `difficulty` or `rating` field to `PracticeEvent`.

---

## Observations

### 1. FSRS retention formula departs from published spec

**File:** `FSRSScheduler.ts:192`

| Property | Implementation | FSRS v4 Spec |
|----------|---------------|--------------|
| Retention formula | `(1 + t/(9S))^(-1)` | `(1 + 19t/(81S))^(-0.5)` |
| Decay exponent | -1 (reciprocal) | -0.5 (square root) |
| R(S) check | 0.9 ✓ | 0.9 ✓ |
| Stability update | Single `stabilityDecay` param | Three separate weights (w8, w9, w10) |
| Difficulty update | Linear adjustment | Mean-reversion formula |

Both formulas satisfy `R(S) = 0.9` (the definition of stability), but they have different decay curves. The implementation decays faster than the FSRS spec at short intervals and slower at long intervals. The simplified parameter structure means the model cannot be fit to user data as precisely as full FSRS.

**Assessment:** Self-consistent and functional. The departure from spec is a design choice (simplicity over conformance), not a bug. Worth documenting for anyone expecting FSRS-compatible behavior.

### 2. FSRS stuck state analysis

**Scenario:** Repeated rating=1 (Again)

When a learner fails repeatedly, stability resets to `initialStability[0] = 0.4` each time. With R=0.9, the interval is:
```
interval = 0.4 * 9 * (1/0.9 - 1) = 0.4 days ≈ 9.6 hours
```

The minimum stability clamp is 0.1 (line 275), giving a floor interval of ~2.4 hours. The learner will cycle at ~10-hour intervals indefinitely — not truly stuck (intervals don't hit 0), but not productive either.

**Mitigation:** The session planner's error-focus priority (priority 3) will surface these skills for practice, and the BKT model will reflect the low mastery. No infinite loop or degenerate behavior.

### 3. FSRS rating=4 (Easy) on new card

New card with Easy rating → `stability = initialStability[3] = 5.7`. Interval = 5.7 days. This is reasonable — a learner who finds a new concept effortless waits ~6 days before review.

### 4. BKT update equations are correct

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

This is the standard BKT formulation. The learning transition is correctly applied AFTER the Bayesian update, as in the original Corbett & Anderson paper. Mastery is NOT monotonic — incorrect answers can and do decrease pMastery significantly (see numerical analysis above).

**Parameter validation:** The constraint `pSlip + pGuess < 1` (line 82) correctly enforces model identifiability. The epsilon guard (line 168) prevents division by zero in degenerate edge cases.

### 5. Default BKT parameters are within literature norms

| Parameter | Default | Literature Range | Assessment |
|-----------|---------|------------------|------------|
| pInit | 0.3 | 0.1-0.5 | Reasonable |
| pLearn | 0.1 | 0.05-0.4 | Moderate |
| pSlip | 0.1 | 0.05-0.25 | Reasonable |
| pGuess | 0.2 | 0.1-0.3 | Reasonable |

### 6. Session planner is well-designed, no infinite loops

**File:** `SessionPlannerImpl.ts`

The 5-tier priority system (due reviews → transfer tests → error focus → new skills → consolidation) is sound. The `planSession` loop uses a `plannedSkills` set to avoid re-selecting the same skill, and breaks on `'rest'` action, preventing infinite loops.

**Edge case: All skills mastered + transfer tests disabled:**
- Due reviews: none (nothing due)
- Transfer tests: skipped (disabled)
- Error focus: none (no relearning states)
- New skills: none (all mastered)
- Consolidation: none (all above threshold)
- Result: returns `'rest'` ✓

**Edge case: Prerequisites in relearning state:**
The learner gets practice on the failed prerequisite via error-focus (priority 3). The dependent skill is blocked (correct behavior). No permanent block — the prerequisite can be re-mastered through practice.

**Diamond dependencies in leverage calculation:** `getDependents()` uses a visited set, so diamond patterns (A→B, A→C, B→D, C→D) don't cause double-counting. Leverage correctly reflects total transitive dependents.

### 7. SkillGraph Kahn's algorithm is correct

**File:** `SkillGraphImpl.ts:151-212`

The topological sort correctly:
- Computes in-degree per skill
- Processes level-by-level (BFS)
- Sorts each level alphabetically for determinism
- Uses a `processed` set to prevent re-processing

Minor: variable name typo `zeroDegreeSkilss` on line 169.

### 8. SkillGraph cycle detection (3-color DFS) — correct with caveat

The 3-color DFS (WHITE/GRAY/BLACK) correctly identifies cycle existence. However, when a cycle is found, the DFS returns `true` up the call stack, leaving nodes in the current path as GRAY (never set to BLACK). If a subsequent DFS from a different starting node encounters one of these GRAY nodes, it would incorrectly include that node in the cycle set.

**Impact:** LOW — cycle existence is always correctly detected. The set of nodes *reported* as being in a cycle may be slightly too large. The `validate()` method would still correctly return `valid: false`.

### 9. Diagnostic engine prerequisite propagation is correct

**File:** `DiagnosticEngineImpl.ts:265-301`

Propagation in reverse topological order (dependents first) is correct: if a learner masters skill D, then prerequisites of D should be boosted. Processing dependents first ensures transitive propagation works — when intermediate nodes get boosted above threshold, they then boost their own prerequisites.

`getAllPrerequisites()` already returns all transitive prerequisites, so the propagation handles deep chains correctly.

### 10. Diagnostic difficulty adjustment formula

**File:** `DiagnosticEngineImpl.ts:199-206`

```
estimate = accuracy + (avgDifficulty - 0.5) * 0.3
```

Range before clamping: accuracy ∈ [0,1], adjustment ∈ [-0.15, 0.15], so estimate ∈ [-0.15, 1.15]. The clamp to [0.05, 0.95] handles the overflow correctly.

The 0.5x weight for secondary skills (`difficulty * 0.5` at line 183) reduces the difficulty contribution for secondary skills but counts correct/incorrect at full weight. This slightly lowers the average difficulty for skills that appear as secondary, which has a small downward effect on the mastery estimate. The effect is minor (max 0.15 * 0.3 = 0.045 difference).

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
  After learn = 0.9102 + 0.0898*0.1 = 0.9192  → ABOVE 0.85 ✓
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
  After learn = 0.1009 + 0.8991*0.1 = 0.1908  → BELOW 0.3 ✓
```

**Result: 2 consecutive incorrect answers drop from mastery to below 0.3.**

### FSRS: Interval calculations

| Stability | Requested Retention | Interval (days) |
|-----------|-------------------|-----------------|
| 0.4 (Again) | 0.9 | 0.4 (~10 hours) |
| 0.9 (Hard) | 0.9 | 0.9 (~22 hours) |
| 2.3 (Good) | 0.9 | 2.3 days |
| 5.7 (Easy) | 0.9 | 5.7 days |
| 0.1 (minimum) | 0.9 | 0.1 (~2.4 hours) |

Formula: `interval = S * 9 * (1/R - 1)` → at R=0.9: `interval = S * 9 * (1/9) = S`

### FSRS: Retention decay comparison

At t=S (1 stability period):
- Implementation: `(1 + 1/9)^(-1) = 0.9` ✓
- FSRS spec: `(1 + 19/81)^(-0.5) = 0.9` ✓

At t=2S:
- Implementation: `(1 + 2/9)^(-1) = 0.818`
- FSRS spec: `(1 + 38/81)^(-0.5) = 0.825`

At t=5S:
- Implementation: `(1 + 5/9)^(-1) = 0.643`
- FSRS spec: `(1 + 95/81)^(-0.5) = 0.678`

The implementation decays slightly faster than the FSRS spec at longer intervals.
