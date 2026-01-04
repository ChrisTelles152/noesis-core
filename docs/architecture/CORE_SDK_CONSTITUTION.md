# Noesis Core SDK Constitution

**Version:** 1.0.0
**Status:** Canonical Definition
**Last Updated:** January 2026

---

## North Star

**Noesis is a capability engine for mastery-based learning that refuses to scale until the irreducible learning loop is proven via a falsifiable pilot.**

The Noesis North Star is: **durable, transferable human capability per unit time and cost.**

Noesis is defined by **learning outcomes** (time-to-mastery, retention, transfer), NOT by engagement, content volume, auth, or UI.

---

## What is the Core SDK?

The Core SDK is the **portable learning engine**, not a product app and not a backend platform.

### Core SDK Requirements

The Core SDK MUST:

1. **Be dependency-free** - No React, no Express, no database, no browser APIs, no LLM providers
2. **Be portable** - Run in any JavaScript/TypeScript environment
3. **Be deterministic** - All decisions reproducible from event log + config
4. **Be inspectable** - All internal state can be examined and logged

### The Irreducible Learning Loop

The Core SDK must support this 8-step loop:

1. **Explicit Skill Graph (DAG)**
   - Skills with prerequisites forming a directed acyclic graph
   - Cycle detection, topological ordering
   - Transfer test specifications per skill

2. **Diagnostic-First Entry**
   - Assess learner's initial state before instruction
   - Item-to-skill mapping for diagnostic items
   - Cold start learner model initialization

3. **Target Smallest Leverage Gap**
   - Identify the highest-impact skill to learn next
   - Consider prerequisites, mastery levels, and transfer tests

4. **Error-Focused Training**
   - Prioritize practice on errors, not successes
   - Error categorization and targeted remediation

5. **Mandatory Spaced Retrieval**
   - FSRS-style memory scheduling
   - Enforce retrieval practice at optimal intervals
   - No progression without retrieval compliance

6. **Transfer Stress Tests (Near + Far) with Gating**
   - Near transfer: Same skill, different context
   - Far transfer: Related skills, novel situations
   - Gate progression until transfer tests pass

7. **Update Learner Model**
   - BKT-class probability estimates (pMastery, pSlip, pGuess, pLearn)
   - Update probabilities based on practice evidence

8. **Repeat**

---

## Core SDK Interfaces

### Modules

| Module | Purpose | Status |
|--------|---------|--------|
| `graph/` | Skill graph DAG representation | Interface defined |
| `learner/` | BKT-style learner model | Interface defined |
| `memory/` | FSRS spaced repetition | Interface defined |
| `planning/` | Session planning, gap targeting | Interface defined |
| `transfer/` | Transfer test gating | Interface defined |
| `events/` | Canonical event schema | Implemented |

### Key Interfaces

```typescript
// Skill Graph
interface SkillGraph {
  skills: Map<string, Skill>;
  validate(): SkillGraphValidationResult;
  getTopologicalOrder(): string[];
  getAllPrerequisites(skillId: string): string[];
}

// Learner Model
interface LearnerModelEngine {
  createModel(learnerId: string, graph: SkillGraph): LearnerModel;
  updateModel(model: LearnerModel, event: PracticeEvent): LearnerModel;
  getPMastery(model: LearnerModel, skillId: string): number;
}

// Memory Scheduler
interface MemoryScheduler {
  createState(skillId: string): MemoryState;
  scheduleReview(state: MemoryState, recalled: boolean, rating: 1|2|3|4): MemoryState;
  getDueSkills(states: MemoryState[], atTime: number): MemoryState[];
}

// Session Planner
interface SessionPlanner {
  getNextAction(model: LearnerModel, graph: SkillGraph, memory: MemoryState[], config: SessionConfig): SessionAction;
}

// Transfer Gate
interface TransferGate {
  isSkillUnlocked(skillId: string, results: TransferTestResult[], tests: TransferTest[]): boolean;
}
```

---

## What Core Does NOT Include

These concerns belong in **adapters** or **apps**, NOT core:

| Concern | Why Not Core | Where It Goes |
|---------|--------------|---------------|
| Auth/Accounts/Sessions | Product infrastructure | `apps/server` |
| Express/HTTP routes | Platform-specific | `apps/server` |
| DB/ORM (Drizzle, PostgreSQL) | Storage infrastructure | `apps/server` |
| React/UI components | Presentation layer | `apps/web-demo` |
| Attention tracking | Browser APIs, WebGazer | `@noesis/adapters-attention-web` |
| LLM integration (OpenAI, Anthropic) | External API dependency | `@noesis/adapters-llm` |
| WebSocket/real-time | Network infrastructure | `apps/server` |

### Adapters (Optional Modules)

Adapters provide integration points WITHOUT contaminating core:

- **Attention Adapter** (`@noesis/adapters-attention-web`)
  - Provides optional attention data as input to session planning
  - NOT required for core learning loop

- **LLM Adapter** (`@noesis/adapters-llm`)
  - Provides optional AI-powered recommendations
  - NOT required for core learning loop

---

## Implementation Priorities

### Phase 1: Core Foundation
1. SkillGraph implementation with cycle detection
2. LearnerModelEngine with BKT algorithm
3. MemoryScheduler with FSRS algorithm
4. Event schema finalization

### Phase 2: Planning & Gating
5. SessionPlanner with deterministic policy
6. TransferGate implementation
7. DiagnosticEngine for cold start

### Phase 3: Integration
8. NoesisCoreEngine as unified interface
9. Replay/debug tooling
10. Comprehensive test suite

---

## Testing Requirements

Each Core component must have:

1. **Unit tests** - Test individual functions/methods
2. **Determinism tests** - Same input → same output
3. **Replay tests** - Reproduce decisions from event log
4. **Property tests** - Invariants hold across inputs

---

## Governance

Changes to this Constitution require:

1. Justification against the North Star
2. Review of impact on irreducible loop
3. Verification that Core remains dependency-free
4. Documentation of any interface changes

---

*This document defines what Noesis Core SDK is and is not. All implementation decisions should be evaluated against this Constitution.*
