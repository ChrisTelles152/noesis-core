# Engineering Proof & Core Compatibility

**Version:** 1.0.0
**Status:** Canonical Definition
**Last Updated:** January 2026

---

## Purpose

This document defines the compatibility contract between `@noesis-edu/core` (the canonical learning engine) and any engineering proof system that validates learning outcomes. It ensures architectural alignment across repositories and prevents drift that would break proof verification.

---

## Core as Canonical Source

### Canonical Algorithms

The `@noesis-edu/core` package is the **single source of truth** for:

| Component | Algorithm | Location |
|-----------|-----------|----------|
| Learner Model | Bayesian Knowledge Tracing (BKT) | `packages/core/src/learner/` |
| Memory Scheduling | FSRS (Free Spaced Repetition Scheduler) | `packages/core/src/memory/` |
| Session Planning | Priority-based gap targeting | `packages/core/src/planning/` |
| Transfer Gating | Near/far transfer test requirements | `packages/core/src/transfer/` |
| Diagnostic | Cold-start assessment | `packages/core/src/diagnostic/` |

**Rule:** Apps and adapters MUST NOT implement competing algorithms. They MUST use core's implementations or delegate to core for learning decisions.

### Canonical Event Schema

All events processed by core follow the schema defined in `packages/core/src/events/`:

```typescript
// Base event structure - ALL events have these fields
interface BaseEvent {
  id: string;           // Unique event ID
  type: string;         // Event type discriminator
  learnerId: string;    // Learner identifier
  sessionId: string;    // Session identifier
  timestamp: number;    // Unix timestamp (ms)
}

// Canonical event types
type NoesisEvent =
  | SessionEvent      // session_start, session_end
  | PracticeEvent     // practice attempts
  | DiagnosticEvent   // diagnostic assessments
  | TransferTestEvent // transfer test results
```

---

## Extension Rules for Apps

Apps (e.g., `apps/web-demo`, `apps/server`) MAY extend events with additional metadata, but MUST follow these rules:

### 1. Extensions Must Be Exportable to Canonical Form

Any app-specific extensions MUST be strippable to produce a valid canonical `EventFile`:

```typescript
// App may store additional metadata
const appEvent = {
  ...canonicalEvent,
  _eng: {
    // Engineering metadata (attention, UI state, etc.)
    attentionScore: 0.85,
    uiInteractionMs: 150,
    deviceType: 'desktop',
  },
  _app: {
    // App-specific metadata
    renderTimestamp: 1706500000000,
    componentId: 'quiz-panel-1',
  },
};

// Must be exportable to canonical form for proof
const canonicalEvent = stripExtensions(appEvent);
// Result: valid BaseEvent with only canonical fields
```

### 2. Unknown Fields Must Be Tolerated

The proof system MUST tolerate unknown fields when replaying events:

```typescript
// Proof replay should ignore unknown fields
function replayForProof(events: NoesisEvent[]): ProofResult {
  for (const event of events) {
    // Process ONLY canonical fields
    // IGNORE: _eng, _app, _meta, or any other extensions
    const canonical = extractCanonicalFields(event);
    engine.processEvent(canonical);
  }
  return generateProof(engine.getState());
}
```

**Rule:** Proof verification MUST succeed if canonical fields are valid, regardless of extensions.

### 3. Extension Namespacing Convention

Apps SHOULD use underscore-prefixed namespaces for extensions:

| Namespace | Purpose | Example Fields |
|-----------|---------|----------------|
| `_eng` | Engineering/telemetry data | `attentionScore`, `responseLatencyMs`, `errorStack` |
| `_app` | App-specific UI/UX data | `componentId`, `renderTime`, `viewportSize` |
| `_meta` | Export/import metadata | `exportedAt`, `sourceVersion`, `schemaVersion` |
| `_debug` | Development/debugging | `stackTrace`, `rawInput`, `validationWarnings` |

---

## EventFile Format for Proof

The canonical export format for proof verification:

```typescript
interface EventFile {
  _meta: {
    version: string;        // Event schema version (e.g., "1.0.0")
    exportedAt: number;     // Export timestamp
    learnerId: string;      // Learner identifier
    sessionCount: number;   // Number of sessions in file
    eventCount: number;     // Total event count
  };
  events: NoesisEvent[];    // Canonical events only
}
```

