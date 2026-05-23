/**
 * Noesis Core Engine Implementation
 *
 * The unified interface for the Noesis Core SDK.
 * Wires together all components and provides:
 * - Event processing pipeline
 * - State management
 * - Replay support for reproducibility
 * - Export/import for persistence
 *
 * DETERMINISM: All operations are pure and produce the same output
 * for the same input. Clock and ID generator are injected for testability.
 */
import type { NoesisCoreEngine, SkillGraph, LearnerModelEngine, MemoryScheduler, SessionPlanner, TransferGate, DiagnosticEngine, LearnerModel, MemoryState, SessionConfig, SessionAction, NoesisEvent, PracticeEvent, TransferTest, TransferTestResult, ItemSkillMapping, CognitiveStateVector, CanonicalStage } from '../constitution.js';
import { type BKTParams } from '../learner/index.js';
import { type FSRSParams } from '../memory/index.js';
import { type SessionPlannerConfig } from '../planning/index.js';
import { type TransferGateConfig } from '../transfer/index.js';
import { type DiagnosticConfig } from '../diagnostic/index.js';
import type { ClockFn, IdGeneratorFn } from '../events/index.js';
import { type EngineConfigOverrides } from '../config/index.js';
/**
 * Core engine configuration
 */
/**
 * Configuration for converting practice events to FSRS ratings.
 * Uses confidence and response time when available, falls back to
 * binary correct/incorrect (rating 3 or 1) when they're absent.
 */
export interface RatingConfig {
    /** Confidence below this → Hard (2) when correct. Default 0.4 */
    hardConfidenceThreshold: number;
    /** Confidence above this → Easy (4) when correct. Default 0.8 */
    easyConfidenceThreshold: number;
    /** Baseline response time in ms for difficulty assessment. Default 10000 */
    baselineResponseTimeMs: number;
    /** Response time > baseline * this factor → Hard (2). Default 2.0 */
    hardResponseTimeFactor: number;
    /** Response time < baseline * this factor → Easy (4). Default 0.5 */
    easyResponseTimeFactor: number;
}
export declare const DEFAULT_RATING_CONFIG: RatingConfig;
/**
 * Compute FSRS rating from a practice event.
 * Pure function — deterministic given the same inputs.
 *
 * Rating scale:
 * - 1 (Again): incorrect answer
 * - 2 (Hard): correct but low confidence or slow response
 * - 3 (Good): correct with normal performance
 * - 4 (Easy): correct with high confidence and fast response
 */
export declare function computeRating(event: PracticeEvent, config?: RatingConfig): 1 | 2 | 3 | 4;
export interface CoreEngineConfig {
    /** BKT parameters for learner modeling */
    bkt?: Partial<BKTParams>;
    /** FSRS parameters for memory scheduling */
    fsrs?: Partial<FSRSParams>;
    /** Session planner configuration */
    planner?: Partial<SessionPlannerConfig>;
    /** Transfer gate configuration */
    transfer?: Partial<TransferGateConfig>;
    /** Diagnostic engine configuration */
    diagnostic?: Partial<DiagnosticConfig>;
    /** Rating conversion configuration */
    rating?: Partial<RatingConfig>;
    /** Fraction of interval credit given to encompassed skills (0-1). Default 0.5 */
    implicitCreditFraction?: number;
    /** Minimum learning speed required to receive implicit credit. Default 1.0.
     *  Learners below this speed on a skill must practice it explicitly. */
    implicitCreditMinSpeed?: number;
    /**
     * Pack-supplied engine configuration overrides (introduced in 0.3.0).
     *
     * When supplied, these are validated eagerly via
     * `assertValidEngineConfigOverrides` in the constructor. The global
     * fields (`bktDefaults`, `fsrs`, `session`) are merged into the
     * legacy per-component config above as a fallback — the explicit
     * `bkt` / `fsrs` / `planner` fields above still win when both are set.
     *
     * Per-channel and pack-specific fields (`bktChannels`,
     * `responseTimeThresholdsMs`, `skillCategoryModifiers`,
     * `itemTypeToChannel`, `layeredMastery`, `budgetedPlanner`,
     * `fatigue`, `calibrator`, `drillingDiscount`) are stashed verbatim
     * and exposed via `getConfigOverrides()` for MCBKT-aware consumers.
     */
    overrides?: EngineConfigOverrides;
}
/**
 * Noesis Core Engine Implementation
 */
