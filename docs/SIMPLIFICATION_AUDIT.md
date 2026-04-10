# Simplification Audit — Noesis Core

## Executive Summary

The noesis-core repository contains substantial over-engineering for a 10–20 user pilot. Approximately **3,500–4,000 lines of code** can be deleted outright, and another **1,500+ lines** can be significantly simplified. The primary sources of unnecessary complexity are: (1) a full web-demo app with ~1,200 lines of duplicated SDK code, (2) enterprise-grade infrastructure (performance monitoring, Kubernetes health probes, OpenAPI spec, WebSocket server with 1000-client DoS protection), and (3) three storage backends when one (SQLite) would suffice. The core learning engine (`packages/core`) is well-designed and should be left untouched.

**SECURITY ALERT**: `ecosystem.config.cjs` contains hardcoded API keys and a session secret committed to the repository. This must be addressed immediately regardless of simplification decisions.

## Recommended Deletions

| File/Module | Lines | Rationale | Risk | Action |
|---|---|---|---|---|
| `apps/web-demo/src/sdk/attention.ts` | 410 | Near-identical copy of `packages/adapters-attention-web/src/attention.ts` (package version has improvements) | Low — web-demo should import from package | Delete, import from `@noesis/adapters-attention-web` |
| `apps/web-demo/src/sdk/mastery.ts` | 218 | Identical copy of `packages/sdk-web/src/policies/mastery.ts` (only import path differs) | Low | Delete, import from `@noesis/sdk-web` |
| `apps/web-demo/src/sdk/orchestration.ts` | 170 | Identical copy of `packages/adapters-llm/src/orchestration.ts` | Low | Delete, import from `@noesis/adapters-llm` |
| `apps/web-demo/src/sdk/webgazer-adapter.ts` | 255 | Byte-for-byte identical to `packages/adapters-attention-web/src/webgazer-adapter.ts` | None | Delete, import from package |
| `apps/web-demo/src/sdk/types.ts` | 118 | Near-identical to `packages/sdk-web/src/types.ts` (package has additions) | Low | Delete, import from `@noesis/sdk-web` |
| `apps/web-demo/src/sdk/webgazer.d.ts` | 35 | Duplicate type declaration already in `packages/adapters-attention-web/src/webgazer.d.ts` | None | Delete |
| `apps/server/performance.ts` | 343 | Full p50/p95/p99 per-endpoint tracking, `RateLimitTracker` class, `Timer` utility — all unused at pilot scale. Express already has the `express-rate-limit` middleware for rate limiting. No code currently reads performance stats except the restricted `/api/performance/stats` endpoint. | Low — only removes monitoring, not functionality | Delete entirely |
| `apps/server/openapi.ts` | 484 | 440-line static JSON spec + Swagger UI HTML page. Not consumed by any client code, no code generation depends on it. Can be regenerated from route definitions if needed later. | Low — documentation only | Delete; document API in `API.md` instead |
| `attached_assets/` (3 files) | 305 | Pasted planning documents from early ideation. Historical only, not referenced by code. | None | Delete directory |
| `ecosystem.config.cjs` | 18 | PM2 config with **hardcoded secrets** (SESSION_SECRET, OPENAI_API_KEY). If using Docker/SQLite deployment, PM2 is redundant. Even if kept, secrets must never be in source. | **Critical security risk if kept** | Delete; use Docker or systemd instead |
| `apps/web-demo/src/sdk/NoesisSDK.ts` | 73 | Thin wrapper that duplicates `packages/sdk-web/src/NoesisSDK.ts` | Low | Delete, import from package |
| **Subtotal** | **~2,430** | | | |

## Recommended Simplifications

### 1. Storage Backends — Consolidate to SQLite (~200 lines saved)

**Current state**: Three backends — `MemStorage` (in `storage.ts`, ~75 lines), `DatabaseStorage` (in `storage.ts`, ~65 lines), `SqliteStorage` (in `sqlite-storage.ts`, ~190 lines) — plus a factory with Proxy-based lazy initialization, DI configuration, and PostgreSQL connection setup (`db.ts`, 19 lines).

**Recommendation**: For a 10–20 user pilot, SQLite is sufficient and already implemented. Remove `MemStorage` and `DatabaseStorage` classes, the `db.ts` PostgreSQL connection, the storage factory/Proxy/DI pattern, and the `drizzle.config.ts` file. Make `SqliteStorage` the only backend, instantiated directly.

**Risk**: Medium — removes PostgreSQL path. Keep the `IStorage` interface so PostgreSQL can be re-added later without changing consumers.

**Lines saved**: ~200 (MemStorage + DatabaseStorage + db.ts + factory/proxy logic)

### 2. Health Check System — Reduce to Single Endpoint (~200 lines saved)

**Current state**: `health.ts` (253 lines) implements 4 endpoints: `/health/live`, `/health/ready`, `/health`, `/health/metrics` with Kubernetes-style liveness/readiness probes, event loop lag detection, memory usage tracking, and internal-access IP restriction middleware.

