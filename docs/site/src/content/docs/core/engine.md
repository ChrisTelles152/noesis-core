---
title: Engine model
description: How the Noesis core SDK is shaped — graph, learner model, scheduler, planner.
---

The core engine has five concerns, each isolated in its own module so
you can swap one without touching the others.

## SkillGraph

A DAG of skills. Each `Skill` carries an `id`, `name`, `prerequisites`,
optional `encompassedSkills` (the FIRe trickle-down idea — practising
"long division" gives implicit credit to "subtraction"), an optional
`category`, and an optional `difficulty` 0..1.

The graph validates on construction: cycles are rejected, missing
prerequisites are rejected, encompassing cycles are rejected.

## LearnerModelEngine (BKT)

Bayesian Knowledge Tracing — for every (learner, skill) pair we hold
`pMastery`, `pSlip`, `pGuess`, `pLearn`. Practice events update these
through the canonical BKT update equations. Two consecutive correct
answers with default parameters lift `pMastery` to about 0.85.

## MemoryScheduler (FSRS)

For each (learner, skill) we track an FSRS-shaped memory state with
stability, difficulty, and a due date. `scheduleReview()` returns the
next-due timestamp using `R(t) = (1 + t / (9 * S))^(-1)`. Per-skill
`learningSpeed` multipliers (clamped 0.5–2.0) let you slow or speed
the schedule for an individual learner.

## SessionPlanner

Given the learner model + memory states + a `SessionConfig`, returns
the next `SessionAction`. Priority is: due reviews → error-focused
practice → leverage gaps (highest-impact unmastered skill) → fresh
introductions. With `enforceCanonicalLoop` set, new skills always emit
`concept_introduction` first; `transfer_test` is gated on all four
canonical stages being recorded.

## DiagnosticEngine

Generates a placement quiz of N items spread across the skill graph in
topological order, then `analyzeResults(responses)` returns per-skill
mastery estimates with prerequisite-aware propagation: master a
quadratic-equations item, and the engine bumps your linear-equations
estimate too.

## Composition

`createNoesisCoreEngine(graph, options)` wires all five together and
implements `processEvent(event) → updates internal state`. Replay an
event log through a fresh engine with the same clock + idGenerator and
you get byte-identical state. That's the [determinism
contract](/core/determinism/).
