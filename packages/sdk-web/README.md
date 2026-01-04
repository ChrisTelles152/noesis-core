# @noesis/sdk-web

Web-friendly facade for the Noesis learning system.

## Overview

This package provides a unified SDK interface for web applications that integrates:

- **Attention tracking** via `@noesis/adapters-attention-web`
- **LLM orchestration** via `@noesis/adapters-llm`
- **Mastery tracking** (reference policy implementation)

## Installation

```bash
npm install @noesis/sdk-web
```

## Usage

```typescript
import { NoesisSDK } from '@noesis/sdk-web';

const sdk = new NoesisSDK({
  debug: true,
  modules: ['attention', 'mastery', 'orchestration'],
  attentionOptions: {
    useRealGazeTracking: true,
  },
  masteryOptions: {
    threshold: 0.8,
    spacingFactor: 2.5,
  },
});

// Start attention tracking
await sdk.attention.startTracking(document.getElementById('content'));

// Record mastery events
sdk.mastery.recordEvent({
  objectiveId: 'algebra-101',
  result: 0.85,
});

// Get learner state
const state = sdk.getLearnerState();
console.log('Attention:', state.attention?.score);
console.log('Mastery:', state.mastery);
```

## Architecture

This SDK is a **facade** that wires together multiple adapters:

```
┌─────────────────────────────────┐
│         NoesisSDK               │  <- This package
│         (Facade)                │
├─────────────────────────────────┤
│  ┌──────────┐  ┌─────────────┐  │
│  │ Attention│  │Orchestration│  │
│  │ Tracker  │  │   (LLM)     │  │
│  └────┬─────┘  └─────┬───────┘  │
│       │              │          │
│  ┌────▼─────────────▼────────┐  │
│  │     Mastery Tracker       │  │
│  │  (Reference Policy)       │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
          │
          ▼
    @noesis/core (future)
    Pure mastery engine
```

## Mastery Tracker

The `MasteryTracker` in this package is a **reference policy implementation**.
It provides basic spaced repetition scheduling but does NOT implement the full
Noesis Core learning loop (skill graph, BKT model, transfer gating).

For the true mastery engine, see `@noesis/core` (under development).

## License

MIT
