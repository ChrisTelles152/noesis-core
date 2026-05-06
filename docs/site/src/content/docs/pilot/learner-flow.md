---
title: Diagnostic + path + canonical loop
description: The three learner-facing screens that make up the Brazilian STEM pilot.
---

A first-time learner walks three screens, in order:

## 1. Diagnostic placement quiz — `/diagnostic`

Loads the pt-BR math content pack, runs the engine's `DiagnosticEngine`
to pick up to 10 items spread across the 25 skills in topological
order, walks the learner one item at a time. On completion, mastery
estimates are written to localStorage under
`noesis-diagnostic-estimates`. Skip records the response as
**incorrect** — better than swallowing the item.

## 2. Guided learning path — `/path`

The 25-skill DAG, grouped by category in topological order. Each skill
card shows one of four states:

- **available** — all prereqs mastered, ready to start
- **inProgress** — diagnostic showed partial signal
- **mastered** — estimate ≥ 0.7 (CTA flips from "Praticar" to "Revisar")
- **locked** — at least one prereq is below threshold; the card lists
  the missing prereqs by name so the next move is obvious

Gating math lives in `lib/pathStatus.ts`, which is testable without
React. A single off-by-one in the threshold check would ripple into
every locked card; the thin pure-function layer makes that easy to pin.

## 3. Per-skill canonical loop — `/skill/:id`

Walks the four canonical stages for the chosen skill. For each stage,
the picker prefers (in order):

1. The golden sequence for the skill, if one exists.
2. An item flagged `stage: <wanted>` primary-tagged to the skill.
3. The first item primary-tagged to the skill.
4. Nothing — render a "no item, continue" fallback.

Reflection is journaled to localStorage as
`noesis-reflection-<skillId>` so the learner can reread later. The
engine doesn't grade reflections.

After reflection, the learner is sent back to `/path`. Auto-advancing
to the next skill is a deliberate non-feature — the next move is
theirs.
