# UNIFICATION_ADR — Noesis App Unification

**Date:** 2026-05-03
**Status:** Proposed (awaiting ratification)
**Author:** Founder + recon agents
**Supersedes:** Path B option in `PLAN.md` Phase K (rename to `noesis-platform`)
**Reinforces:** Path A option in `PLAN.md` Phase K (extract apps; keep this repo SDK-only)
**Related:** `noesis-math/athens/DECISIONS.md` D007 (engine duplication / Phase H)

---

## Context

The Noesis ecosystem currently consists of seven repos that fall into three roles:

| Repo | Role | Stack |
|------|------|-------|
| `noesis-core` | SDK + monorepo holding `apps/server` + `apps/web-demo` | Vite+React SPA + Express + Passport + Drizzle + Neon/SQLite |
| `noesis-eng` | English-learning vertical product | Next.js 16 + React 19 + Supabase SSR + Stripe + Sentry + Upstash + KaTeX |
| `noesis-math` | Math-learning vertical product | Next.js 16 + React 19 + Supabase SSR + AJV |
| `noesis-delf` | French DELF-prep vertical product | Next.js 16 + React 19 + Supabase SSR + Stripe + Zod |
| `noesis-pilot` | Pilot operations CLI (sessions, replay, metrics) | Node + commander + Jest (no frontend) |
| `noesis-proof` | Truth-harness for engine determinism | Node + monorepo (no frontend) |
| `knowledgetracker-v1` | Independent flashcard product | Next.js + Express + Supabase + OpenAI |

Three problems with the current shape:

1. **Three forks of the engine.** BKT, FSRS, planner, mastery, session-state, logging, calibrator, and fatigue-detector code are duplicated across `noesis-eng/src/lib/noesis/`, `noesis-math/src/lib/noesis/`, and (likely) `noesis-delf/src/lib/noesis/`. Already named as debt in `noesis-math/athens/DECISIONS.md` D007.

2. **Three forks of the consumer surface.** Each vertical has its own auth, its own schema, its own design system, its own deployment. Three teams' worth of overhead for what should be one product with three subject packs.

3. **`noesis-core` is a monorepo accident.** `INTENTION.md:64` originally committed to a separate `noesis-mvp-demo` repo; reality drifted into `apps/server` + `apps/web-demo` colocated with the SDK. `PRODUCTION_READINESS.md:77–78` already calls this out.

This ADR resolves all three problems together.

---

## North Star Alignment

From `CORE_SDK_CONSTITUTION.md`:

> *Noesis is defined by **learning outcomes** (time-to-mastery, retention, transfer), NOT by engagement, content volume, auth, or UI.*

A unified consumer app makes the cognitive-state vector (NALS attention/recall/affect) **portable across subjects for the same learner**, which is the only way to measure cross-subject transfer — the hardest and most defensible learning outcome. Three separate apps fragment the signal the engine was designed to capture.

A unified app also gives A/B testing statistical power: one cohort × N learners has ~9× the power-per-arm of three cohorts × N/3 learners. Combined with the engine's deterministic replay, this enables **offline engine A/B** (replay every historical session under a parameter variant) — a uniquely Noesis capability that requires unified data.

---

## The Decision

**Build one consumer app — `noesis-app` — by renaming `noesis-pilot`, choosing Next.js 16 + React 19 + App Router + Supabase SSR + Drizzle on Supabase Postgres, loading subject curricula as versioned npm content-pack packages, with a clean shell/pack interface. Engine consolidation (Phase H) lands in `@noesis-edu/core` first; then `apps/server` + `apps/web-demo` extract from `noesis-core` into `noesis-app`; then `noesis-eng` / `noesis-math` / `noesis-delf` reduce to content packs and decommission as standalone apps.**

---

## Sub-decisions

### Sub-decision 1: Destination repo — rename `noesis-pilot` → `noesis-app`

**Decision:** Rename the existing `noesis-pilot` repo to `noesis-app`. The current pilot CLI moves to `noesis-app/packages/pilot-cli/` (or stays as a `bin` entry on the same package).