### Export Requirements

When exporting for proof verification:

1. **Strip all extension fields** - Only canonical fields remain
2. **Preserve event order** - Events must be in timestamp order
3. **Include schema version** - `_meta.version` must match core's `EVENT_SCHEMA_VERSION`
4. **Validate before export** - All events must pass `validateEvent()`

---

## Minimum Events for Proof Replay

For a session to be proof-verifiable, it MUST contain at minimum:

| Event Type | Required | Purpose |
|------------|----------|---------|
| `session_start` | YES | Establishes session config and learner state |
| `practice` | YES (1+) | Records learning activity |
| `session_end` | YES | Closes session with summary |

### Optional but Valuable

| Event Type | When Needed |
|------------|-------------|
| `diagnostic` | Cold-start sessions (new learner) |
| `transfer_test` | Sessions with mastery gating |

### Example Minimal Valid Session

```json
{
  "_meta": {
    "version": "1.0.0",
    "exportedAt": 1706500000000,
    "learnerId": "learner-001",
    "sessionCount": 1,
    "eventCount": 3
  },
  "events": [
    {
      "id": "evt-0001",
      "type": "session_start",
      "learnerId": "learner-001",
      "sessionId": "session-001",
      "timestamp": 1706500000000,
      "config": {
        "maxDurationMinutes": 30,
        "targetItems": 20,
        "masteryThreshold": 0.85,
        "enforceSpacedRetrieval": true,
        "requireTransferTests": true
      }
    },
    {
      "id": "evt-0002",
      "type": "practice",
      "learnerId": "learner-001",
      "sessionId": "session-001",
      "timestamp": 1706500060000,
      "skillId": "arithmetic",
      "itemId": "item-001",
      "correct": true,
      "responseTimeMs": 5000
    },
    {
      "id": "evt-0003",
      "type": "session_end",
      "learnerId": "learner-001",
      "sessionId": "session-001",
      "timestamp": 1706500120000,
      "summary": {
        "durationMinutes": 2,
        "itemsAttempted": 1,
        "itemsCorrect": 1,
        "skillsPracticed": ["arithmetic"]
      }
    }
  ]
}
```

---

## Proof Verification Process

### 1. Import EventFile

```typescript
import { validateEventFile, importEvents } from '@noesis-edu/core';

const validation = validateEventFile(eventFile);
if (!validation.valid) {
  throw new Error(`Invalid EventFile: ${validation.errors.join(', ')}`);
}

const events = importEvents(eventFile);
```

### 2. Replay Through Core Engine

```typescript
import { createDeterministicEngine } from '@noesis-edu/core';

// Create engine with deterministic clock (replay mode)
const engine = createDeterministicEngine(skillGraph, config, startTime);

// Replay all events
engine.replayEvents(events);

// Engine state now matches original session
```

### 3. Verify Outcomes

```typescript
// Extract final learner state
const finalState = engine.exportState();

// Verify against claimed outcomes
const proof = {
  learnerId: eventFile._meta.learnerId,
  sessionCount: eventFile._meta.sessionCount,
  finalMasteryLevels: finalState.learnerModel.skills,
  memoryStates: finalState.memoryStates,
  verifiedAt: Date.now(),
};
```

---

## Compatibility Checklist

Before releasing any app that generates events:

- [ ] Events include all canonical BaseEvent fields
- [ ] Event types match canonical type discriminators
- [ ] Extensions use underscore-prefixed namespaces
- [ ] Export function strips extensions for EventFile
- [ ] Exported EventFile passes `validateEventFile()`
- [ ] Session includes required minimum events
- [ ] Events replay successfully through `createDeterministicEngine()`

---

## Version Compatibility

| Core Version | Event Schema | Proof Compatible |
|--------------|--------------|------------------|
| 0.1.x | 1.0.0 | Yes |
| 1.x.x (future) | 1.x.x | TBD |

**Rule:** Event schema versions follow semver. Patch versions MUST be backward compatible. Minor versions MAY add optional fields. Major versions MAY break compatibility.

---

*This document ensures that any app generating Noesis events can produce proof-verifiable EventFiles that replay correctly through the canonical core engine.*
