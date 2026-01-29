# STATUS.md

> Last updated: 2026-01-29

## What This Repo Is

- **@noesis-edu/core**: Portable learning engine (BKT + FSRS + session planning)
- **apps/server**: Express backend with auth, persistence, LLM orchestration
- **apps/web-demo**: React demo app for testing core SDK

## In-Scope for v1 Wedge

- Core SDK: skill graph, BKT mastery, FSRS scheduling, session planner
- Persistence adapter interface (`NoesisStateStore`)
- JSON graph loader (`loadSkillGraphFromJSON`)
- Metrics extraction (`getLearnerMetrics`)
- Default session config (`DEFAULT_SESSION_CONFIG`)

## Out-of-Scope Until After Wedge Validation

- Attention tracking / gaze integration
- LLM-driven content generation
- Voice interface
- XR/VR support
- Multi-tenant auth
- Analytics dashboards
- Event schema migrations (v1→v2)
- YAML graph format

## Unimplemented Features

The following features are declared in interfaces or mentioned in documentation but **not yet implemented**:

| Feature | Location | Status |
|---------|----------|--------|
| XR/VR Support | `packages/adapters-attention-web/README.md` | Placeholder only — no implementation |
| Voice Interface | `packages/adapters-llm/README.md` | Placeholder only — no implementation |
| Local LLM Inference | `packages/adapters-llm/README.md` | Placeholder only — no implementation |
| WebGazer Attention | `packages/adapters-attention-web` | Partial — needs calibration improvements |
| Transfer Gate Persistence | `packages/core/src/transfer` | In-memory only — no persistence adapter |
| Diagnostic Engine Persistence | `packages/core/src/diagnostic` | In-memory only — no persistence adapter |

These are intentionally deferred until after v1 wedge validation. See `// UNIMPLEMENTED:` comments in code for details.

## Maturity

| Component | Status |
|-----------|--------|
| `@noesis-edu/core` | **Ready** — comprehensive tests, deterministic, zero deps |
| `apps/server` | **Hardened** — auth, CSRF, rate limiting, security headers |
| `apps/web-demo` | **Ready** — smoke test UI works |

## Security Status

Recent security audit completed:

- ✅ XSS vulnerability in CodeBlock fixed (safe rendering)
- ✅ Unprotected analytics endpoints now require auth
- ✅ WebSocket authentication hardened
- ✅ Default user ID fallback removed
- ✅ Helmet security headers added
- ✅ Password complexity requirements added
- ✅ CSRF protection implemented
- ✅ Session secret production warning added

## Next Steps

1. ~~Add persistence adapter and graph loader~~ ✅ Done
2. ~~Add getLearnerMetrics for proof extraction~~ ✅ Done
3. ~~Improve DEFAULT_SESSION_CONFIG discoverability~~ ✅ Done
4. ~~Security audit and hardening~~ ✅ Done
5. **Freeze for 3–6 months** — build wedge app against stable core
