# @noesis/core

**Noesis Core SDK** - A portable, dependency-free learning engine for mastery-based education.

## Status

🚧 **Under Construction** - Interfaces defined, implementations pending.

## What is Noesis Core?

Noesis Core is the heart of the Noesis learning system. It implements the **Irreducible Learning Loop**:

1. **Explicit Skill Graph (DAG)** - Skills with prerequisites and dependencies
2. **Diagnostic-First Entry** - Assess learner's starting state
3. **Smallest Leverage Gap** - Target highest-impact skill to learn next
4. **Error-Focused Training** - Prioritize practice on errors
5. **Mandatory Spaced Retrieval** - Enforce retrieval at optimal intervals
6. **Transfer Tests with Gating** - Verify near/far transfer before progression
7. **Learner Model Update** - Adjust probability estimates based on evidence
8. **Repeat**

## Design Principles

- **No external dependencies** - Pure TypeScript, runs anywhere
- **Deterministic** - All decisions can be replayed from events
- **Inspectable** - All internal state can be examined
- **Research-based** - Implements BKT and FSRS algorithms

## Modules

| Module | Purpose | Status |
|--------|---------|--------|
| `graph/` | Skill graph (DAG) representation | 📋 Interface only |
| `learner/` | BKT-style learner modeling | 📋 Interface only |
| `memory/` | FSRS spaced repetition scheduling | 📋 Interface only |
| `planning/` | Session planning with gap targeting | 📋 Interface only |
| `transfer/` | Near/far transfer test gating | 📋 Interface only |
| `events/` | Canonical event schema | ✅ Types + helpers |

## What Core Does NOT Include

These belong in adapters or apps, not core:

- ❌ React/UI components → `@noesis/sdk-web`, `apps/web-demo`
- ❌ Express/HTTP routes → `apps/server`
- ❌ Database/ORM → `apps/server`
- ❌ Attention tracking → `@noesis/adapters-attention-web`
- ❌ LLM integration → `@noesis/adapters-llm`
- ❌ Browser APIs → Adapters

## Usage (Future)

```typescript
import { createNoesisCoreEngine } from '@noesis/core';

const engine = createNoesisCoreEngine({
  skillGraph: mySkillGraph,
  config: {
    masteryThreshold: 0.85,
    enforceSpacedRetrieval: true,
    requireTransferTests: true,
  },
});

// Get next recommended action
const action = engine.getNextAction('learner-123', sessionConfig);

// Process practice events
engine.processEvent(practiceEvent);
```

## Contributing

See the [Core SDK Constitution](./src/constitution.ts) for the canonical interface definitions and implementation priorities.
