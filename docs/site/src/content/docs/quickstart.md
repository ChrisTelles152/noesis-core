---
title: Quickstart
description: Install the core SDK, build a tiny graph, process a practice event.
---

## Install

```bash
npm install @noesis-edu/core
```

## Build an engine

```ts
import {
  createSystemEngine,
  createSkillGraph,
} from '@noesis-edu/core';

// Two skills: addition is a prereq for multiplication.
const graph = createSkillGraph([
  { id: 'addition',       name: 'Addition',       prerequisites: [] },
  { id: 'multiplication', name: 'Multiplication', prerequisites: ['addition'] },
]);

// `createSystemEngine` is the explicit opt-in to the system clock +
// crypto.randomUUID() — handy for one-off scripts and demos. Real
// products inject their own clock + idGenerator so events are
// replayable.
const engine = createSystemEngine(graph);
```

## Process a practice event

```ts
engine.processEvent({
  id: engine.generateEventId(),
  type: 'practice',
  learnerId: 'demo',
  sessionId: 'demo-session',
  timestamp: engine.getCurrentTime(),
  skillId: 'addition',
  itemId: 'add-001',
  correct: true,
  responseTimeMs: 1200,
});

const progress = engine.getLearnerProgress('demo');
// { totalSkills: 2, masteredSkills: 0, learningSkills: 1, ... }

const next = engine.getNextAction('demo', { /* SessionConfig */ });
// { type: 'practice', skillId: 'addition', ... }
```

## Replay an event log

```ts
import { createNoesisCoreEngine, createDeterministicIdGenerator } from '@noesis-edu/core';

const replayEngine = createNoesisCoreEngine(graph, {
  // Fixed clock + id generator make the replay byte-identical to the
  // original run.
  clock: () => 0,
  idGenerator: createDeterministicIdGenerator(),
});

for (const event of myPersistedEvents) {
  replayEngine.processEvent(event);
}
// replayEngine.exportState() === originalEngine.exportState()
```

That's the core contract. From there, look at the
[engine model](/core/engine/) and the
[determinism contract](/core/determinism/) for the deeper story.
