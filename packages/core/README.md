# @noesis-edu/core

**Noesis Core SDK** - A portable, dependency-free learning engine for mastery-based education.

## Status

✅ **v0.1.0 Complete** - All core modules implemented and tested.

## Features

- **Skill Graph**: DAG-based skill representation with validation, cycle detection, and topological ordering
- **Bayesian Knowledge Tracing (BKT)**: Research-backed learner modeling with inspectable probability estimates
- **FSRS Memory Scheduling**: Modern spaced repetition scheduling for optimal retention
- **Diagnostic Assessment**: Cold-start placement through adaptive diagnostic testing
- **Transfer Testing**: Near/far transfer test gating for verified skill mastery
- **Session Planning**: Deterministic action planning with configurable policies
- **Event Replay**: Full determinism for reproducible learning decisions

## Installation

```bash
npm install @noesis-edu/core
```

## Quick Start

```typescript
import {
  createSkillGraph,
  createNoesisCoreEngine,
  type Skill,
  type PracticeEvent,
} from '@noesis-edu/core';

// 1. Define your skill graph
const skills: Skill[] = [
  { id: 'arithmetic', name: 'Basic Arithmetic', prerequisites: [] },
  { id: 'algebra', name: 'Algebra', prerequisites: ['arithmetic'] },
  { id: 'calculus', name: 'Calculus', prerequisites: ['algebra'] },
];

const graph = createSkillGraph(skills);

// Validate the graph
const validation = graph.validate();
if (!validation.valid) {
  console.error('Invalid skill graph:', validation.errors);
}

// 2. Create the core engine
const engine = createNoesisCoreEngine(graph);

// 3. Process learning events
const event: PracticeEvent = {
  id: 'evt-1',
  type: 'practice',
  learnerId: 'learner-1',
  sessionId: 'session-1',
  timestamp: Date.now(),
  skillId: 'arithmetic',
  itemId: 'item-1',
  correct: true,
  responseTimeMs: 5000,
};

engine.processEvent(event);

// 4. Get recommendations (using default config)
import { DEFAULT_SESSION_CONFIG } from '@noesis-edu/core';

const nextAction = engine.getNextAction('learner-1', DEFAULT_SESSION_CONFIG);

console.log('Next action:', nextAction);
// { type: 'practice', skillId: 'arithmetic', reason: '...', priority: 40 }

// 5. Check progress
const progress = engine.getLearnerProgress('learner-1');
console.log('Progress:', progress);
// { totalSkills: 3, masteredSkills: 0, learningSkills: 1, ... }
```

## Session Configuration

The SDK provides `DEFAULT_SESSION_CONFIG` with sensible defaults:

```typescript
import { DEFAULT_SESSION_CONFIG } from '@noesis-edu/core';

// Default values:
// {
//   maxDurationMinutes: 30,
//   targetItems: 20,
//   masteryThreshold: 0.85,
//   enforceSpacedRetrieval: true,
//   requireTransferTests: true,
// }

// Use directly
const action = engine.getNextAction(learnerId, DEFAULT_SESSION_CONFIG);

// Or customize
const customConfig = {
  ...DEFAULT_SESSION_CONFIG,
  targetItems: 10,
  masteryThreshold: 0.9,
};
const action = engine.getNextAction(learnerId, customConfig);
```

## Core Concepts

### The Irreducible Learning Loop

The SDK implements a research-backed learning loop:

1. **Explicit Skill Graph (DAG)** - Skills with prerequisites and dependencies
2. **Diagnostic-First Entry** - Assess learner's starting state
3. **Smallest Leverage Gap** - Target highest-impact skill to learn next
4. **Error-Focused Training** - Prioritize practice on errors
5. **Mandatory Spaced Retrieval** - Enforce retrieval at optimal intervals
6. **Transfer Tests with Gating** - Verify near/far transfer before progression
7. **Learner Model Update** - Adjust probability estimates based on evidence
8. **Repeat**

### Determinism & Replay

All operations are deterministic - same inputs produce same outputs:

```typescript
import { createDeterministicEngine } from '@noesis-edu/core';

// Create engine with deterministic clock and ID generator
const engine = createDeterministicEngine(graph, {}, startTime);

// Replay events to reproduce exact state
engine.replayEvents(eventLog);
```

## Modules

| Module | Purpose | Status |
|--------|---------|--------|
| `graph/` | Skill graph (DAG) representation | ✅ Implemented |
| `learner/` | BKT-style learner modeling | ✅ Implemented |
| `memory/` | FSRS spaced repetition scheduling | ✅ Implemented |
| `diagnostic/` | Cold-start diagnostic assessment | ✅ Implemented |
| `transfer/` | Near/far transfer test gating | ✅ Implemented |
| `planning/` | Session planning with gap targeting | ✅ Implemented |
| `engine/` | Unified engine with replay support | ✅ Implemented |
| `events/` | Canonical event schema + factories | ✅ Implemented |

## API Reference

### Skill Graph

