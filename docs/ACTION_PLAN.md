# Action Plan — Noesis Core

> Last updated: 2026-04-10 (Phase 4 — second pass complete)
>
> **Source docs analyzed:**
> - `CODEBASE_ANALYSIS.md` — January 2026 comprehensive analysis
> - `STATUS.md` — Project status and maturity
> - `docs/API_REFERENCE.md` — API surface documentation (Prompt 2 session)
> - `docs/SIMPLIFICATION_AUDIT.md` — Simplification recommendations (Prompt 3 session)
> - `docs/ALGORITHM_AUDIT.md` — Algorithm correctness analysis (Prompt 1 session)
> - `docs/INVESTIGATION_PROMPTS.md` — 5 investigation prompts
> - `docs/architecture/*` — Architecture docs (constitution, publish readiness, migration)
> - Full source code verification of all findings against actual codebase

---

## Triage Summary

| Severity | Count | Actionable | Needs Human | Done |
|----------|-------|------------|-------------|------|
| CRITICAL | 1 | 1 | 0 | 1 |
| HIGH | 1 | 1 | 0 | 1 |
| MEDIUM | 12 | 7 | 5 | 8 |
| LOW | 6 | 6 | 0 | 5 |

---

## CRITICAL — Broken functionality, data loss risk, security issue

| # | Finding | Source | Effort | Status |
|---|---------|--------|--------|--------|
| C1 | **Hardcoded secrets in `ecosystem.config.cjs`** — Contains `SESSION_SECRET` and `OPENAI_API_KEY` in plaintext, committed to git history. File also not needed (Docker/systemd preferred for deployment). Secrets in git history should be rotated. | `SIMPLIFICATION_AUDIT.md` | S | **DONE** — file deleted |

---

## HIGH — Incorrect logic, failed tests, significant gaps

| # | Finding | Source | Effort | Status |
|---|---------|--------|--------|--------|
| H1 | **`SkillGraph.removeSkill()` leaves dangling prerequisite references** — Calls `this.skills.delete(skillId)` but does NOT clean up references to that skill in other skills' `prerequisites` arrays. After removal, `validate()` reports `MISSING_PREREQUISITE` errors. | Algorithm Audit (`SkillGraphImpl.ts:40-42`) | S | **DONE** — fix + tests added |

### Previously reported HIGH items — resolved

| # | Original Finding | Resolution |
|---|-----------------|------------|
| ~H2~ | Failing test: env.test.ts | Fixed — assertion updated for SQLite-aware warning `42f379e` |
| ~H3~ | OpenAPI spec mismatches (routes, response schemas, missing endpoints) | Fixed — spec aligned with actual routes `42f379e` |
| ~H4~ | OpenAPI login/register response schema wrong | Fixed — response schema matches actual code `42f379e` |
| ~H5~ | `CoreEngineAdapter.updateSkillGraph()` loses all state | Fixed — now exports/imports state around recreation `42f379e` |

---

## MEDIUM — Code quality, missing tests, documentation gaps

| # | Finding | Source | Effort | Type | Status |
|---|---------|--------|--------|------|--------|
| M1 | **Core engine state never persisted to database** — Server never calls `engine.exportState()` / `importState()`. BKT/FSRS states live only in-memory, lost on restart. `NoesisStateStore` interface exists but isn't wired up server-side. | Investigation Prompt 4 | L | NEEDS_HUMAN | BACKLOG |
| M2 | **Server learning events incompatible with core engine events** — Server stores `{userId, type, data, timestamp}`. Core expects `NoesisEvent` with `{id, type, learnerId, sessionId, skillId, correct, ...}`. Cannot replay from server DB. | Investigation Prompt 4 | L | NEEDS_HUMAN | BACKLOG |
| M3 | **Two competing spaced repetition systems** — Core uses FSRS, SDK has `MasteryTracker` with incompatible exponential spacing formula. Both track mastery independently. | Algorithm Audit, Prompt 1 | L | NEEDS_HUMAN | **DONE** — MasteryTracker deprecated with @deprecated JSDoc, CoreEngineAdapter is canonical. recordPractice() syncs to both for backward compat `6581587` |
| M4 | **PostgreSQL schema missing Google OAuth columns** — `shared/schema.ts` lacks `email`, `google_id`, `display_name`, `avatar_url`. Only affects PostgreSQL backend (pilot uses SQLite). | Data Model audit | M | Engineering | **DONE** — columns added to Drizzle schema |
| M5 | **`IStorage` interface missing Google OAuth methods** — `getUserByGoogleId`, `createGoogleUser`, `linkGoogleAccount` only on `SqliteStorage`. `auth.ts` uses `(store as any)` cast. | Data Model audit | M | Engineering | **DONE** — interface updated, all 3 backends implement, auth.ts type-safe |
| M6 | **Schema mismatch PostgreSQL vs SQLite** — SQLite allows nullable password; PostgreSQL doesn't. Google OAuth users would crash on PostgreSQL INSERT. | Data Model audit | S | Engineering | **DONE** — password nullable in Drizzle schema, all backends handle null |
| M7 | **BKT mastery convergence is very fast** — Only 2 consecutive correct answers from pInit=0.3 to exceed 0.85 threshold. Could cause premature mastery declarations. | Algorithm Audit | S | NEEDS_HUMAN | BACKLOG |
| M8 | **FSRS implementation departs from published spec** — Different retention formula exponent (-1 vs -0.5), single `stabilityDecay` parameter instead of three (w8,w9,w10). Self-consistent but not spec-conformant. | Algorithm Audit | L | NEEDS_HUMAN | BACKLOG |
| M9 | **README.md test count stale** — Claims "115 tests across 6 test files"; actual is 801 tests across 35 files. | `README.md` | S | Engineering | **DONE** — updated to "795+ tests across 35 files" |
| M10 | **Duplicate SDK code in `apps/web-demo/src/sdk/`** — ~1,280 lines of near-identical copies from packages. Should import from packages instead. | `SIMPLIFICATION_AUDIT.md` | M | Engineering | **DONE** — replaced with re-exports (`2989bd0`, `db12d44`) |
| M11 | **CODEBASE_ANALYSIS.md is stale** — References old directory structure, old stats, and items already fixed. | `CODEBASE_ANALYSIS.md` | M | Engineering | **DONE** — added superseded notice + current doc pointers |
| M12 | **MIGRATION_REPORT.md checklist stale** — Phase 1-3 items all unchecked but implemented. | `MIGRATION_REPORT.md:293-308` | S | Engineering | **DONE** — items marked complete |