**Alternatives considered:**
- *Create fresh `noesis-app` repo.* Loses git history, requires fresh CI/CD setup, leaves `noesis-pilot` as an orphan. No upside.
- *Extract apps into a fresh `noesis-mvp-demo` (per original `INTENTION.md:64`).* The original name signals "demo," but the actual product is the pilot itself — naming it `noesis-app` reflects intent better.

**Consequences:**
- `noesis-pilot/lincoln-v1` workspace becomes the unified consumer app workspace.
- Cross-repo references to `noesis-pilot` (e.g., `noesis-pilot/lincoln-v1/README.md` architecture diagram) need updating.
- The pilot's existing CLI is preserved as a sub-package or bin script — nothing thrown away.

---

### Sub-decision 2: Frontend stack — Next.js 16 + React 19 + App Router + Supabase SSR

**Decision:** Standardize on Next.js 16.x, React 19.x, App Router, `@supabase/ssr`, Tailwind, Radix/shadcn-ui. Match the exact versions used by `noesis-eng` and `noesis-delf` so that pack components are interoperable across all three sources.

**Alternatives considered:**
- *Vite + React SPA + Express API* (current `noesis-core/apps/web-demo` shape). Loses SSR for SEO, requires hand-rolled Supabase session sync, two deploy artifacts, three apps would need rewriting (vs one). Rejected.
- *Remix.* Comparable to Next.js but smaller ecosystem and no team has used it. Rejected on cohort/familiarity grounds.
- *Astro with React islands.* Excellent for content-heavy / mostly-static sites; weaker fit for an interactive learning app with heavy client state. Rejected.

**Consequences:**
- `noesis-core/apps/web-demo` (Vite SPA) gets rewritten as Next.js App Router routes during the extraction. Tailwind config and Radix components carry over; React Router → file-based routing; TanStack Query stays.
- `noesis-core/apps/server` (Express) gets rewritten as Next.js Route Handlers, OR kept as a transitional separate Express service that Next.js calls. Recommend rewriting in-line during extraction — no transitional server.
- Passport+Drizzle session auth → Supabase Auth (sub-decision 3).
- Drizzle ORM stays (sub-decision 4).
- `noesis-eng`, `noesis-math`, `noesis-delf` Next.js codebases serve as the structural reference — copy patterns from them, don't fight them.

---

### Sub-decision 3: Auth — Supabase Auth (`@supabase/ssr`)

**Decision:** Supabase Auth with `@supabase/ssr` for cookie/session sync. Email+password and Google OAuth as initial providers. RLS-on-by-default for all tables holding learner data.

**Alternatives considered:**
- *Passport+Drizzle* (current `noesis-core/apps/server`). More code to maintain, no built-in OAuth ecosystem, manual session management. Rejected.
- *Clerk / Auth0.* Polished UX but adds a vendor + a per-MAU cost. Supabase already gives us auth + DB + RLS in one bill. Rejected on cost/lock-in.
- *NextAuth.js (Auth.js).* Solid choice but doesn't integrate with Supabase RLS cleanly without extra wiring. Rejected — Supabase native is simpler.

**Consequences:**
- Three apps (eng/delf/core) currently use three different auth setups; only one survives.
- Supabase RLS becomes the canonical access-control layer for per-learner data — code-level scoping (per `noesis-math/athens/DECISIONS.md` D006) remains as defense-in-depth.
- Session management becomes consistent across server components, route handlers, middleware.
- Migration of existing learners (if any) requires a one-time auth-export from old systems; Supabase supports bcrypt password import.

---

### Sub-decision 4: Database & ORM — Drizzle on Supabase Postgres

**Decision:** Postgres hosted on Supabase. Drizzle ORM for schema + queries. Single canonical schema in `noesis-app/db/schema.ts`. Drizzle migrations checked into git; `supabase/migrations/` for RLS policies that Drizzle doesn't model.

**Alternatives considered:**
- *Prisma.* Heavier, code-gen step, less portable than Drizzle. Rejected.
- *Supabase client SDK only (no ORM).* Loses type safety and migration discipline. Rejected.
- *Drizzle on Neon* (current `noesis-core` setup). Possible — Neon and Supabase Postgres are interchangeable at the wire level. But sub-decision 3 chose Supabase Auth, which works best with Supabase Postgres for RLS. Rejected.

