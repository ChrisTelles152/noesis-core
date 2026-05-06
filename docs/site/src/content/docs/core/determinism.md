---
title: Determinism contract
description: What "deterministic" means for Noesis, and why the engine refuses to construct without an injected clock.
---

The engine guarantees: **same event log + same clock + same idGenerator
+ same config → byte-identical state.**

This is the property that makes everything else trustworthy:

- Replay debugging works (rerun a learner's history, step through it).
- Server-side hydration works (rebuild an engine from persisted events,
  get the same state the in-process engine would have).
- A/B comparison works (run two variants of the planner against the
  same event log, diff the resulting actions).

## How it's enforced

Every engine constructor and factory **requires** a `clock: () => number`
and an `idGenerator: () => string`. Forget them and you get a runtime
throw — no silent `Date.now()` or `Math.random()` leak.

```ts
import { createNoesisCoreEngine } from '@noesis-edu/core';

// Throws — clock + idGenerator missing
createNoesisCoreEngine(graph, {});

// OK
createNoesisCoreEngine(graph, {
  clock: () => Date.now(),
  idGenerator: () => crypto.randomUUID(),
});
```

For one-off scripts and demos, `createSystemEngine(graph, config?)` is
the explicit opt-in to system clock + UUID4. The function name signals
what you're trading away: replayability.

## Replay

```ts
import {
  createNoesisCoreEngine,
  createDeterministicIdGenerator,
} from '@noesis-edu/core';

const replay = createNoesisCoreEngine(graph, {
  clock: () => 0,
  idGenerator: createDeterministicIdGenerator(),
});

for (const event of persistedEvents) replay.processEvent(event);

// replay.exportState() === originalEngine.exportState()
```

The CI gate `replay-determinism` runs a property-based suite that
generates random event sequences and asserts the original-engine
state and replay-engine state match. That gate runs separately so a
regression here surfaces unambiguously in the PR check list.

## What's NOT deterministic

- **WebGazer attention tracking.** Real gaze input is environment-
  dependent. The default is the simulated adapter (deterministic);
  WebGazer is opt-in via `VITE_ENABLE_REAL_GAZE_TRACKING=true`.
- **OpenAI orchestration.** External API; non-deterministic by design.
  Server falls back to a canned suggestion when no key is configured.