export declare class NoesisCoreEngineImpl implements NoesisCoreEngine {
    readonly graph: SkillGraph;
    readonly learnerEngine: LearnerModelEngine;
    readonly memoryScheduler: MemoryScheduler;
    sessionPlanner: SessionPlanner;
    readonly transferGate: TransferGate;
    readonly diagnosticEngine: DiagnosticEngine;
    private readonly clock;
    private readonly idGenerator;
    private readonly plannerConfig;
    private readonly ratingConfig;
    private readonly implicitCreditFraction;
    private readonly implicitCreditMinSpeed;
    private readonly eventContext;
    /** Pack-supplied overrides (frozen on construction). */
    private readonly configOverrides?;
    private learnerModels;
    private memoryStates;
    private transferResults;
    private transferTests;
    private itemMappings;
    private eventLog;
    private learnerSpeeds;
    private cognitiveStates;
    private stageHistory;
    /**
     * @param skillGraph - The skill DAG this engine will operate over.
     * @param config - Optional core-engine configuration (BKT, FSRS, planner, etc.).
     * @param clock - Wall-clock function. **Required**: must be injected by the caller
     *               so replay determinism is preserved. Throws if not a function.
     *               For replay/test, use {@link createDeterministicEngine}.
     *               For production paths, use {@link createSystemEngine} to opt in to `Date.now()`.
     * @param idGenerator - Event-ID generator. **Required** for the same reason as `clock`.
     */
    constructor(skillGraph: SkillGraph, config: CoreEngineConfig | undefined, clock: ClockFn, idGenerator: IdGeneratorFn);
    /**
     * Process an event and update all internal state
     */
    processEvent(event: NoesisEvent): void;
    /**
     * Record a canonical-loop stage transition for the given learner+skill.
     * Idempotent — if the stage is already in the set, the call is a no-op.
     */
    private recordStage;
    /**
     * Reduce a StageCompletedEvent — record the stage in stageHistory.
     * Used for stages that have no practice attempt (concept_introduction,
     * reflection). Practice and application stages are recorded automatically
     * via processPracticeEvent.
     */
    private processStageCompletedEvent;
    /**
     * Append a Cognitive-State Vector to the per-learner timeline.
     *
     * The reducer is intentionally minimal: it stores the vector verbatim and
     * does not mutate it. Downstream consumers (planner, analytics) are
     * responsible for interpreting confidence/staleness.
     */
    private processCognitiveStateEvent;
    /**
     * Process a practice event
     */
    private processPracticeEvent;
    /**
     * Process a diagnostic event
     */
    private processDiagnosticEvent;
    /**
     * Process a transfer test event
     */
    private processTransferTestEvent;
    /**
     * Process a session event
     */
    private processSessionEvent;
    /**
     * Process an implicit credit event (during replay).
     * Applies the nextReview shift to the target skill.
     */
    private processImplicitCreditEvent;
    /**
     * Get the current learner model
     */
    getLearnerModel(learnerId: string): LearnerModel | undefined;
    /**
     * Get or create a learner model
     */
    getOrCreateLearnerModel(learnerId: string): LearnerModel;
    /**
     * Get memory states for a learner
     */
    getMemoryStates(learnerId: string): MemoryState[];
    /**
     * Get the most recent Cognitive-State Vector for a learner, or undefined
     * if no cognitive_state events have been processed for them.
     *
     * Returned object is a fresh shallow copy — mutating it does not affect
     * engine state (the underlying vectors are stored verbatim, not cloned).
     */
    getCognitiveState(learnerId: string): CognitiveStateVector | undefined;
    /**
     * Get the full Cognitive-State Vector timeline for a learner, ordered
     * from oldest to newest. Returns an empty array when no events have
     * been processed.
     *
     * The returned array is a copy — appending to it does not mutate engine
     * state — but the inner vectors are shared references.
     */
    getCognitiveStateHistory(learnerId: string): CognitiveStateVector[];
    /**
     * Get the set of canonical-loop stages recorded for a given learner+skill.
     * Returns an empty set when nothing has been recorded.
     *
     * The returned set is a defensive copy.
     */
    getStageHistory(learnerId: string, skillId: string): Set<CanonicalStage>;
    /**
     * Get the full per-skill stage map for a learner, suitable for passing
     * into {@link SessionPlanner.getNextAction} as the stageHistory argument.
     * Returns `undefined` when no stages have been recorded.
     */
    private getStageHistoryForLearner;
    /**
     * Get next recommended action
     */
    getNextAction(learnerId: string, config: SessionConfig): SessionAction;
    /**
     * Plan a complete session
     */
    planSession(learnerId: string, config: SessionConfig): SessionAction[];
    /**
     * Register transfer tests
     */
    registerTransferTests(tests: TransferTest[]): void;
    /**
     * Register item-skill mappings for diagnostics
     */
    registerItemMappings(mappings: ItemSkillMapping[]): void;
    /**
     * Generate a diagnostic test
     */
    generateDiagnostic(maxItems: number): string[];
    /**
     * Export all state for persistence
     */
    exportState(): string;
    /**
     * Import state from persistence
     */
    importState(data: string): void;
    /**
     * Replay events from a log
     * This is the core of deterministic replay - same events produce same state
     */
    replayEvents(events: NoesisEvent[]): void;
    /**
     * Get the event log
     */
    getEventLog(): NoesisEvent[];
    /**
     * Get transfer test results
     */
    getTransferResults(): TransferTestResult[];
    /**
     * Check if a skill is unlocked (passed transfer tests)
     */
    isSkillUnlocked(skillId: string): boolean;
    /**
     * Get pending transfer tests for a skill
     */
    getPendingTransferTests(skillId: string): TransferTest[];
    /**
     * Get a summary of learner progress
     */
    getLearnerProgress(learnerId: string): LearnerProgress;
    /**
     * Get effective mastery for a skill, accounting for prerequisite subgraph health.
     * Returns the minimum of the skill's own pMastery and the minimum pMastery
     * among all its transitive prerequisites. A skill is only truly mastered
     * if its entire foundation is solid.
     *
     * Pure computation — no stored state, no cache.
     */
    getEffectiveMastery(learnerId: string, skillId: string): number;
    /**
     * Set the learning speed multiplier for a specific learner+skill.
     * Speed > 1.0 = topic is easy, longer review intervals.
     * Speed < 1.0 = topic is hard, shorter review intervals.
     * Clamped to [0.5, 2.0].
     */
    setLearningSpeed(learnerId: string, skillId: string, speed: number): void;
    /**
     * Get the learning speed for a learner+skill (default 1.0).
     */
    getLearningSpeed(learnerId: string, skillId: string): number;
    /**
     * Calibrate learning speed for a learner+skill based on practice history.
     * Computes the ratio of actual retention to predicted retention.
     * Returns a suggested speed — does NOT auto-apply it.
     *
     * Requires at least `minEvents` practice events for the skill to produce
     * a meaningful calibration. Returns 1.0 if insufficient data.
     */
    calibrateLearningSpeed(learnerId: string, skillId: string, minEvents?: number): number;
    /**
     * Generate a new event ID using the injected generator
     * Useful for creating events externally that will be processed by this engine
     */
    generateEventId(): string;
    /**
     * Get the current time from the injected clock
     */
    getCurrentTime(): number;
    /**
     * Get the pack-supplied EngineConfigOverrides this engine was constructed
     * with, or `undefined` if none were supplied. MCBKT-aware consumers
     * (LayeredMasteryModel, BudgetedSessionPlanner, FatigueDetector,
     * EloDifficultyCalibrator) can read per-channel + pack-specific tuning
     * from this surface. Added in 0.3.0.
     */
    getConfigOverrides(): EngineConfigOverrides | undefined;
}
/**
 * Learner progress summary
 */
