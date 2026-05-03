---
title: Canonical 5-stage learning loop
description: concept_introduction → practice → application → reflection — codified in the engine.
---

The canonical loop is four learner-facing stages plus an out-of-band
spaced-review step that the memory scheduler emits when a review is
due. It's not a UI convention layered over a generic engine — the
stages are first-class types in the SDK.

## The stages

| Stage | What it is | When it fires |
|---|---|---|
| `concept_introduction` | Read or watch the explanation. No grading. | First time a learner touches a skill. |
| `practice` | A focused item targeting just this skill. Graded. | After concept_introduction lands. |
| `application` | An item that puts the skill into a less-obvious context. Graded. | After at least one successful practice. |
| `reflection` | Free-text "what did you learn." Not graded. | After application. |
| `review` (spaced) | A scheduled retrieval. Out-of-band. | When the FSRS scheduler says it's due. |

## In the SDK

```ts
type CanonicalStage =
  | 'concept_introduction'
  | 'practice'
  | 'application'
  | 'reflection';

// SessionAction.type is the union the planner returns:
type SessionAction = {
  type:
    | 'concept_introduction'
    | 'practice'
    | 'application'
    | 'reflection'
    | 'review'
    | 'transfer_test'
    | 'prerequisite_probe'
    | 'rest';
  // ...
};

// Practice events carry an optional stage so the engine knows which
// canonical step it represents:
type PracticeEvent = {
  type: 'practice';
  stage?: 'practice' | 'application'; // defaults to 'practice'
  // ...
};
```

## The opt-in flag

```ts
const config: SessionConfig = {
  // ...
  enforceCanonicalLoop: true,
};
```

With this on, the planner:

1. Emits `concept_introduction` the first time a learner sees a skill,
   even if their estimate suggests they're already partway there.
2. Won't emit `transfer_test` until all four canonical stages have
   been recorded for the skill.

Off by default so existing pilots aren't broken; on for any product
that wants the full pedagogical loop enforced.
