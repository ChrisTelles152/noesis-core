# STATUS.md

> Last updated: 2026-01-19

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

## Maturity

| Component | Status |
|-----------|--------|
| `@noesis-edu/core` | **Ready** — 80 tests, deterministic, zero deps |
| `apps/server` | Needs fixes — not required for v1 wedge |
| `apps/web-demo` | Ready — smoke test UI works |

## Next Steps

1. ~~Add persistence adapter and graph loader~~ ✅ Done
2. ~~Add getLearnerMetrics for proof extraction~~ ✅ Done
3. ~~Improve DEFAULT_SESSION_CONFIG discoverability~~ ✅ Done
4. **Freeze for 3–6 months** — build wedge app against stable core
