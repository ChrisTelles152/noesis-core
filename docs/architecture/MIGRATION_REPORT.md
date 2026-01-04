# Noesis Monorepo Migration Report

**Date:** January 2026
**Purpose:** Document the restructuring of noesis-core from flat structure to monorepo with proper separation of concerns.

---

## Summary

This migration restructures the repository to cleanly separate:

1. **Core SDK** (`packages/core`) - Dependency-free learning engine (interfaces only for now)
2. **Adapters** - Optional integrations (attention tracking, LLM)
3. **SDK Facade** (`packages/sdk-web`) - Web-friendly wrapper
4. **Apps** - Product applications (web demo, server)

---

## New Repository Structure

```
noesis-core/
├── packages/
│   ├── core/                       # Pure learning engine (interfaces)
│   │   ├── src/
│   │   │   ├── constitution.ts     # Canonical interfaces
│   │   │   ├── events/             # Event schema
│   │   │   ├── graph/              # Skill graph
│   │   │   ├── learner/            # Learner model
│   │   │   ├── memory/             # Memory scheduler
│   │   │   ├── planning/           # Session planner
│   │   │   └── transfer/           # Transfer gating
│   │   └── package.json
│   │
│   ├── adapters-attention-web/     # Web attention tracking
│   │   └── src/
│   │       ├── attention.ts
│   │       ├── webgazer-adapter.ts
│   │       └── types.ts
│   │
│   ├── adapters-llm/               # LLM integration
│   │   └── src/
│   │       ├── orchestration.ts    # Client-side
│   │       ├── manager.ts          # Server-side
│   │       └── providers/
│   │
│   └── sdk-web/                    # Web facade
│       └── src/
│           ├── NoesisSDK.ts
│           └── policies/
│               └── mastery.ts
│
├── apps/
│   ├── web-demo/                   # React demo app
│   │   └── src/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── pages/
│   │       └── sdk/                # (legacy, to be removed)
│   │
│   └── server/                     # Express server
│       ├── routes.ts
│       ├── auth.ts
│       ├── storage.ts
│       └── llm/                    # (now also in adapters-llm)
│
├── shared/                         # Shared schemas
│   └── schema.ts
│
└── docs/
    └── architecture/
        ├── CORE_SDK_CONSTITUTION.md
        └── MIGRATION_REPORT.md
```

---

## File Moves

### To `apps/web-demo/` (was `client/`)

| Source | Destination | Reason |
|--------|-------------|--------|
| `client/*` | `apps/web-demo/*` | React app is a product, not SDK |
| `client/src/components/*` | `apps/web-demo/src/components/*` | UI components |
| `client/src/hooks/*` | `apps/web-demo/src/hooks/*` | React hooks |
| `client/src/pages/*` | `apps/web-demo/src/pages/*` | Page components |

### To `apps/server/` (was `server/`)

| Source | Destination | Reason |
|--------|-------------|--------|
| `server/*` | `apps/server/*` | Express backend is a product |
| `server/routes.ts` | `apps/server/routes.ts` | HTTP endpoints |
| `server/auth.ts` | `apps/server/auth.ts` | Authentication |
| `server/storage.ts` | `apps/server/storage.ts` | Data persistence |

### To `packages/adapters-attention-web/`

| Source | Destination | Reason |
|--------|-------------|--------|
| `client/src/sdk/attention.ts` | `packages/adapters-attention-web/src/attention.ts` | Browser-specific, uses webcam/WebGazer |
| `client/src/sdk/webgazer-adapter.ts` | `packages/adapters-attention-web/src/webgazer-adapter.ts` | WebGazer.js integration |
| `client/src/sdk/webgazer.d.ts` | `packages/adapters-attention-web/src/webgazer.d.ts` | Type definitions |

### To `packages/adapters-llm/`

| Source | Destination | Reason |
|--------|-------------|--------|
| `client/src/sdk/orchestration.ts` | `packages/adapters-llm/src/orchestration.ts` | LLM API client |
| `server/llm/index.ts` | `packages/adapters-llm/src/manager.ts` | Multi-provider LLM manager |
| `server/llm/types.ts` | `packages/adapters-llm/src/types.ts` | LLM types |
| `server/llm/providers/*.ts` | `packages/adapters-llm/src/providers/*.ts` | OpenAI, Anthropic, Fallback |

### To `packages/sdk-web/`

| Source | Destination | Reason |
|--------|-------------|--------|
| `client/src/sdk/NoesisSDK.ts` | `packages/sdk-web/src/NoesisSDK.ts` | Web facade combining adapters |
| `client/src/sdk/mastery.ts` | `packages/sdk-web/src/policies/mastery.ts` | Reference policy (not true core) |
| `client/src/sdk/types.ts` | `packages/sdk-web/src/types.ts` | SDK types |

### To `packages/core/` (NEW)

