# Changelog

All notable changes to `@noesis-edu/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-01-04

### Added

- **SkillGraph**: DAG-based skill representation
  - Cycle detection with topological ordering (Kahn's algorithm)
  - Prerequisite traversal (`getAllPrerequisites`, `getDependents`)
  - Graph validation with detailed error reporting

- **BKTEngine**: Bayesian Knowledge Tracing learner model
  - Research-backed BKT update algorithm
  - Known numeric expectations (pMastery ≈ 0.6927 after one correct response with defaults)
  - Serialization/deserialization for persistence
  - `initializeFromDiagnostic` for cold-start placement

- **FSRSScheduler**: FSRS-style spaced repetition
  - Retention calculation: R(t) = (1 + t/(9*S))^(-1)
  - Interval scheduling based on target retention
  - State tracking (new, learning, review, relearning)

- **DiagnosticEngine**: Cold-start diagnostic assessment
  - Deterministic item selection based on skill graph topology
  - Mastery estimation from diagnostic responses
  - Prerequisite-aware estimate propagation

- **TransferGate**: Near/far transfer test gating
  - Configurable near/far transfer requirements
  - Skill unlocking based on passed tests

- **SessionPlanner**: Deterministic session planning
  - Priority-based action selection
  - Due review enforcement
  - Error-focused practice targeting
  - Leverage gap (highest impact skill) targeting

- **NoesisCoreEngine**: Unified engine interface
  - Event processing pipeline
  - State management
  - **Deterministic replay**: `replayEvents(eventLog)` produces identical state
  - Export/import for persistence

- **Event System**: Canonical event schema
  - `PracticeEvent`, `DiagnosticEvent`, `TransferTestEvent`, `SessionEvent`
  - Deterministic event factories with injected clock and ID generator
  - `createDeterministicIdGenerator` for replay/testing

### Design Principles

- **Dependency-free**: Pure TypeScript, no external runtime dependencies
- **Deterministic**: Same inputs always produce same outputs
- **Replayable**: All decisions reproducible from event log + config + clock
- **Inspectable**: All internal state can be examined and logged

### Testing

- 46 comprehensive tests covering all modules
- Replay determinism verified with `getNextAction` sequence matching
- Known numeric expectations verified (BKT update calculations)
