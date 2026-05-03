---
title: What is Noesis?
description: Open-source adaptive learning infrastructure with a Brazilian STEM pilot.
---

Noesis is a deterministic, mastery-based learning engine plus the server
and React surfaces a real product needs around it. Three layers, each
usable on its own:

1. **`@noesis-edu/core`** — the SDK. A pure-TypeScript engine that owns
   the skill graph (DAG with cycle detection), the BKT learner model,
   FSRS-style spaced repetition, the session planner, and the
   diagnostic engine. No browser APIs, no DB, no React.
2. **`apps/server`** — Express + Passport + Drizzle. Persists per-user
   engine state, replays canonical events, exposes thin endpoints
   (`/api/core/next-action`, `/api/core/practice`, `/api/core/progress`)
   so a client doesn't need to own the engine.
3. **`apps/web-demo`** — the React surface. Diagnostic placement quiz,
   prereq-gated learning path, per-skill canonical loop, mentor
   dashboard with CSV export, authoring admin.

## Pilot context

The current pilot is a Brazilian-Portuguese math curriculum (Phase H in
the project plan): arithmetic → algebra → functions → geometry →
trigonometry → statistics, 25 skills with prerequisites, ~50 practice
items, all in pt-BR with an en-US fallback.

## Where things live in the repo

| What | Path |
|---|---|
| Core SDK | `packages/core/` |
| Content pack (pt-BR math) | `packages/content-pt-br-math/` |
| Server | `apps/server/` |
| Web app | `apps/web-demo/` |
| Adapters | `packages/adapters-attention-web/`, `packages/adapters-llm/` |
| Plan + status | `PLAN.md`, `STATUS.md`, `todo.md` |

## License

MIT. Use it commercially, fork it, redistribute it, build on top of it.