| File | Purpose | Status |
|------|---------|--------|
| `constitution.ts` | Canonical interfaces for all core modules | Implemented |
| `events/index.ts` | Event schema types and helpers | Implemented |
| `graph/index.ts` | Skill graph interface | Interface only |
| `learner/index.ts` | Learner model interface | Interface only |
| `memory/index.ts` | Memory scheduler interface | Interface only |
| `planning/index.ts` | Session planner interface | Interface only |
| `transfer/index.ts` | Transfer gate interface | Interface only |

---

## Classification: What is Core vs Adapter vs App

### Core (`packages/core`)

Must be:
- Pure TypeScript, no dependencies
- Deterministic and replayable
- Platform-agnostic

Includes:
- Skill graph representation
- Learner model (BKT)
- Memory scheduler (FSRS)
- Session planner
- Transfer gating
- Event schema

### Adapters (`packages/adapters-*`)

Optional integrations that:
- Have external dependencies
- Use platform-specific APIs
- Provide data TO core (not core logic itself)

Examples:
- `adapters-attention-web` - WebGazer, webcam, browser APIs
- `adapters-llm` - OpenAI, Anthropic APIs

### Apps (`apps/`)

Full applications that:
- Compose packages together
- Have infrastructure (DB, auth, routes)
- Provide user-facing features

Examples:
- `web-demo` - React demo application
- `server` - Express backend with auth, storage, routes

---

## What Remains Non-Core and Why

| Item | Location | Why Not Core |
|------|----------|--------------|
| `AttentionTracker` | `adapters-attention-web` | Requires browser APIs, webcam, WebGazer |
| `Orchestrator` | `adapters-llm` | Makes external API calls (OpenAI) |
| `MasteryTracker` | `sdk-web/policies` | Reference policy, not research-grade BKT |
| `NoesisSDK` | `sdk-web` | Facade combining adapters, browser-specific |
| `routes.ts` | `apps/server` | HTTP/Express infrastructure |
| `auth.ts` | `apps/server` | Passport.js, sessions |
| `storage.ts` | `apps/server` | PostgreSQL/Drizzle |
| React components | `apps/web-demo` | UI layer |
| WebSocket | `apps/server` | Network infrastructure |

---

## What is Now Cleanly Reusable

### `@noesis/core` (Future)

When implemented, provides:
- Skill graph validation and traversal
- BKT learner model with inspectable state
- FSRS memory scheduling
- Deterministic session planning
- Transfer test gating

Can be used in:
- Node.js backend
- Browser (via bundler)
- React Native
- Electron
- Deno
- Any JavaScript environment

### `@noesis/adapters-attention-web`

Standalone package for web attention tracking:
- WebGazer.js integration
- Webcam-based simulation fallback
- Attention scoring algorithm

### `@noesis/adapters-llm`

Standalone package for LLM integration:
- Multi-provider support (OpenAI, Anthropic, fallback)
- Client and server implementations
- Automatic fallback on failure

### `@noesis/sdk-web`

Convenience facade for web apps:
- Combines attention + LLM + mastery
- Matches original NoesisSDK API
- Easy migration path for existing users

---

## Build Configuration Changes

### Root `package.json`
- Added `workspaces` for npm workspace linking
- Updated scripts to use new paths (`apps/server`, `apps/web-demo`)

### Root `tsconfig.json`
- Updated `include` paths
- Added path aliases for `@noesis/*` packages

### Root `vite.config.ts`
- Updated path aliases
- Changed root to `apps/web-demo`

### Root `vitest.config.ts`
- Updated test file patterns
- Added package path aliases

---

## Migration Checklist for Existing Code

If you're updating existing code that used the old SDK:

1. **Import from packages instead of relative paths:**
   ```typescript
   // Old
   import { AttentionTracker } from './sdk/attention';

   // New
   import { AttentionTracker } from '@noesis/adapters-attention-web';
   ```

2. **Use sdk-web for the facade:**
   ```typescript
   // Old
   import { NoesisSDK } from './sdk/NoesisSDK';

   // New
   import { NoesisSDK } from '@noesis/sdk-web';
   ```

3. **Server LLM providers:**
   ```typescript
   // Old
   import { getLLMManager } from './llm';

   // New
   import { getLLMManager } from '@noesis/adapters-llm';
   ```

---

## What Core Still Needs (Implementation Checklist)

The core package currently has **interfaces only**. Implementation priorities:

### Immediate (Phase 1)
- [ ] `SkillGraph` class with cycle detection
- [ ] `LearnerModelEngine` with BKT algorithm
- [ ] `MemoryScheduler` with FSRS algorithm
- [ ] Unit tests for all core logic

### Next (Phase 2)
- [ ] `SessionPlanner` with deterministic policy
- [ ] `TransferGate` implementation
- [ ] `DiagnosticEngine` for cold start placement

### Future (Phase 3)
- [ ] `NoesisCoreEngine` unified interface
- [ ] Replay/debug tooling
- [ ] Property-based tests
- [ ] Documentation and examples

---

*This report documents the monorepo restructuring. See CORE_SDK_CONSTITUTION.md for the canonical definition of what Core SDK should be.*
