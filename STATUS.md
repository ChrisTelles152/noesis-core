# STATUS.md

> **One-page snapshot. For specifics, follow the links.**
> Last updated: 2026-05-02.

## Where things live

- **What we're building (intent, scope, brand, phase-1 wedge):** [`INTENTION.md`](INTENTION.md).
- **What's open right now (single source of truth for tasks + execution log):** [`todo.md`](todo.md).
- **How we're getting from "probably works" to "definitely works" (atomized plan):** [`PLAN.md`](PLAN.md).
- **Current code-vs-intent drift assessment:** [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).
- **API integration reference (REST + WebSocket + SDK + data contracts):** [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md).
- **Frozen historical analysis (do not edit; link only):** [`CODEBASE_ANALYSIS.md`](CODEBASE_ANALYSIS.md), `docs/{ALGORITHM,API_GAP,DATA_MODEL,SIMPLIFICATION,TESTING}_AUDIT.md`, `docs/architecture/{CORE_PUBLISH_READINESS,MIGRATION_REPORT}.md`, `docs/INVESTIGATION_PROMPTS.md`, [`docs/ACTION_PLAN.md`](docs/ACTION_PLAN.md) (superseded by `todo.md`).

## What's shipped (commits on this branch since the audit)

- **Phase A — Determinism contract.** Core constructors require explicit clock + idGenerator; new `createSystemEngine` opt-in; CI replay-equivalence gate; `requireClock` / `requireIdGenerator` runtime guards.
- **Phase B — Auto-persistence.** `CoreEngineAdapter.persistTo` / `hydrate` / `flush` API; debounced autosave; `localStorageTransport` + `httpTransport` factories; `useNoesisSDK` wired against `/api/engine/state`.
- **Phase C — NALS + canonical 5-stage loop.** `CognitiveStateVector` + `CognitiveStateEvent` first-class in Core; engine reducer + per-learner timeline; `StageCompletedEvent`; `SessionAction.type` extended; planner gating behind `enforceCanonicalLoop`.
- **Phase D — WebGazer demoted to opt-in.** New `SimulatedAttentionTracker` is the default; `useAttentionTracking` reads `VITE_ENABLE_REAL_GAZE_TRACKING`; server's helmet stops relaxing COEP unless `ENABLE_REAL_GAZE_TRACKING=true`.
- **Phase E — Server-side engine processing.** Per-user `EngineManager` with LRU + replay hydration + corrupt-snapshot fallback; `skill_graphs` table; `POST/GET /api/curriculum/skills`; `GET /api/core/next-action`; `POST /api/core/practice`; `GET /api/core/progress`; WebSocket broadcast on every event-store route; pagination + date-range on analytics + core/events.
- **Phase F (in progress) — Documentation reconciliation.** README headline drift fixed; port number aligned to 5174; `docs/API_REFERENCE.md` consolidated as the canonical integration doc; `apps/server/API.md` is now a redirect; `packages/core/{README,CHANGELOG}.md` synced.

Test suite: 1019 tests across 51 files (was 800 / 35 at the start of the audit). Lint clean. CI gates: lint, typecheck, full test suite, dedicated replay-determinism job.

## What's open

See [`todo.md`](todo.md). Highest-leverage remaining items:

1. Phase G — Brand DNA (Tailwind palette tokens, spiral-eye logo, dual font system).
2. Phase H — Brazil STEM wedge (i18n, `packages/content-pt-br-math/`, diagnostic UI, guided path, mentor dashboard, Golden Sequence).
3. Phase I — npm publish + Vercel docs site (the "Core production-ready" milestone INTENTION names).
4. Phase J — Audit-backlog cleanup (Tier-1/2 missing tests, FSRS/BKT pedagogy decisions, dependency cleanup).
5. Phase K — Repo split decision (BLOCKED on §6.1 of `todo.md`).

## Historical Jan-2026 snapshot

Preserved below for reference. Most "Out of scope" claims have flipped — XR / Voice are out per `INTENTION.md`, but Attention Tracking, Multi-tenant Auth, Analytics, Transfer Gate Persistence, Diagnostic Persistence, and Event-schema-aware persistence are all shipped.

---

> Last updated: 2026-01-29

### What This Repo Is

- **@noesis-edu/core**: Portable learning engine (BKT + FSRS + session planning)
- **apps/server**: Express backend with auth, persistence, LLM orchestration
- **apps/web-demo**: React demo app for testing core SDK

### In-Scope for v1 Wedge (Jan 2026)

- Core SDK: skill graph, BKT mastery, FSRS scheduling, session planner
- Persistence adapter interface (`NoesisStateStore`)
- JSON graph loader (`loadSkillGraphFromJSON`)
- Metrics extraction (`getLearnerMetrics`)
- Default session config (`DEFAULT_SESSION_CONFIG`)

### Out-of-Scope Until After Wedge Validation (Jan 2026 framing — much has shipped since)

- Attention tracking / gaze integration *(simulated tracker shipped Phase D; WebGazer is opt-in)*
- LLM-driven content generation
- Voice interface *(remains out of scope per INTENTION)*
- XR/VR support *(remains out of scope per INTENTION)*
- Multi-tenant auth
- Analytics dashboards
- Event schema migrations (v1→v2) *(snapshot v1.0 → v1.3 with backward-compat import)*
- YAML graph format

### Unimplemented Features (Jan 2026)

| Feature | Location | Status (May 2026) |
|---|---|---|
| XR/VR Support | `packages/adapters-attention-web/README.md` | Out of scope per INTENTION |
| Voice Interface | `packages/adapters-llm/README.md` | Out of scope per INTENTION |
| Local LLM Inference | `packages/adapters-llm/README.md` | Backlog |
| WebGazer Attention | `packages/adapters-attention-web` | Opt-in only (Phase D) |
| Transfer Gate Persistence | `packages/core/src/transfer` | Persisted via engine `exportState`/`importState` (snapshot v1.0+) |
| Diagnostic Engine Persistence | `packages/core/src/diagnostic` | Same — diagnostic results round-trip in the snapshot |