**Consequences:**
- Unified schema replaces three vertical schemas + `noesis-core/shared/schema.ts`.
- `noesis-eng` / `noesis-math` / `noesis-delf` already use Supabase Postgres; their schemas merge into the unified one (likely as separate tables namespaced by pack).
- `noesis-core/apps/server`'s Drizzle schema and SQLite storage adapter are dropped during extraction.
- RLS policies live in `supabase/migrations/` because Drizzle doesn't model them. Tradeoff: RLS isn't fully type-checked. Mitigated by D006-style code-level scoping.

---

### Sub-decision 5: Pack interface — npm packages with a manifest spec

**Decision:** Each subject curriculum is a versioned npm package (`@noesis-content/math-br`, `@noesis-content/eng`, `@noesis-content/delf-fr`) exporting a `PackManifest` conforming to a schema published in `@noesis-edu/core/contracts`. The shell loads packs at runtime via dynamic import or a configured pack registry.

**Pack manifest contract (sketch):**

```ts
interface PackManifest {
  id: string;              // "math-br", "delf-a1", etc.
  version: string;         // semver
  locale: string;          // "pt-BR", "fr-FR"
  skillGraph: SkillGraphJSON;
  items: ItemBank;
  uiOverrides?: {          // optional pack-specific UI
    skillCard?: ComponentRef;
    itemRenderer?: ComponentRef;
  };
  config: {
    bktPriors?: Partial<BKTConfig>;
    fsrsWeights?: Partial<FSRSConfig>;
    masteryThreshold?: number;
  };
}
```

**Alternatives considered:**
- *In-repo static JSON.* Easier to start; loses versioning, signing, and the ability for third parties to publish packs. Rejected — moat depends on packs being a real ecosystem.
- *CDN-hosted JSON with a registry API.* More flexible for hot-swapping packs without redeploys; adds infra. Defer to v2; v1 ships with bundled npm packages.
- *Remote MDX / CMS-driven content.* Too far from deterministic-replay guarantees. Rejected.

**Consequences:**
- `noesis-core/packages/content-pt-br-math` is the pattern; rename to `@noesis-content/math-br` and version it.
- `noesis-eng` and `noesis-delf` content (currently mixed into the app code) gets extracted into pack packages.
- The shell app stays subject-agnostic; all subject-specific knowledge lives in packs.
- Third-party pack authors become possible (open-source ecosystem moat).
- Replay tooling (`noesis-proof`) needs to record `packId@version` per session for full determinism.

---

### Sub-decision 6: Shell vs. pack boundary

**Decision:**

| Layer | Owns |
|-------|------|
| **Shell (noesis-app)** | Auth, navigation, subject picker, learner profile, mentor dashboard, admin tooling, billing, notifications, settings, layout, design system, i18n framework, analytics, error reporting |
| **Pack** | Skill graph, items, locale strings, optional pack-specific UI components (e.g., math equation renderer, audio player for language packs), pack-specific BKT/FSRS overrides |
| **`@noesis-edu/core`** | Engine: skill graph DAG, BKT, FSRS, planner, mastery, session-state, deterministic event log, replay |

The interface between shell and pack is the `PackManifest` (sub-decision 5) plus a small `PackUIRegistry` for component overrides.

**Alternatives considered:**
- *Pack-owns-routes (each pack registers its own /math, /eng, /delf routes).* More flexibility, less consistency. Rejected — shell-owns-routing keeps UX coherent across packs.
- *Shell-owns-everything (packs are pure data).* Simplest, but blocks pack-specific UX (KaTeX rendering for math, audio for languages). Rejected — small UI extension surface is worth the complexity.

**Consequences:**
- Shell development and pack development are decoupled — parallel work possible.
- Pack-specific UI components ship in the pack package, lazy-loaded by the shell.
- Adding a new subject becomes "publish a new pack package" — no shell changes required for default cases.
- Third parties can build packs without forking the app.

---

### Sub-decision 7: Engine consolidation timing — Phase H runs *before* the merge

**Decision:** Centralize the duplicated engine code (BKT, FSRS, planner, mastery, session-state, logging, calibrator, fatigue-detector) into `@noesis-edu/core` *before* extracting/merging the apps. `noesis-eng/src/lib/noesis/` and `noesis-math/src/lib/noesis/` become re-exports, then deletions.

