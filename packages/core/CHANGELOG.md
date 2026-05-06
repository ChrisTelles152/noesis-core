# Changelog

All notable changes to `@noesis-edu/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0-rc.0] - 2026-05-04

Phase H-1: pull-up of universal engine modules from the verticals into core.
Twelve new modules absorb the duplicated BKT/FSRS/planner/mastery/session-state/
logging/calibrator/fatigue logic from `noesis-eng`, `noesis-math`, and
`noesis-delf`. After the verticals migrate (Phase H-2/H-3/H-4), they delete
their `src/lib/noesis/` forks and import from `@noesis-edu/core@0.3.0`.

See `docs/migration/0.2-to-0.3.md` for the consumer migration guide.

### Added

#### Multi-channel BKT — `MultiChannelBKTEngine`
- Per-channel pMastery state (a learner can be Mastered on RECOG_MC and
  still Learning on PROD_TYPED for the same skill).
- Drilling discount: discount the learning transition after >2 attempts
  on the same (skill, channel) in the same session (default multiplier
  `0.3`, threshold `2`). Resets cleanly when `sessionId` changes.
- Pluggable per-skill-category modifier slot (e.g. English grammar's
  `{ pLearnMultiplier: 0.85, pSlipAdd: 0.03 }` becomes a pack-supplied
  config value, not a hardcode in core).
- Pure `static computeUpdate()` for replay-equivalence verification.
- `now: number` parameter on every attempt (no internal `Date.now()`).
- `correctDays` use UTC `YYYY-MM-DD` strings — feeds layered mastery's
  cross-day cooling-off gate.
- `serialize()` / `deserialize()` for replay + persistence with stable
  sorted output.
- Existing single-channel `BKTEngine` is **untouched** — `noesis-delf`
  and `noesis-proof` see no API change.

#### Layered mastery — `LayeredMasteryModel`
- Two-tier model on top of MCBKT state: `Learned` (pMastery ≥ 0.75 +
  ≥3 attempts) and `Mastered` (≥0.85 + ≥6 attempts + ≥3 correct + ≥2
  calendar days + ≥24h cooling-off + lastCorrect=true).
- Each unmet Mastered condition surfaces as a human-readable blocker
  string for UI use.
- Skill-level aggregation across channels: ≥2 channels mastered, OR
  primary mastered + secondary learned-or-mastered, OR
  single-channel-with-data is mastered.
- Soft revocation: `revokeOnError()` flips `lastCorrect=false` while
  preserving `pMastery` (re-meeting all six gates is one correct answer
  away).
- Pure functions — no I/O. Pack-supplied `SkillChannelMapping` for
  category → channel rules.

#### Budgeted session planner — `BudgetedSessionPlanner`
- Session-level allocation (60% reviews / 25% errors / 15% new items
  by default).
- Backlog control — 50% budget reduction after 3 consecutive growth
  sessions (clamped to `minBudget=15`).
- New-skill caps: `maxNewSkillsEarly=1`, `maxNewSkillsLater=2`,
  threshold `sessionNumber=10`.
- Per-skill new-item caps: `2` early, `4` later.
- `static detectBacklogGrowthSessions()` helper for caller convenience.
- Pure: stateless planner. Caller supplies pre-sorted candidates +
  session number + backlog signal.

#### Session lifecycle — `SessionLifecycleManager`
- Pure in-memory bookkeeping for in-flight sessions: `createSession`,
  `findActiveSession`, `recordItemShown` (idempotent on duplicates),
  `recordItemAnswered`, `endSession`, `resumeSession`, cleanup.
- `serialize() / deserialize()` for cross-process replay.
- Caller-supplied `sessionId` (use `EventFactoryContext.idGenerator`
  for end-to-end determinism). No internal UUID generation.
- Defensive copies on every getter — internal state never leaks.

#### Planner snapshot — `PlannerSnapshot`
- Captures `BudgetedSessionPlanner` inputs at session-start in a
  versioned, serializable shape (`PLANNER_SNAPSHOT_VERSION = "1.0.0"`).
- `planFromSnapshot(snapshot)` replays the captured inputs through the
  planner and produces the original `SessionPlan`. Lynchpin of session-
  replay determinism — `noesis-proof`'s equivalence framework reads
  captured snapshots and asserts byte-for-byte plan equality across
  old (vertical) and new (core) impls.
- Frozen config travels in the snapshot — replay uses snapshot config
  by default, guarding against drift between capture and replay.

#### Optimistic locking — `OptimisticLockingStateStore`
- Generic `OptimisticLockingStore<TKey, TValue>` interface +
  `InMemoryOptimisticStore` impl. Per locked decision #4, no Postgres
  adapter ships in core (lives in `noesis-app` or a separate package).
- `updateWithRetry()` helper encapsulates the single-retry-then-throw
  pattern from eng's migrations 014/015.
- `OptimisticLockConflictError` carries the conflicting key + a `kind`
  tag (`"bkt"`, `"fsrs"`, etc.) so callers can distinguish error
  categories without proliferating error classes.

#### Session metrics — `SessionMetricsLogger`
- Pure `computeSessionMetrics(attempts)` aggregator + stateful
  `SessionMetricsLogger` class for per-session attempt buffering.
- `SessionMetrics` shape: totals, per-channel + per-skill breakdowns,
  median + p90 response time (deterministic linear-interpolation
  percentile).
- Order-independent: shuffling input preserves all aggregates.
- All output keys (channel/skill) sorted lexicographically for stable
  JSON.

#### Fatigue detection — `FatigueDetector`
- Rolling-window dual-threshold (latency rise + accuracy drop) plus
  hard session cap. Defaults match converged eng+math values: 10-item
  window, +20% latency / −10% accuracy thresholds, 15-min cap, 6-attempt
  minimum before dual-threshold runs.
- Clock-injected (no internal `Date.now()`) — replay-deterministic.
- Guard against zero baseline latency that the math source lacked.

#### Difficulty calibration — `EloDifficultyCalibrator`
- Pure Elo-based item-difficulty + learner-ability rating. Defaults
  match math's converged values: defaultRating=1200, kLearner=32,
  kItem=16, bounds [100, 3000].
- `serialize()` / `deserialize()` round-trip the full state (math source
  was in-memory only).
- `selectBestItem()` breaks ties by lexicographic itemId for replay
  determinism (math source returned input-array-order-dependent first).

#### Item history — `ItemHistoryAggregator`
- Pure in-memory item-attempt aggregation: per-item attempts +
  correctCount + accuracy + mastery flag + weak-item filtering.
- `getWeakItems()` sorts deterministically (accuracy asc, attempts
  desc, itemId asc).
- Defaults match noesis-eng's converged values: 0.8 weakness/mastery
  threshold, 2-attempt minimum.

#### Answer normalization — `AnswerNormalizer` + `LevenshteinMatcher`
- Universal interface for pack-specific normalizers (English
  contractions, French diacritics, math fraction parsing) to plug in.
- `LevenshteinMatcher` is the default impl with length-bucketed typo
  tolerance (≤5 chars: 0; 6–25: 1; >25: 2) + Unicode NFD diacritic
  stripping + lowercase + whitespace collapse.
- Pure `levenshtein()` helper exported separately.

#### Engine config overrides — `EngineConfigOverrides`
- Pack-supplied tuning surface. Includes BKT defaults + per-channel
  priors, FSRS, session config, response-time thresholds, layered
  mastery, budgeted planner, fatigue, calibrator, drilling discount,
  per-skill-category modifiers, item-type → channel mapping.
- `validateEngineConfigOverrides()` returns dot-pathed errors;
  `assertValidEngineConfigOverrides()` is the throwing variant.
- `createNoesisCoreEngine(graph, { overrides }, ...)` accepts the
  overrides surface and validates eagerly at construction. Exposed
  via `engine.getConfigOverrides()` for MCBKT-aware consumers.

#### Metrics expansion — `getLearnerMetrics(..., options)`
- Three optional sections: `layeredMastery` (when a `LayeredMasteryModel`
  is supplied), `fatigue` (when a `FatigueDetector` is supplied),
  `difficulty` (when an `EloDifficultyCalibrator` is supplied).
- Existing call signatures unchanged — backward compatible.

#### Types-only subpath — `@noesis-edu/core/contracts`
- New entry exposes every type contract pack manifest packages need
  without pulling the runtime engine. Stable: any addition or removal
  is semver-breaking.
- Subpath added to `package.json` `exports` field; the runtime emits
  zero exports after type erasure.

### Tests

- Suite grew from 379 (at 0.2.0) to 742 in 0.3.0-rc.0 (+363, all green).
- Per-module: MCBKT 41, layered mastery 42, budgeted planner 33,
  session lifecycle 35, planner snapshot 16, optimistic locking 24,
  session metrics 30, fatigue 14, calibration 23, item history 23,
  answer 29, config 27, contracts subpath 9, engine integration 8,
  barrel completeness 20, metrics expansion 7.
- Every new module includes an explicit replay-determinism test (two
  identical event sequences produce identical serialized state).

### Notes

- This is a **release candidate**. Verticals (`noesis-eng`,
  `noesis-math`, `noesis-delf`) consume `0.3.0-rc.0` during Phase
  H-2/H-3/H-4 push-down. Once all three are green and `noesis-proof`'s
  equivalence framework confirms byte-for-byte parity, `0.3.0` ships.
- No removals or breaking changes vs 0.2.0. Existing `BKTEngine` /
  `FSRSScheduler` / `SessionPlannerImpl` / `getLearnerMetrics`
  signatures all unchanged.

## [0.2.0] - 2026-05-03

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

### Pre-Phase-A features (commits between Jan 2026 and Apr 2026)

Documented retroactively — these landed before the determinism contract
but are still part of the 0.2.0 surface.

#### Added

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

#### Fixed

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