---

## LOW — Style, naming, minor polish

| # | Finding | Source | Effort | Type | Status |
|---|---------|--------|--------|------|--------|
| L1 | **CORE_PUBLISH_READINESS.md test count stale** — Says "47 tests" | `docs/architecture/` | S | Engineering | **DONE** — updated to 241 tests |
| L2 | **OpenAPI spec missing Google OAuth routes** — `/auth/google` and `/auth/google/callback` not in spec | `openapi.ts` | S | Engineering | **DONE** — routes added to spec |
| L3 | **SkillGraph cycle detection can over-report cycle nodes** — GRAY nodes left from early DFS termination; cycle existence always correctly detected | Algorithm Audit | M | Engineering | **DONE** — DFS no longer early-returns; finds all cycles `1f8caf6` |
| L4 | **Diagnostic secondary skill weight applied to difficulty, not accuracy** — `difficulty * 0.5` halves difficulty weight for secondary skills; small effect | Algorithm Audit | S | Engineering | **DONE** — weight now applies to attempts, correctness, and difficulty equally `0aad194` |
| L5 | **Variable typo: `zeroDegreeSkilss`** in `SkillGraphImpl.ts:169` | Algorithm Audit | S | Engineering | **DONE** — fixed to `zeroDegreeSkills` `0aad194` |
| L6 | **Overengineered infrastructure for pilot** — ~3,400 lines of performance monitoring, K8s probes, WebSocket DoS protection, 3 storage backends. See SIMPLIFICATION_AUDIT.md. | `SIMPLIFICATION_AUDIT.md` | L | NEEDS_HUMAN | BACKLOG |

---

## Execution Log

| # | Commit | Description |
|---|--------|-------------|
| C1 | `d2ee83a` | Delete `ecosystem.config.cjs` — hardcoded secrets |
| H1 | `db7d051` | Fix `SkillGraph.removeSkill()` dangling references + 3 tests |
| M4-M6 | `42f379e` | PostgreSQL schema OAuth columns, IStorage interface, all backends implement OAuth, nullable password |
| M9 | `42f379e` | README test count updated |
| — | `42f379e` | OpenAPI spec fixes, CoreEngineAdapter.updateSkillGraph state preservation, auth.ts type safety |
| M6 | `56c7351` | Fix Express.User type for OAuth + SqliteStorage null password check |
| — | `e3e0c30` | Update stale docs (CORE_PUBLISH_READINESS, MIGRATION_REPORT, README features) |
| — | `155ccee` | Write `docs/ALGORITHM_AUDIT.md` + update `docs/ACTION_PLAN.md` |
| — | `4118de3` | 5 high-priority missing tests + testing strategy doc |
| — | `b2ec874` | Simplification audit doc |
| L4,L5 | `0aad194` | Fix diagnostic secondary skill weighting + variable typo |
| L2 | `6d8f1a6` | Add Google OAuth routes to OpenAPI spec |
| L3 | `1f8caf6` | Fix SkillGraph cycle detection: DFS no longer early-returns, finds all cycles |
| M10 | `63aec43` | Replace ~1,200 lines of duplicate SDK code with re-exports |
| M11 | `9171218` | Add superseded notice to CODEBASE_ANALYSIS.md with current doc pointers |
| M3 | `6581587` | Deprecate MasteryTracker, mark CoreEngineAdapter as canonical, sync recordPractice to both |

---

## Legend

- **Effort:** S = Small (<30 min), M = Medium (30 min–2 hr), L = Large (2+ hr)
- **NEEDS_HUMAN** = Requires product/architecture decision, not pure engineering
- **DONE** = Fixed in this session
- **BACKLOG** = Valid finding, deferred for future session