```typescript
import { createSkillGraph } from '@noesis-edu/core';

const graph = createSkillGraph(skills);

// Validation
const result = graph.validate(); // { valid: boolean, errors: [] }

// Traversal
const order = graph.getTopologicalOrder(); // ['arithmetic', 'algebra', ...]
const prereqs = graph.getAllPrerequisites('calculus'); // ['arithmetic', 'algebra']
const deps = graph.getDependents('arithmetic'); // ['algebra', 'calculus']
```

### BKT Learner Model

```typescript
import { createBKTEngine, DEFAULT_BKT_PARAMS } from '@noesis-edu/core';

const bkt = createBKTEngine({
  pInit: 0.3,   // Initial mastery probability
  pLearn: 0.1, // Learning rate
  pSlip: 0.1,  // Slip probability
  pGuess: 0.2, // Guess probability
});

const model = bkt.createModel('learner-1', graph);
const updated = bkt.updateModel(model, practiceEvent);
const mastery = bkt.getPMastery(updated, 'arithmetic'); // 0.69...
```

### FSRS Memory Scheduler

```typescript
import { createFSRSScheduler, calculateRetention } from '@noesis-edu/core';

const scheduler = createFSRSScheduler({
  requestedRetention: 0.9, // Target 90% retention
  maxInterval: 365,        // Max 1 year between reviews
});

const state = scheduler.createState('skill-1');
const updated = scheduler.scheduleReview(state, true, 3); // Good rating

// Get due skills
const due = scheduler.getDueSkills(allStates, Date.now());

// Calculate retention
const retention = calculateRetention(stability, elapsedDays);
```

### Diagnostic Engine

```typescript
import { createDiagnosticEngine } from '@noesis-edu/core';

const diagnostic = createDiagnosticEngine({
  minItemsPerSkill: 2,
  maxItemsPerSkill: 5,
  masteryThreshold: 0.7,
});

// Generate diagnostic test
const items = diagnostic.generateDiagnostic(graph, itemMappings, 20);

// Analyze results
const estimates = diagnostic.analyzeResults(graph, itemMappings, responses);
```

### Transfer Gate

```typescript
import { createTransferGate } from '@noesis-edu/core';

const gate = createTransferGate({
  requireNearTransfer: true,
  requireFarTransfer: false,
});

const isUnlocked = gate.isSkillUnlocked('algebra', testResults, tests);
const pending = gate.getPendingTests('algebra', testResults, tests);
```

### Session Planner

```typescript
import { createSessionPlanner, DEFAULT_SESSION_CONFIG } from '@noesis-edu/core';

const planner = createSessionPlanner();

// Get next action
const action = planner.getNextAction(model, graph, memoryStates, config);

// Plan full session
const session = planner.planSession(model, graph, memoryStates, {
  targetItems: 20,
  masteryThreshold: 0.85,
  enforceSpacedRetrieval: true,
});
```

### Event Factories

```typescript
import {
  createEventFactoryContext,
  createPracticeEvent,
  createDiagnosticEvent,
} from '@noesis-edu/core';

const ctx = createEventFactoryContext(
  () => Date.now(),    // clock
  () => crypto.randomUUID() // idGenerator
);

const event = createPracticeEvent(
  ctx, 'learner-1', 'session-1', 'skill-1', 'item-1',
  true, 5000
);
```

## Design Principles

- **No external dependencies** - Pure TypeScript, runs anywhere
- **Deterministic** - All decisions can be replayed from events
- **Inspectable** - All internal state can be examined
- **Research-based** - Implements BKT and FSRS algorithms

## Determinism Guarantee

The core engine is **fully deterministic**: given the same inputs, it produces the same outputs every time. This enables:

- **Replay**: Reproduce any past learning session by replaying events
- **Testing**: Write predictable unit tests with known outcomes
- **Debugging**: Compare engine states between runs

### How It Works

All non-deterministic sources (timestamps, IDs) are **injected** rather than called directly:

```typescript
// For deterministic operation (testing, replay):
const engine = createDeterministicEngine(graph, config, startTime);

// For production (uses Date.now() and UUID):
const engine = createNoesisCoreEngine(graph, config);
```

The defaults (`Date.now()`, `Math.random()`) are only used in factory functions and can always be overridden.

## Development

### Build

```bash
# From repo root
npm run build:core

# From packages/core
npm run build
```

### Test

```bash
# From repo root
npm run test:core

# From packages/core - smoke test
npm run smoke
```

### Smoke Test

The smoke test validates the public API works correctly:

```bash
npm run smoke:core
```

Expected output:
```
🔬 Running @noesis-edu/core smoke test (v0.1.0)

  ✓ Create a skill graph with 3 skills
  ✓ Create engine and learner model
  ✓ Process practice events and update model
  ✓ Get next action from session planner
  ✓ Deterministic replay produces identical results
  ✓ Export and import state for persistence

✅ All smoke tests passed! (6/6)
```

## What Core Does NOT Include

These belong in adapters or apps, not core:

- React/UI components → `@noesis/sdk-web`, `apps/web-demo`
- Express/HTTP routes → `apps/server`
- Database/ORM → `apps/server`
- Attention tracking → `@noesis/adapters-attention-web`
- LLM integration → `@noesis/adapters-llm`
- Browser APIs → Adapters

## Contributing

See the [Core SDK Constitution](./src/constitution.ts) for the canonical interface definitions.

## License

MIT