export interface LearnerProgress {
    learnerId: string;
    totalSkills: number;
    masteredSkills: number;
    learningSkills: number;
    notStartedSkills: number;
    averageMastery: number;
    totalEvents: number;
}
/**
 * Factory function to create a NoesisCoreEngine.
 *
 * Both `clock` and `idGenerator` are **required**. There are no silent defaults — a
 * consumer who forgets to inject them gets a thrown error, not a silently
 * non-deterministic engine. See {@link requireClock} for the rationale.
 *
 * @see createDeterministicEngine for replay/testing.
 * @see createSystemEngine for production paths that opt in to `Date.now()` + UUID.
 */
export declare function createNoesisCoreEngine(skillGraph: SkillGraph, config: CoreEngineConfig | undefined, clock: ClockFn, idGenerator: IdGeneratorFn): NoesisCoreEngineImpl;
/**
 * Create a deterministic core engine for testing/replay.
 *
 * Uses a fixed clock (returns `startTime` always) and a counter-based ID generator
 * (`evt-000001`, `evt-000002`, ...). Identical inputs produce byte-identical state.
 */
export declare function createDeterministicEngine(skillGraph: SkillGraph, config?: CoreEngineConfig, startTime?: number): NoesisCoreEngineImpl;
/**
 * Create a core engine that opts in to system clock + system random IDs.
 *
 * **Use this only at production boundaries.** It IS non-replayable: events get
 * `Date.now()` timestamps and randomly generated UUID-v4 IDs. Two engines created
 * by this factory will not produce identical state from the same event sequence.
 *
 * Prefer {@link createDeterministicEngine} wherever possible. Use
 * {@link createNoesisCoreEngine} when you have your own clock/idGenerator (e.g.
 * a server clock, a request-scoped UUID source) so the determinism contract
 * still holds at your layer.
 */
export declare function createSystemEngine(skillGraph: SkillGraph, config?: CoreEngineConfig): NoesisCoreEngineImpl;
//# sourceMappingURL=NoesisCoreEngineImpl.d.ts.map