**Recommendation**: Replace with a single `GET /health` endpoint that returns `{ status: "ok" }`. The `requireInternalAccess` middleware is reused by the performance endpoint (which we're deleting), so it can go too.

**Risk**: Low — no Kubernetes deployment planned for pilot.

**Lines saved**: ~220 (keep ~30 for a simple health check)

### 3. WebSocket Server — Simplify Dramatically (~350 lines saved)

**Current state**: `websocket.ts` (514 lines) implements a full pub/sub system with subscription channels, heartbeat monitoring, DoS protection for 1000 clients, session-based authentication, broadcast to specific users, and a DI singleton pattern.

**Recommendation**: For 10–20 users, reduce to: connect, authenticate from session cookie, and send/receive JSON messages. Remove subscription channel system, the 1000-client DoS protection, the heartbeat interval, and the singleton/Proxy pattern. Alternatively, remove WebSocket entirely if the pilot app uses HTTP polling (evaluate whether real-time updates are actually needed).

**Risk**: Medium — if the pilot needs real-time attention updates. Evaluate actual usage first.

**Lines saved**: ~350 (simplify to ~160 lines)

### 4. CSRF Protection — Simplify (~100 lines saved)

**Current state**: `csrf.ts` (171 lines) implements HMAC-signed synchronizer tokens with timing-safe comparison.

**Recommendation**: For a first-party SPA consumed by 10–20 known users, CSRF protection via `SameSite=Strict` cookies (already set) is sufficient. The HMAC token system adds complexity to every API call from the frontend. If keeping CSRF, the implementation is solid — but consider whether it's needed for the pilot.

**Risk**: Medium — removing a security layer. `SameSite=Strict` + CORS provides reasonable protection for a first-party SPA.

**Lines saved**: ~100 if removed, 0 if kept

### 5. Rate Limiting — Reduce to Single Tier (~30 lines saved)

**Current state**: `index.ts` defines 4 separate rate limiters: general API (100/15min), LLM endpoints (10/min), auth endpoints (10/15min), and username-check (10/min).

**Recommendation**: For 20 users, a single rate limiter on `/api/` is sufficient. The LLM rate limiter has value (prevents cost overruns), so keep that one. Remove auth and username-check specific limiters.

**Risk**: Low — brute force isn't a real concern with 20 known pilot users.

**Lines saved**: ~30

### 6. Request ID Middleware — Optional Removal (~50 lines saved)

**Current state**: `middleware/requestId.ts` (50 lines) generates unique IDs for request tracing.

**Recommendation**: Nice for debugging but adds overhead to every request. Not needed at pilot scale where you can reproduce issues locally. Can remove if simplifying aggressively.

**Risk**: Low — convenience feature only.

### 7. Middleware Validation Utilities — Keep but Note Unused

**Current state**: `middleware/validation.ts` (103 lines) provides `validateBody`, `validateQuery`, `validateParams` middleware factories and `commonSchemas` (pagination, ID params, date ranges).

**Observation**: The `commonSchemas` and `validateParams`/`validateQuery` are not used by any route. Routes do inline Zod validation instead. The middleware pattern is good architecture but currently unused.

**Recommendation**: Keep for now — it's clean code that will be useful when adding routes. But note that `commonSchemas` is dead code.

### 8. Docker/docker-compose — Simplify for SQLite (~30 lines)

**Current state**: `docker-compose.yml` (90 lines) defines PostgreSQL + dev server + production server services. `Dockerfile` (73 lines) has multi-stage build.

**Recommendation**: If consolidating to SQLite, the PostgreSQL service and its volume can be removed from `docker-compose.yml`. The Dockerfile is fine as-is.

**Risk**: Low — PostgreSQL already optional.

## Keep As-Is

| Module | Lines | Why Keep |
|---|---|---|
| `packages/core/` (all) | ~2,500 | Zero-dependency, well-tested learning engine. This is the core product. The BKT, FSRS, session planner, skill graph, diagnostic engine, and transfer gate are all integral to the adaptive learning value proposition. |
| `packages/adapters-llm/` | ~815 | Multi-provider LLM abstraction is genuinely useful. The fallback provider ensures the app works without API keys. Total code is reasonable. |
| `packages/adapters-attention-web/` | ~798 | WebGazer integration is a differentiating feature. Package is clean. |
| `packages/sdk-web/` | ~500 | Web SDK facade is well-structured and ties core + adapters together. |
| `apps/server/auth.ts` | 502 | Authentication with Passport.js, Google OAuth, session management. All needed for the pilot. |
| `apps/server/middleware/sanitize.ts` | 172 | Input sanitization with prototype pollution protection. Good security practice, low overhead. |
| `apps/server/logger.ts` | 319 | Structured logging is valuable even at small scale for debugging. |
| `apps/server/errors.ts` | 88 | Error code constants and factory. Small and useful. |
| `apps/server/env.ts` | 246 | Environment validation. Catches misconfiguration early. Worth keeping. |
| `shared/schema.ts` | 118 | Drizzle ORM schema. Even if dropping PostgreSQL for now, keeps the door open. Could be simplified but risk isn't worth the savings. |
| Helmet (security headers) | N/A | 20 lines of config in `index.ts`. Essential security layer, zero complexity cost. |
| `apps/web-demo/` (non-SDK) | ~8,200 | The web-demo UI components, pages, hooks are presumably the pilot frontend or its prototype. Only the `/sdk/` directory contains duplicated code. |

## Dependency Cleanup

| Package | Type | Rationale | Action |
|---|---|---|---|
| `@neondatabase/serverless` | dependency | Only used by `db.ts` for PostgreSQL via Neon. If dropping PG backend. | Remove if consolidating to SQLite |
| `connect-pg-simple` | dependency | PostgreSQL session store. Not needed with SQLite/memory sessions. | Remove if consolidating to SQLite |
| `drizzle-orm`, `drizzle-zod` | dependency | ORM for PostgreSQL. Used only by `shared/schema.ts` and `storage.ts`. | Remove if consolidating to SQLite |
| `drizzle-kit` | devDependency | Migration tool for Drizzle/PostgreSQL. | Remove if consolidating to SQLite |
| `@replit/vite-plugin-cartographer` | devDependency | Replit-specific Vite plugin. Not needed outside Replit. | Remove |
| `@replit/vite-plugin-runtime-error-modal` | devDependency | Replit-specific Vite plugin. | Remove |
| `webgazer` | dependency | Listed in root `package.json` AND in `packages/adapters-attention-web/package.json`. Dual listing is unnecessary. | Remove from root, keep in adapter package |
| `openai` | dependency | Listed in root `package.json` AND in `packages/adapters-llm/package.json`. Same duplication issue. | Remove from root, keep in adapter package |
| `cmdk` | dependency | Command menu component. Check if used in web-demo. | Verify usage; remove if unused |
| `input-otp` | dependency | OTP input component. Not obviously used. | Verify usage; remove if unused |
| `embla-carousel-react` | dependency | Carousel component. Not obviously used. | Verify usage; remove if unused |
| `react-resizable-panels` | dependency | Resizable panel component. Check if used. | Verify usage; remove if unused |
| `vaul` | dependency | Drawer component. Check if used. | Verify usage; remove if unused |
| `next-themes` | dependency | Theme switching for Next.js (this is NOT a Next.js app). | Likely unused — verify and remove |
| `react-day-picker` | dependency | Date picker component. Check if used. | Verify usage; remove if unused |

**Estimated removable dependencies**: 8–12 packages, which would reduce `node_modules` size and install time.

## Configuration Cleanup

| File | Lines | Status | Action |
|---|---|---|---|
| `tsconfig.json` | ~30 | Root TypeScript config. Required. | Keep |
| `vite.config.ts` | ~30 | Vite build config. Required. | Keep |
| `vitest.config.ts` | ~30 | Test runner config. Required. | Keep |
| `eslint.config.js` | ~30 | Linting config. Required. | Keep |
| `.prettierrc` + `.prettierignore` | ~10 | Formatting config. Required. | Keep |
| `postcss.config.js` | ~5 | PostCSS for Tailwind. Required if using Tailwind. | Keep |
| `tailwind.config.ts` | ~30 | Tailwind CSS config. Required if using Tailwind. | Keep |
| `drizzle.config.ts` | 15 | Drizzle ORM migration config for PostgreSQL. | Remove if consolidating to SQLite |
| `components.json` | 20 | shadcn/ui config pointing to `client/src/index.css` (wrong path — should be `apps/web-demo/src/index.css`). | Fix path or remove if not using shadcn CLI |
| `ecosystem.config.cjs` | 18 | PM2 config with **HARDCODED SECRETS**. | **Delete immediately** — secrets in source |
| `.replit` | ~5 | Replit-specific config. Not needed outside Replit. | Remove |

## Summary of Estimated Savings

| Category | Lines Deletable | Lines Simplifiable |
|---|---|---|
| Duplicate SDK code in web-demo | ~1,280 | — |
| Performance monitoring | 343 | — |
| OpenAPI spec | 484 | — |
| Attached assets | 305 | — |
| ecosystem.config.cjs | 18 | — |
| Storage backends (Mem + PG) | — | ~200 |
| Health checks | — | ~220 |
| WebSocket server | — | ~350 |
| CSRF protection | — | ~100 (if removed) |
| Rate limiting tiers | — | ~30 |
| Request ID middleware | — | ~50 |
| **Total** | **~2,430** | **~950** |

**Grand total**: ~3,380 lines of code can be removed or simplified, representing roughly 17% of the non-test, non-documentation codebase. This would make the remaining code more navigable and reduce the surface area for bugs during the pilot.
