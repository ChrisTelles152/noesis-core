# STATUS.md

> **One-page snapshot. For specifics, follow the links.**
> Last updated: 2026-05-03.

## Where things live

- **What we're building (intent, scope, brand, phase-1 wedge):** [`INTENTION.md`](INTENTION.md).
- **Current strategic decision driving repo + product shape:** [`docs/architecture/UNIFICATION_ADR.md`](docs/architecture/UNIFICATION_ADR.md) — Path A confirmed: this repo becomes pure SDK + docs site; apps + verticals consolidate into `noesis-app` (renamed `noesis-pilot`) on Next.js + Supabase.
- **What's open right now (single source of truth for tasks + execution log):** [`todo.md`](todo.md).
- **How we're getting from "probably works" to "definitely works" (atomized plan, with phase-completion markers):** [`PLAN.md`](PLAN.md).
- **Current code-vs-intent drift assessment:** [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).
- **API integration reference (REST + WebSocket + SDK + data contracts):** [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md).
- **BKT / FSRS pedagogy decisions + rationale:** [`docs/ALGORITHM_AUDIT.md`](docs/ALGORITHM_AUDIT.md).
- **Frozen historical analysis (do not edit; link only):** [`CODEBASE_ANALYSIS.md`](CODEBASE_ANALYSIS.md), `docs/{API_GAP,DATA_MODEL,SIMPLIFICATION,TESTING}_AUDIT.md`, `docs/architecture/{CORE_PUBLISH_READINESS,MIGRATION_REPORT}.md`, `docs/INVESTIGATION_PROMPTS.md`, [`docs/ACTION_PLAN.md`](docs/ACTION_PLAN.md) (superseded by `todo.md`).

## What's shipped (commits on this branch since the audit)

- **Phase A — Determinism contract.** Core constructors require explicit clock + idGenerator; new `createSystemEngine` opt-in; CI replay-equivalence gate; `requireClock` / `requireIdGenerator` runtime guards.
- **Phase B — Auto-persistence.** `CoreEngineAdapter.persistTo` / `hydrate` / `flush` API; debounced autosave; `localStorageTransport` + `httpTransport` factories; `useNoesisSDK` wired against `/api/engine/state`.
- **Phase C — NALS + canonical 5-stage loop.** `CognitiveStateVector` + `CognitiveStateEvent` first-class in Core; engine reducer + per-learner timeline; `StageCompletedEvent`; `SessionAction.type` extended; planner gating behind `enforceCanonicalLoop`.
- **Phase D — WebGazer demoted to opt-in.** New `SimulatedAttentionTracker` is the default; `useAttentionTracking` reads `VITE_ENABLE_REAL_GAZE_TRACKING`; server's helmet stops relaxing COEP unless `ENABLE_REAL_GAZE_TRACKING=true`.
- **Phase E — Server-side engine processing.** Per-user `EngineManager` with LRU + replay hydration + corrupt-snapshot fallback; `skill_graphs` table; `POST/GET /api/curriculum/skills`; `GET /api/core/next-action`; `POST /api/core/practice`; `GET /api/core/progress`; WebSocket broadcast on every event-store route; pagination + date-range on analytics + core/events.
- **Phase F — Documentation reconciliation.** README headline drift fixed; port number aligned to 5174; `docs/API_REFERENCE.md` consolidated as the canonical integration doc; `apps/server/API.md` is now a redirect; `packages/core/{README,CHANGELOG}.md` synced; STATUS.md reduced to a one-page redirect; DATA_MODEL_AUDIT gaps marked RESOLVED inline.
- **Phase G — Brand DNA.** Tailwind palette tokens (Cloudbone White / Slate Grey / Neural Copper / Iris Bloom / Glacial Cyan); spiral-eye SVG logo wired into Hero + favicon; dual font system (Inter + Source Serif 4).
- **Phase H — Brazilian STEM pilot product (full block).** i18n with pt-BR default + en-US fallback; `@noesis/content-pt-br-math` with 25-skill DAG + 50 practice items + 5 golden sequences; placement diagnostic at `/diagnostic`; prereq-gated `/path` page; per-skill 4-stage canonical-loop walkthrough at `/skill/:id`; admin-gated `/mentor` dashboard with CSV export; admin-gated `/authoring` curriculum editor (per-skill CRUD on a system-wide curriculum; deletes scrub orphan prereqs; every save re-validates the graph).
- **Phase I — npm publish + Vercel docs site.** `release:core` script does build + test + smoke + publish (was an `echo` placeholder); `core-v*` tag triggers `release.yml` with NPM_TOKEN-gated publish + leak guard; `@noesis-edu/core` bumped to 0.2.0 with version-sync test + RELEASING.md; Astro Starlight docs site at `docs/site/` with 9 brand-applied pages; `vercel.json` wires the deploy.
- **Phase J — Audit-backlog cleanup (pure-engineering subset).** Tier-1 tests pinning unknown-skill behavior + multi-learner isolation; Tier-2 tests pinning BKT convergence (1 correct → 0.6927, 2 → 0.9193), planner relearning-prereq gating, FSRS rating-4 interval-jump (~5.7 days); Tier-3 tests pinning loader round-trip, diagnostic edge cases, metrics empty-shape; `linkGoogleAccount` deleted with regression tests guarding it; J4 RESOLVED — keep BKT defaults, documented rationale in ALGORITHM_AUDIT.md.

