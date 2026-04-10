# Action Plan — Noesis Core

> Last updated: 2026-04-10 (Phase 2 execution)
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
| MEDIUM | 12 | 7 | 5 | 0 |
| LOW | 6 | 6 | 0 | 0 |

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
| ~H2~ | Failing test: env.test.ts | Already fixed — 801 tests pass |
| ~H3~ | OpenAPI `/auth/user` vs `/auth/me` mismatch | False finding — spec correctly has `/auth/me` |
| ~H4~ | OpenAPI login/register response schema wrong | False finding — User schema `{id, username}` matches actual response |
| ~H5~ | `CoreEngineAdapter.updateSkillGraph()` loses all state | Already fixed — now exports/imports state around recreation |

---

## MEDIUM — Code quality, missing tests, documentation gaps

| # | Finding | Source | Effort | Type | Status |
|---|---------|--------|--------|------|--------|
| M1 | **Core engine state never persisted to database** — Server never calls `engine.exportState()` / `importState()`. BKT/FSRS states live only in-memory, lost on restart. `NoesisStateStore` interface exists but isn't wired up server-side. | Investigation Prompt 4 | L | NEEDS_HUMAN | BACKLOG |
| M2 | **Server learning events incompatible with core engine events** — Server stores `{userId, type, data, timestamp}`. Core expects `NoesisEvent` with `{id, type, learnerId, sessionId, skillId, correct, ...}`. Cannot replay from server DB. | Investigation Prompt 4 | L | NEEDS_HUMAN | BACKLOG |
| M3 | **Two competing spaced repetition systems** — Core uses FSRS, SDK has `MasteryTracker` with incompatible exponential spacing formula. Both track mastery independently. | Algorithm Audit, Prompt 1 | L | NEEDS_HUMAN | BACKLOG |
| M4 | **PostgreSQL schema missing Google OAuth columns** — `shared/schema.ts` lacks `email`, `google_id`, `display_name`, `avatar_url`. Only affects PostgreSQL backend (pilot uses SQLite). | Data Model audit | M | Engineering | BACKLOG |
| M5 | **`IStorage` interface missing Google OAuth methods** — `getUserByGoogleId`, `createGoogleUser`, `linkGoogleAccount` only on `SqliteStorage`. `auth.ts` uses `(store as any)` cast. | Data Model audit | M | Engineering | BACKLOG |
| M6 | **Schema mismatch PostgreSQL vs SQLite** — SQLite allows nullable password; PostgreSQL doesn't. Google OAuth users would crash on PostgreSQL INSERT. | Data Model audit | S | Engineering | BACKLOG |
| M7 | **BKT mastery convergence is very fast** — Only 2 consecutive correct answers from pInit=0.3 to exceed 0.85 threshold. Could cause premature mastery declarations. | Algorithm Audit | S | NEEDS_HUMAN | BACKLOG |
| M8 | **FSRS implementation departs from published spec** — Different retention formula exponent (-1 vs -0.5), single `stabilityDecay` parameter instead of three (w8,w9,w10). Self-consistent but not spec-conformant. | Algorithm Audit | L | NEEDS_HUMAN | BACKLOG |
| M9 | **README.md test count stale** — Claims "115 tests across 6 test files"; actual is 801 tests across 35 files. | `README.md` | S | Engineering | BACKLOG |
| M10 | **Duplicate SDK code in `apps/web-demo/src/sdk/`** — ~1,280 lines of near-identical copies from packages. Should import from packages instead. | `SIMPLIFICATION_AUDIT.md` | M | Engineering | BACKLOG |
| M11 | **CODEBASE_ANALYSIS.md is stale** — References old directory structure, old stats, and items already fixed. | `CODEBASE_ANALYSIS.md` | M | Engineering | BACKLOG |
| M12 | **MIGRATION_REPORT.md checklist stale** — Phase 1-3 items all unchecked but implemented. | `MIGRATION_REPORT.md:293-308` | S | Engineering | BACKLOG |

---

## LOW — Style, naming, minor polish

| # | Finding | Source | Effort | Type | Status |
|---|---------|--------|--------|------|--------|
| L1 | **CORE_PUBLISH_READINESS.md test count stale** — Says "47 tests" | `docs/architecture/` | S | Engineering | BACKLOG |
| L2 | **OpenAPI spec missing Google OAuth routes** — `/auth/google` and `/auth/google/callback` not in spec | `openapi.ts` | S | Engineering | BACKLOG |
| L3 | **SkillGraph cycle detection can over-report cycle nodes** — GRAY nodes left from early DFS termination; cycle existence always correctly detected | Algorithm Audit | M | Engineering | BACKLOG |
| L4 | **Diagnostic secondary skill weight applied to difficulty, not accuracy** — `difficulty * 0.5` halves difficulty weight for secondary skills; small effect | Algorithm Audit | S | Engineering | BACKLOG |
| L5 | **Variable typo: `zeroDegreeSkilss`** in `SkillGraphImpl.ts:169` | Algorithm Audit | S | Engineering | BACKLOG |
| L6 | **Overengineered infrastructure for pilot** — ~3,400 lines of performance monitoring, K8s probes, WebSocket DoS protection, 3 storage backends. See SIMPLIFICATION_AUDIT.md. | `SIMPLIFICATION_AUDIT.md` | L | NEEDS_HUMAN | BACKLOG |

---

## Execution Log

| # | Commit | Description |
|---|--------|-------------|
| C1 | `TBD` | Delete `ecosystem.config.cjs` — hardcoded secrets |
| H1 | `TBD` | Fix `SkillGraph.removeSkill()` dangling references + add tests |
| — | `TBD` | Write `docs/ALGORITHM_AUDIT.md` from Prompt 1 analysis |
| — | `TBD` | Commit `docs/API_REFERENCE.md` and `docs/SIMPLIFICATION_AUDIT.md` |

---

## Legend

- **Effort:** S = Small (<30 min), M = Medium (30 min–2 hr), L = Large (2+ hr)
- **NEEDS_HUMAN** = Requires product/architecture decision, not pure engineering
- **DONE** = Fixed in this session
- **BACKLOG** = Valid finding, deferred for future session