**Alternatives considered:**
- *Phase H after the merge.* Means three engine forks land in one app and we deduplicate inside the new repo, with all three vertical's tests entangled. Higher risk. Rejected.
- *Skip Phase H; let the unified app pick one fork.* The picked fork has subject-specific assumptions baked in (`noesis-math` has math-item-specific BKT priors); other packs would inherit those. Rejected — packs should configure engine, not fork it.

**Consequences:**
- Phase H lands as a coordinated cross-repo PR series: `@noesis-edu/core` 0.3.0 publishes the consolidated engine; `noesis-eng`/`noesis-math`/`noesis-delf` each upgrade and delete their `src/lib/noesis/` copies.
- Subject-specific behavior (math fraction equivalence, French audio normalization) stays per-pack — moves into pack code, not engine.
- Adds 2–3 weeks before app extraction can start.
- Pays back the time during extraction (no engine merge conflicts) and forever after (one bug fix, not three).

---

### Sub-decision 8: Pilot continuity — none currently running, no transition needed

**Decision:** No live pilot currently running (per founder confirmation 2026-05-03). The rename `noesis-pilot` → `noesis-app` and the consumer-shell construction proceed without transition constraints.

**Alternatives considered:** N/A.

**Consequences:**
- The pilot CLI in `noesis-pilot/lincoln-v1` is preserved as `noesis-app/packages/pilot-cli/` (renamed import path) but no operational handoff is needed.
- Future pilot runs use the new unified app's session-recording → `noesis-proof` replay → metrics pipeline.

---

## Inventory: What Each App Contributes