**Test suite: 1166 tests across 65 files. Lint clean. Typecheck clean. CI gates: lint, typecheck, full test suite, dedicated replay-determinism job.**

## What's open

See [`todo.md`](todo.md) for full breakdown. Highest-leverage remaining items:

1. **UNIFICATION_ADR execution.** §6.1 is resolved — Path A. The migration is laid out in `docs/architecture/UNIFICATION_ADR.md` as 5 phases (engine consolidation → `noesis-app` skeleton → extract apps from this repo → reduce verticals to packs → harden + launch). For *this repo*, the relevant work is: cross-repo Phase H (engine consolidation across `noesis-eng` / `noesis-math` / `noesis-delf` into `@noesis-edu/core@0.3.0`), then ADR Phase 3 (delete `apps/`, `shared/`, root-level UI deps; this repo becomes SDK + docs/site only).
2. **Phase J5 — FSRS spec conformance decision.** Three options on the table (document divergence + pin / converge to spec / make configurable). Recommendation: document + pin for the pilot. See `docs/ALGORITHM_AUDIT.md` Observation #1.
3. **Phase M — Adaptive FSRS scheduling (NEW, see `PLAN.md`).** Three milestones (M1 instrumentation now / M2 population fit post-pilot / M3 per-learner fit). M1 unblocks the others without changing behavior.
4. **Phase J6 — Dependency cleanup.** Drop `@replit/*`, dedupe `webgazer` and `openai`. Safe regardless of the ADR rollout.
5. **Open §6 decisions still pending:** §6.8 (privacy / data governance, required before live pilot data), §6.3 (license MIT vs Apache 2), §6.6 (real LLM vs rules-based for the pilot demo), §6.4 (physics in Phase-1), §6.13 (audience priority for docs/demo).
6. **Phase L — Pilot-scale simplification.** **Largely subsumed by the UNIFICATION_ADR** — once `apps/` extracts out of this repo, most of what L would simplify is gone anyway. Combined with the user's stated "pilot is production-grade" philosophy, L mostly does not apply. Keep only the `attached_assets/` move from L1 (a docs cleanup, not infrastructure deletion).

**Manual external steps still pending (user-side):** set `NPM_TOKEN` GitHub secret + tag `core-v0.2.0` (publishes 0.2.0 to npm); connect repo to Vercel (deploys docs site); end-to-end manual walkthrough of the H-block flow as a learner *before extraction* if you want to validate the pilot's UI behavior under the current Vite stack one more time.

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
