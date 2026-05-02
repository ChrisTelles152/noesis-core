# Changelog

All notable changes to `@noesis-edu/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase A — Determinism contract (breaking)

- **`clock` and `idGenerator` are now required** on every public engine
  constructor and factory (`NoesisCoreEngineImpl`, `BKTEngine`,
  `FSRSScheduler`, `createNoesisCoreEngine`, `createBKTEngine`,
  `createFSRSScheduler`, `createEventFactoryContext`). Forgetting them
  throws — no silent `Date.now()` / `Math.random()` leak.
- New factory `createSystemEngine(graph, config?)` — explicit opt-in to
  system clock + `crypto.randomUUID()`. Non-replayable by design;
  documented as such.
- New runtime guards `requireClock()` / `requireIdGenerator()` exported
  from `events/`. Used internally by every constructor; available for
  consumers who need the same guarantee in their own code.
- Snapshot version stays `1.0.0`-compatible for state from previous core
  releases (no schema change in this phase).

### Phase C — NALS Cognitive-State Vector + canonical 5-stage learning loop

- New types: `CognitiveStateMeasurement`, `CognitiveStateVector`,
  `CognitiveStateEvent`, `StageCompletedEvent`, `CanonicalStage`.
- New event factories: `createCognitiveStateEvent`,
  `createStageCompletedEvent`.
- `NoesisEvent` union extended with `cognitive_state` and
  `stage_completed`.
- `PracticeEvent` gains optional `stage?: 'practice' | 'application'`
  (default `'practice'`).
- `SessionAction.type` extended with `'concept_introduction'`,
  `'application'`, `'reflection'`.
- `SessionConfig` gains `enforceCanonicalLoop?: boolean` (default off):
  when set, the planner emits `concept_introduction` for new skills and
  gates `transfer_test` on all four stages being recorded.
- New engine accessors: `getCognitiveState(learnerId)`,
  `getCognitiveStateHistory(learnerId)`,
  `getStageHistory(learnerId, skillId)`.
- Snapshot version bumps from `1.0.0` → `1.3.0` (1.2 added cognitive
  states, 1.3 added stage history). `importState` tolerates pre-1.2 /
  pre-1.3 snapshots — missing fields treated as empty.

### Tests

- Suite grew from 241 core tests at v0.1.0 to 350+ across 18 core test
  files. New gates: `determinism.test.ts` (Phase A), `replay.test.ts`
  (Phase A property suite), `cognitiveState.test.ts` (Phase C).
- CI adds a dedicated `replay-determinism` job that runs the property
  suite + determinism contract suite separately so a failure shows up
  unambiguously in the PR check list.

## [0.2.0] — features added between v0.1.0 and Phase A

These shipped as commits between Jan 2026 and Apr 2026. Documented
retroactively for completeness.

### Added

- **Encompassed skills + implicit credit (FIRe-style).** New
  `Skill.encompassedSkills?` field. New `ImplicitCreditEvent` (added to
  the `NoesisEvent` union). `processPracticeEvent` propagates fractional
  review-interval credit to encompassed skills when the parent skill is
  practiced correctly.
- **Per-user-per-skill `learningSpeed` multipliers** (clamped 0.5–2.0).
  `setLearningSpeed`, `getLearningSpeed`, `calibrateLearningSpeed`
  methods on `NoesisCoreEngineImpl`. `MemoryScheduler.scheduleReview`
  accepts an optional `learningSpeed` argument.
- **Knock-out review selection** — greedy set-cover for review
  consolidation. Gated on `SessionConfig.enableKnockOutReviews`.
- **Prerequisite re-validation** — the planner can probe a decayed
  prerequisite when a dependent skill appears mastered. Gated on
  `SessionConfig.prerequisiteRevalidationEnabled` (threshold default
  `0.7`). New `SessionAction.type = 'prerequisite_probe'`.
- **`computeRating(event, ratingConfig)`** — pure function that converts
  a `PracticeEvent` into an FSRS rating 1-4 using `confidence` and
  `responseTimeMs`. Used internally by `processPracticeEvent`.
- **`getEffectiveMastery(learnerId, skillId)`** — `min(ownMastery,
  min over transitive prerequisites)`. Encodes "a skill is only truly
  mastered if its foundation is solid".

### Fixed

- `registerTransferTests()` no longer discards custom `SessionPlannerConfig`
  when re-creating the session planner. Original `plannerConfig` is stored
  in the constructor and reused.
- `SkillGraph.removeSkill()` cleans up dangling prerequisite +
  encompassing references in remaining skills (was leaving them and
  failing `validate()`).
- Cycle-detection DFS no longer terminates early; finds all cycle nodes.
- Diagnostic secondary-skill weighting applies uniformly to attempts,
  correctness, AND difficulty (was inconsistent).
- Variable typo `zeroDegreeSkilss` → `zeroDegreeSkills`.

## [0.1.0] - 2026-01-04

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