| Source | Bring forward | Drop |
|--------|---------------|------|
| `noesis-core/apps/web-demo` | Diagnostic placement quiz, prereq-gated path UI, per-skill canonical loop UI, mentor dashboard, admin curriculum editor, i18n (pt-BR/en-US), Radix/Tailwind design tokens | Vite bundling, React Router, Replit plugins, Passport auth |
| `noesis-core/apps/server` | API surface design, OpenAPI spec, engine state replay endpoint, RLS-style scoping discipline | Express, Passport, Drizzle-on-Neon/SQLite, session middleware |
| `noesis-eng` | Production hardening: Sentry, Upstash rate limiting, Playwright e2e, axe-core a11y tests, ServiceWorker/PWA, sitemap, design-tokens.css, KaTeX math rendering, Stripe billing, offline page, analytics styling | Duplicated engine code (deleted in Phase H) |
| `noesis-math` | AJV pack-manifest validation, math-pack content (graph + items) | Duplicated engine code (deleted in Phase H), bare-bones UI (replaced by shell) |
| `noesis-delf` | Zod validation patterns, db:seed script, French/DELF pack content (graph + items) | Duplicated engine code (deleted in Phase H), Stripe (consolidate with eng's Stripe setup) |
| `noesis-pilot` | Session-recording CLI, replay pipeline, metrics aggregation | Standalone repo identity (becomes `noesis-app/packages/pilot-cli/`) |
| `noesis-proof` | Stays as-is (private truth harness consuming `@noesis-edu/core`) | Nothing — no merge |

---

## Migration Plan (phased)

### Phase 1 — Engine Consolidation (Phase H)
*Estimated: 4–5 weeks. Owner: noesis-core repo + cross-repo PR series.*
*Detailed plan: `docs/architecture/PHASE_H_DIVERGENCE_LOG.md` (sub-phases H-1 through H-5).*

1. **H-1 (~1.5–2 weeks):** Pull universal-but-missing modules into `@noesis-edu/core@0.3.0-rc`: `MultiChannelBKTEngine`, `LayeredMasteryModel`, `BudgetedSessionPlanner`, `SessionLifecycleManager`, `OptimisticLockingStateStore`, `SessionMetricsLogger`, `PlannerSnapshot`, `ItemHistoryAggregator`, `FatigueDetector`, `EloDifficultyCalibrator`, `AnswerNormalizer` interface, `EngineConfigOverrides` type.
2. **H-2 (~2–3 days):** Push-down delf first as lowest-risk reference migration; validates new core API.
3. **H-3 (~1 week):** Push-down math (replace 9 service files with core imports; move math-specific to `@noesis-content/math-br`).
4. **H-4 (~1.5 weeks):** Push-down eng (highest divergence; replace 9 service files; move English contractions/grammar regex/etc. to `@noesis-content/eng`).
5. **H-5:** Promote `0.3.0-rc` to stable; downstream consumers (eng/math/delf, `noesis-proof`, `open-source-logic-v1`, planned `knowledgetracker-v1`) update pinned version.

**Verification:** replay-equivalence tests in `noesis-proof/adelaide` confirm identical pMastery/FSRS sequences pre- and post-migration; all existing test suites pass; no new behavior change in delf.

### Phase 2 — Establish `noesis-app` Skeleton
*Estimated: 1 week. Owner: renamed noesis-pilot repo.*

1. Rename `noesis-pilot` repo → `noesis-app` (GitHub rename preserves history + redirects).
2. Move pilot CLI to `packages/pilot-cli/`; expose as `bin`.
3. Scaffold Next.js 16 app at root with Tailwind, Radix, Supabase SSR, Drizzle, TypeScript strict.
4. Set up CI (Playwright + Vitest + axe + ESLint).
5. Set up Supabase project (auth + Postgres) for staging and prod.

### Phase 3 — Extract `noesis-core`'s Apps
*Estimated: 2–3 weeks. Owner: noesis-core + noesis-app.*

1. Port `apps/web-demo` Vite routes to Next.js App Router routes in `noesis-app`.
2. Port `apps/server` Express routes to Next.js Route Handlers.
3. Port shared/schema.ts to Drizzle schema in `noesis-app/db/schema.ts`.
4. Replace Passport auth with Supabase Auth.
5. Migrate i18n (pt-BR/en-US).
6. In `noesis-core`: delete `apps/`, `shared/`, `Dockerfile`, `docker-compose.yml`, `vercel.json`, `vite.config.ts`, `drizzle.config.ts`, root-level UI deps. Update `package.json` to remove `apps/*` workspace and trim deps.
7. Verification: `noesis-core` `apps/` folder does not exist (per `PLAN.md` Phase K2 verification test).

### Phase 4 — Reduce Verticals to Content Packs
*Estimated: 3–4 weeks. Owner: noesis-eng, noesis-math, noesis-delf repos.*

1. In each vertical: extract the content (skill graph + items + locale strings) into a `@noesis-content/<id>` package conforming to `PackManifest`.
2. Move pack-specific UI (KaTeX renderer for math, audio player for languages) into the pack package as React components.
3. Publish content packages to npm.
4. In `noesis-app`: install pack packages, register them with the pack registry, verify rendering.
5. Decommission the standalone Next.js apps in `noesis-eng` / `noesis-math` / `noesis-delf` — these repos become "pack source repos" only (or merge into a single `noesis-content` monorepo — defer this decision).

### Phase 5 — Harden & Launch
*Estimated: 2–3 weeks. Owner: noesis-app.*

1. Port production hardening from `noesis-eng`: Sentry, Upstash rate limiting, ServiceWorker, sitemap, axe a11y tests.
2. Port Stripe billing (consolidate eng + delf setups).
3. Wire mentor dashboard + admin tooling from old `noesis-core/apps/web-demo`.
4. Run full Playwright e2e suite across all packs.
5. Soft launch with pilot cohort.

**Total estimated calendar time: 10–14 weeks** assuming one focused contributor + agent-parallelization across repos.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Engine consolidation reveals undocumented divergence between vertical engines | Medium | High | Diff before merging; capture every divergence as a `PackConfig` override or a deliberate engine extension; keep the diff in a `PHASE_H_DIVERGENCE_LOG.md`. |
| Supabase RLS misconfiguration leaks cross-tenant data | Low | Critical | Defense-in-depth: keep code-level scoping per D006; add the regression-test pattern from `noesis-math` D006; require RLS policy review on every schema PR. |
| `@noesis-edu/core` breaking changes during Phase H break downstream consumers (`noesis-proof`, `open-source-logic`, `knowledgetracker-v1`'s planned integration) | Medium | Medium | Major-version bump (0.2.0 → 0.3.0); deprecation warnings on removed APIs; coordinated upgrade PRs in `noesis-proof` and `noesis-eng`/`-math`/`-delf` before publishing. |
| Pack-specific UI components diverge in look/feel from shell | Medium | Low | Ship a `@noesis-app/ui` design-system package that packs depend on for primitives; document required theme tokens in `PackManifest.uiOverrides` contract. |
| Vite-to-Next.js port introduces regressions in mentor/admin features | High | Medium | Port behind a feature flag; keep `noesis-core/apps/web-demo` runnable in parallel until the Next.js version passes Playwright parity tests. |
| Pricing model gets baked into Stripe configs before being decided (sub-decision deferred per founder) | High | Medium | Build billing as a Stripe-abstracted service layer; defer pricing-tier definitions until founder decision. |

---

## Open Questions

1. **Domain strategy.** ✅ **RESOLVED 2026-05-03:** root-with-paths — `noesis.app/math`, `noesis.app/eng`, `noesis.app/delf`. Shared brand equity; one analytics surface; one SSL/domain ops story. Per-subject subdomains revisitable if a vertical ever needs a distinct identity.

2. **Content monorepo vs separate pack repos.** After Phase 4 the `noesis-eng` / `noesis-math` / `noesis-delf` repos are reduced to pack sources. Merge into `noesis-content` monorepo, or keep separate? Lean: keep separate so each pack has its own release cadence and contributor set. Revisit if cross-pack coordination becomes painful.

3. **Pack discovery / registry.** Is there a runtime pack registry (`/api/packs` returning available packs) or are packs hard-coded into the shell's package.json? Lean: hard-coded for v1 (one team, three packs); registry for v2 when third-party packs become real.

4. **Mobile.** ✅ **RESOLVED 2026-05-03:** Next.js → PWA covers mobile browser (offline + installable). Native iOS/Android (React Native, Capacitor, or native SDKs) is **deferred out of v1**. Mobile browser users get the full experience via responsive Next.js + PWA.

5. **`knowledgetracker-v1` and `open-source-logic-v1`.** ✅ **DEFERRED 2026-05-03:** they remain standalone consumers of `@noesis-edu/core` for now; revisit pack-vs-standalone positioning after the unified app launches.

6. **Pricing model.** Founder explicitly deferred. The migration plan builds Stripe as an abstraction so any model can plug in.

---

## Cross-References

- `noesis-core/abuja-v1/INTENTION.md:64` — original commitment to separate `noesis-mvp-demo` repo.
- `noesis-core/abuja-v1/INTENTION.md:54` — open-core split: SDK + adapters open, orchestration/analytics/enterprise proprietary. This ADR is consistent.
- `noesis-core/abuja-v1/PLAN.md:461–478` — Phase K Path A/B framing. **This ADR resolves Phase K in favor of Path A** with the addition that the destination repo is `noesis-pilot` renamed (not a fresh `noesis-mvp-demo`).
- `noesis-core/abuja-v1/PRODUCTION_READINESS.md:77–78, 148–150` — same Path A/B framing; off-charter monorepo critique.
- `noesis-core/abuja-v1/docs/architecture/CORE_SDK_CONSTITUTION.md` — defines what stays in `@noesis-edu/core`. This ADR reinforces.
- `noesis-math/athens/DECISIONS.md` D007 — Phase H engine centralization. **This ADR re-times Phase H from "deferred until natural occasion" to "before the app merge" because the app merge IS the natural occasion.**
- `noesis-math/athens/DECISIONS.md` D006 — code-level user scoping. **This ADR adopts D006 as the cross-app discipline; RLS is defense-in-depth, not a substitute.**
- `noesis-pilot/lincoln-v1/README.md:9–17` — current pilot architecture diagram. Diagram needs updating after rename: `noesis-pilot` → `noesis-app`.

---

## Ratification

This ADR is **Proposed** until the founder accepts. Once accepted:
- Move status to **Accepted** with date.
- Create a tracking issue in `noesis-core` (or new `noesis-app`) titled "Execute UNIFICATION_ADR".
- Mirror this ADR (or a link to it) into `noesis-pilot/lincoln-v1/README.md` so the destination repo carries the plan.
