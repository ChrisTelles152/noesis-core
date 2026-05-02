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

import type {
  NoesisCoreEngine,
  SkillGraph,
  LearnerModelEngine,
  MemoryScheduler,
  SessionPlanner,
  TransferGate,
  DiagnosticEngine,
  LearnerModel,
  MemoryState,
  SessionConfig,
  SessionAction,
  NoesisEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
  TransferTest,
  TransferTestResult,
  ItemSkillMapping,
} from '../constitution.js';

import { BKTEngine, createBKTEngine, type BKTParams } from '../learner/index.js';
import { createFSRSScheduler, type FSRSParams } from '../memory/index.js';
import { SessionPlannerImpl, type SessionPlannerConfig } from '../planning/index.js';
import { createTransferGate, type TransferGateConfig } from '../transfer/index.js';
import { createDiagnosticEngine, type DiagnosticConfig } from '../diagnostic/index.js';
import type { ClockFn, IdGeneratorFn, EventFactoryContext } from '../events/index.js';
import {
  createEventFactoryContext,
  createImplicitCreditEvent,
  requireClock,
  requireIdGenerator,
} from '../events/index.js';

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

export const DEFAULT_RATING_CONFIG: RatingConfig = {
  hardConfidenceThreshold: 0.4,
  easyConfidenceThreshold: 0.8,
  baselineResponseTimeMs: 10000,
  hardResponseTimeFactor: 2.0,
  easyResponseTimeFactor: 0.5,
};

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
export function computeRating(
  event: PracticeEvent,
  config: RatingConfig = DEFAULT_RATING_CONFIG
): 1 | 2 | 3 | 4 {
  if (!event.correct) return 1;

  const confidence = event.confidence;
  const responseTimeMs = event.responseTimeMs;
  const hasConfidence = confidence !== undefined;
  const hasResponseTime = responseTimeMs !== undefined && responseTimeMs > 0;

  // Check for Hard (2): low confidence OR very slow
  if (hasConfidence && confidence < config.hardConfidenceThreshold) return 2;
  if (
    hasResponseTime &&
    responseTimeMs > config.baselineResponseTimeMs * config.hardResponseTimeFactor
  )
    return 2;

  // Check for Easy (4): high confidence AND fast
  if (
    hasConfidence &&
    confidence >= config.easyConfidenceThreshold &&
    (!hasResponseTime ||
      responseTimeMs < config.baselineResponseTimeMs * config.easyResponseTimeFactor)
  )
    return 4;

  // Default: Good (3)
  return 3;
}

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
}

/**
 * Serialized state format
 */
interface SerializedState {
  version: string;
  timestamp: number;
  learnerModels: Array<{ learnerId: string; data: string }>;
  memoryStates: Map<string, MemoryState[]>;
  transferResults: TransferTestResult[];
  eventLog: NoesisEvent[];
  /** Per-user per-skill learning speed multipliers (added in v1.1) */
  learnerSpeeds?: Array<[string, Array<[string, number]>]>;
}

/**
 * Noesis Core Engine Implementation
 */
export class NoesisCoreEngineImpl implements NoesisCoreEngine {
  readonly graph: SkillGraph;
  readonly learnerEngine: LearnerModelEngine;
  readonly memoryScheduler: MemoryScheduler;
  sessionPlanner: SessionPlanner;
  readonly transferGate: TransferGate;
  readonly diagnosticEngine: DiagnosticEngine;

  private readonly clock: ClockFn;
  // idGenerator can be used for creating events within the engine
  private readonly idGenerator: IdGeneratorFn;
  private readonly plannerConfig: Partial<SessionPlannerConfig>;
  private readonly ratingConfig: RatingConfig;
  private readonly implicitCreditFraction: number;
  private readonly implicitCreditMinSpeed: number;
  private readonly eventContext: EventFactoryContext;

  // Internal state
  private learnerModels: Map<string, LearnerModel> = new Map();
  private memoryStates: Map<string, MemoryState[]> = new Map();
  private transferResults: TransferTestResult[] = [];
  private transferTests: TransferTest[] = [];
  private itemMappings: ItemSkillMapping[] = [];
  private eventLog: NoesisEvent[] = [];
  // Per-user, per-skill learning speed multipliers (learnerId → skillId → speed)
  private learnerSpeeds: Map<string, Map<string, number>> = new Map();

  /**
   * @param skillGraph - The skill DAG this engine will operate over.
   * @param config - Optional core-engine configuration (BKT, FSRS, planner, etc.).
   * @param clock - Wall-clock function. **Required**: must be injected by the caller
   *               so replay determinism is preserved. Throws if not a function.
   *               For replay/test, use {@link createDeterministicEngine}.
   *               For production paths, use {@link createSystemEngine} to opt in to `Date.now()`.
   * @param idGenerator - Event-ID generator. **Required** for the same reason as `clock`.
   */
  constructor(
    skillGraph: SkillGraph,
    config: CoreEngineConfig = {},
    clock: ClockFn,
    idGenerator: IdGeneratorFn
  ) {
    this.graph = skillGraph;
    this.clock = requireClock(clock);
    this.idGenerator = requireIdGenerator(idGenerator);
    this.plannerConfig = config.planner || {};
    this.ratingConfig = { ...DEFAULT_RATING_CONFIG, ...config.rating };
    this.implicitCreditFraction = config.implicitCreditFraction ?? 0.5;
    this.implicitCreditMinSpeed = config.implicitCreditMinSpeed ?? 1.0;
    this.eventContext = createEventFactoryContext(this.clock, this.idGenerator);

    // Initialize components
    this.learnerEngine = createBKTEngine(config.bkt, this.clock);
    this.memoryScheduler = createFSRSScheduler(config.fsrs, this.clock);
    this.transferGate = createTransferGate(config.transfer);
    this.diagnosticEngine = createDiagnosticEngine(config.diagnostic);

    // Session planner needs transfer data
    this.sessionPlanner = new SessionPlannerImpl(
      this.plannerConfig,
      this.transferTests,
      this.transferResults
    );
  }

  /**
   * Process an event and update all internal state
   */
  processEvent(event: NoesisEvent): void {
    // Log the event
    this.eventLog.push(event);

    // Route to appropriate handler
    switch (event.type) {
      case 'practice':
        this.processPracticeEvent(event);
        break;
      case 'diagnostic':
        this.processDiagnosticEvent(event);
        break;
      case 'transfer_test':
        this.processTransferTestEvent(event);
        break;
      case 'session_start':
      case 'session_end':
        this.processSessionEvent(event);
        break;
      case 'implicit_credit':
        this.processImplicitCreditEvent(event as import('../constitution.js').ImplicitCreditEvent);
        break;
    }
  }

  /**
   * Process a practice event
   */
  private processPracticeEvent(event: PracticeEvent): void {
    const { learnerId, skillId, correct } = event;

    // Update learner model
    let model = this.learnerModels.get(learnerId);
    if (!model) {
      model = this.learnerEngine.createModel(learnerId, this.graph);
    }
    model = this.learnerEngine.updateModel(model, event);
    this.learnerModels.set(learnerId, model);

    // Update memory state
    let states = this.memoryStates.get(learnerId) || [];
    let skillState = states.find((s) => s.skillId === skillId);

    if (!skillState) {
      skillState = this.memoryScheduler.createState(skillId);
      states = [...states, skillState];
    }

    // Convert practice event to FSRS rating using confidence + response time
    const rating = computeRating(event, this.ratingConfig);
    // Look up per-user learning speed for this skill
    const learningSpeed = this.learnerSpeeds.get(learnerId)?.get(skillId);
    const updatedState = this.memoryScheduler.scheduleReview(
      skillState,
      correct,
      rating,
      learningSpeed
    );

    // Replace the state in the array
    states = states.map((s) => (s.skillId === skillId ? updatedState : s));

    // Implicit credit propagation (FIRe-inspired): when a skill is practiced
    // correctly, encompassed skills get their nextReview shifted forward.
    if (correct && this.implicitCreditFraction > 0) {
      const encompassed = this.graph.getEncompassedSkills(skillId);
      for (const targetId of encompassed) {
        const targetState = states.find((s) => s.skillId === targetId);
        if (!targetState) continue;

        // Skip credit for learners struggling with this skill (speed < minSpeed)
        const targetSpeed = this.learnerSpeeds.get(learnerId)?.get(targetId) ?? 1.0;
        if (targetSpeed < this.implicitCreditMinSpeed) continue;

        // Shift nextReview forward by creditFraction * remaining interval
        const remainingInterval = targetState.nextReview - targetState.lastReview;
        if (remainingInterval <= 0) continue;

        const shiftMs = Math.round(remainingInterval * this.implicitCreditFraction);
        const newNextReview = targetState.nextReview + shiftMs;

        states = states.map((s) =>
          s.skillId === targetId ? { ...s, nextReview: newNextReview } : s
        );

        // Log implicit credit event for replay determinism
        const creditEvent = createImplicitCreditEvent(
          this.eventContext,
          learnerId,
          event.sessionId,
          skillId,
          targetId,
          this.implicitCreditFraction,
          shiftMs
        );
        this.eventLog.push(creditEvent);
      }
    }

    this.memoryStates.set(learnerId, states);
  }

  /**
   * Process a diagnostic event
   */
  private processDiagnosticEvent(event: DiagnosticEvent): void {
    const { learnerId, results, timestamp } = event;

    // Convert results to mastery estimates
    const masteryEstimates = new Map<string, number>();
    for (const result of results) {
      masteryEstimates.set(result.skillId, result.score);
    }

    // Create or update learner model
    let model = this.learnerModels.get(learnerId);
    if (!model) {
      model = this.learnerEngine.createModel(learnerId, this.graph);
    }

    // Initialize from diagnostic if BKT engine supports it
    if (this.learnerEngine instanceof BKTEngine) {
      model = (this.learnerEngine as BKTEngine).initializeFromDiagnostic(
        model,
        masteryEstimates,
        timestamp
      );
    }

    this.learnerModels.set(learnerId, model);
  }

  /**
   * Process a transfer test event
   */
  private processTransferTestEvent(event: TransferTestEvent): void {
    const result: TransferTestResult = {
      testId: event.testId,
      passed: event.passed,
      score: event.score,
      timestamp: event.timestamp,
    };

    this.transferResults.push(result);
  }

  /**
   * Process a session event
   */
  private processSessionEvent(_event: SessionEvent): void {
    // Session events are logged but don't directly modify learner state
  }

  /**
   * Process an implicit credit event (during replay).
   * Applies the nextReview shift to the target skill.
   */
  private processImplicitCreditEvent(
    event: import('../constitution.js').ImplicitCreditEvent
  ): void {
    const { learnerId, targetSkillId, nextReviewShiftMs } = event;
    const states = this.memoryStates.get(learnerId);
    if (!states) return;

    const updated = states.map((s) =>
      s.skillId === targetSkillId ? { ...s, nextReview: s.nextReview + nextReviewShiftMs } : s
    );
    this.memoryStates.set(learnerId, updated);
  }

  /**
   * Get the current learner model
   */
  getLearnerModel(learnerId: string): LearnerModel | undefined {
    return this.learnerModels.get(learnerId);
  }

  /**
   * Get or create a learner model
   */
  getOrCreateLearnerModel(learnerId: string): LearnerModel {
    let model = this.learnerModels.get(learnerId);
    if (!model) {
      model = this.learnerEngine.createModel(learnerId, this.graph);
      this.learnerModels.set(learnerId, model);
    }
    return model;
  }

  /**
   * Get memory states for a learner
   */
  getMemoryStates(learnerId: string): MemoryState[] {
    return this.memoryStates.get(learnerId) || [];
  }

  /**
   * Get next recommended action
   */
  getNextAction(learnerId: string, config: SessionConfig): SessionAction {
    const model = this.getOrCreateLearnerModel(learnerId);
    const states = this.getMemoryStates(learnerId);
    return this.sessionPlanner.getNextAction(model, this.graph, states, config);
  }

  /**
   * Plan a complete session
   */
  planSession(learnerId: string, config: SessionConfig): SessionAction[] {
    const model = this.getOrCreateLearnerModel(learnerId);
    const states = this.getMemoryStates(learnerId);
    return this.sessionPlanner.planSession(model, this.graph, states, config);
  }

  /**
   * Register transfer tests
   */
  registerTransferTests(tests: TransferTest[]): void {
    this.transferTests = tests;

    // Re-create session planner with updated tests, preserving original config
    this.sessionPlanner = new SessionPlannerImpl(
      this.plannerConfig,
      this.transferTests,
      this.transferResults
    );
  }

  /**
   * Register item-skill mappings for diagnostics
   */
  registerItemMappings(mappings: ItemSkillMapping[]): void {
    this.itemMappings = mappings;
  }

  /**
   * Generate a diagnostic test
   */
  generateDiagnostic(maxItems: number): string[] {
    return this.diagnosticEngine.generateDiagnostic(this.graph, this.itemMappings, maxItems);
  }

  /**
   * Export all state for persistence
   */
  exportState(): string {
    const now = this.clock();

    const serialized: SerializedState = {
      version: '1.0.0',
      timestamp: now,
      learnerModels: Array.from(this.learnerModels.entries()).map(([learnerId, model]) => ({
        learnerId,
        data: this.learnerEngine.serialize(model),
      })),
      memoryStates: this.memoryStates,
      transferResults: this.transferResults,
      eventLog: this.eventLog,
    };

    // Convert Map to array for JSON serialization
    const memoryStatesArray: [string, MemoryState[]][] = Array.from(this.memoryStates.entries());

    // Serialize learner speeds
    const learnerSpeedsArray: [string, [string, number][]][] = Array.from(
      this.learnerSpeeds.entries()
    ).map(([learnerId, speeds]) => [learnerId, Array.from(speeds.entries())]);

    return JSON.stringify({
      ...serialized,
      memoryStates: memoryStatesArray,
      learnerSpeeds: learnerSpeedsArray,
    });
  }

  /**
   * Import state from persistence
   */
  importState(data: string): void {
    const parsed = JSON.parse(data);

    // Restore learner models
    this.learnerModels.clear();
    for (const { learnerId, data: modelData } of parsed.learnerModels) {
      const model = this.learnerEngine.deserialize(modelData);
      this.learnerModels.set(learnerId, model);
    }

    // Restore memory states
    this.memoryStates = new Map(parsed.memoryStates);

    // Restore transfer results
    this.transferResults = parsed.transferResults;

    // Restore event log
    this.eventLog = parsed.eventLog;

    // Restore learner speeds (backward compatible — missing in old serialized data)
    this.learnerSpeeds.clear();
    if (parsed.learnerSpeeds) {
      for (const [learnerId, speedEntries] of parsed.learnerSpeeds) {
        this.learnerSpeeds.set(learnerId, new Map(speedEntries));
      }
    }
  }

  /**
   * Replay events from a log
   * This is the core of deterministic replay - same events produce same state
   */
  replayEvents(events: NoesisEvent[]): void {
    // Clear current state
    this.learnerModels.clear();
    this.memoryStates.clear();
    this.transferResults = [];
    this.eventLog = [];
    this.learnerSpeeds.clear();

    // Replay each event in order
    for (const event of events) {
      this.processEvent(event);
    }
  }

  /**
   * Get the event log
   */
  getEventLog(): NoesisEvent[] {
    return [...this.eventLog];
  }

  /**
   * Get transfer test results
   */
  getTransferResults(): TransferTestResult[] {
    return [...this.transferResults];
  }

  /**
   * Check if a skill is unlocked (passed transfer tests)
   */
  isSkillUnlocked(skillId: string): boolean {
    return this.transferGate.isSkillUnlocked(skillId, this.transferResults, this.transferTests);
  }

  /**
   * Get pending transfer tests for a skill
   */
  getPendingTransferTests(skillId: string): TransferTest[] {
    return this.transferGate.getPendingTests(skillId, this.transferResults, this.transferTests);
  }

  /**
   * Get a summary of learner progress
   */
  getLearnerProgress(learnerId: string): LearnerProgress {
    const model = this.getLearnerModel(learnerId);
    if (!model) {
      return {
        learnerId,
        totalSkills: this.graph.skills.size,
        masteredSkills: 0,
        learningSkills: 0,
        notStartedSkills: this.graph.skills.size,
        averageMastery: 0,
        totalEvents: 0,
      };
    }

    let masteredCount = 0;
    let learningCount = 0;
    let totalMastery = 0;

    for (const [, prob] of model.skillProbabilities) {
      totalMastery += prob.pMastery;
      if (prob.pMastery >= 0.85) {
        masteredCount++;
      } else if (prob.pMastery >= 0.3) {
        learningCount++;
      }
    }

    const totalSkills = this.graph.skills.size;
    const notStarted = totalSkills - masteredCount - learningCount;

    return {
      learnerId,
      totalSkills,
      masteredSkills: masteredCount,
      learningSkills: learningCount,
      notStartedSkills: notStarted,
      averageMastery: totalSkills > 0 ? totalMastery / totalSkills : 0,
      totalEvents: model.totalEvents,
    };
  }

  /**
   * Get effective mastery for a skill, accounting for prerequisite subgraph health.
   * Returns the minimum of the skill's own pMastery and the minimum pMastery
   * among all its transitive prerequisites. A skill is only truly mastered
   * if its entire foundation is solid.
   *
   * Pure computation — no stored state, no cache.
   */
  getEffectiveMastery(learnerId: string, skillId: string): number {
    const model = this.learnerModels.get(learnerId);
    if (!model) return 0;

    const ownMastery = model.skillProbabilities.get(skillId)?.pMastery ?? 0;
    const prereqs = this.graph.getAllPrerequisites(skillId);

    if (prereqs.length === 0) return ownMastery;

    let minPrereqMastery = ownMastery;
    for (const prereqId of prereqs) {
      const prereqMastery = model.skillProbabilities.get(prereqId)?.pMastery ?? 0;
      if (prereqMastery < minPrereqMastery) {
        minPrereqMastery = prereqMastery;
      }
    }

    return minPrereqMastery;
  }

  /**
   * Set the learning speed multiplier for a specific learner+skill.
   * Speed > 1.0 = topic is easy, longer review intervals.
   * Speed < 1.0 = topic is hard, shorter review intervals.
   * Clamped to [0.5, 2.0].
   */
  setLearningSpeed(learnerId: string, skillId: string, speed: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, speed));
    let skillSpeeds = this.learnerSpeeds.get(learnerId);
    if (!skillSpeeds) {
      skillSpeeds = new Map();
      this.learnerSpeeds.set(learnerId, skillSpeeds);
    }
    skillSpeeds.set(skillId, clamped);
  }

  /**
   * Get the learning speed for a learner+skill (default 1.0).
   */
  getLearningSpeed(learnerId: string, skillId: string): number {
    return this.learnerSpeeds.get(learnerId)?.get(skillId) ?? 1.0;
  }

  /**
   * Calibrate learning speed for a learner+skill based on practice history.
   * Computes the ratio of actual retention to predicted retention.
   * Returns a suggested speed — does NOT auto-apply it.
   *
   * Requires at least `minEvents` practice events for the skill to produce
   * a meaningful calibration. Returns 1.0 if insufficient data.
   */
  calibrateLearningSpeed(learnerId: string, skillId: string, minEvents: number = 5): number {
    const practiceEvents = this.eventLog.filter(
      (e): e is PracticeEvent =>
        e.type === 'practice' &&
        e.learnerId === learnerId &&
        (e as PracticeEvent).skillId === skillId
    );

    if (practiceEvents.length < minEvents) return 1.0;

    // Compare actual success rate vs predicted retention at time of each review
    const states = this.memoryStates.get(learnerId) || [];
    const skillState = states.find((s) => s.skillId === skillId);
    if (!skillState) return 1.0;

    // Simple calibration: ratio of actual accuracy to expected retention
    const correctCount = practiceEvents.filter((e) => e.correct).length;
    const actualAccuracy = correctCount / practiceEvents.length;
    const predictedRetention = this.memoryScheduler.getRetention(skillState, this.clock());

    if (predictedRetention <= 0) return 1.0;

    // Speed = actual / predicted, clamped to [0.5, 2.0]
    const rawSpeed = actualAccuracy / predictedRetention;
    return Math.max(0.5, Math.min(2.0, rawSpeed));
  }

  /**
   * Generate a new event ID using the injected generator
   * Useful for creating events externally that will be processed by this engine
   */
  generateEventId(): string {
    return this.idGenerator();
  }

  /**
   * Get the current time from the injected clock
   */
  getCurrentTime(): number {
    return this.clock();
  }
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
export function createNoesisCoreEngine(
  skillGraph: SkillGraph,
  config: CoreEngineConfig = {},
  clock: ClockFn,
  idGenerator: IdGeneratorFn
): NoesisCoreEngineImpl {
  return new NoesisCoreEngineImpl(skillGraph, config, clock, idGenerator);
}

/**
 * Create a deterministic core engine for testing/replay.
 *
 * Uses a fixed clock (returns `startTime` always) and a counter-based ID generator
 * (`evt-000001`, `evt-000002`, ...). Identical inputs produce byte-identical state.
 */
export function createDeterministicEngine(
  skillGraph: SkillGraph,
  config: CoreEngineConfig = {},
  startTime: number = 0
): NoesisCoreEngineImpl {
  const currentTime = startTime;
  let eventCounter = 0;

  const deterministicClock: ClockFn = () => currentTime;
  const deterministicIdGenerator: IdGeneratorFn = () => {
    eventCounter++;
    return `evt-${eventCounter.toString().padStart(6, '0')}`;
  };

  return new NoesisCoreEngineImpl(skillGraph, config, deterministicClock, deterministicIdGenerator);
}

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
export function createSystemEngine(
  skillGraph: SkillGraph,
  config: CoreEngineConfig = {}
): NoesisCoreEngineImpl {
  const systemClock: ClockFn = () => Date.now();
  const systemIdGenerator: IdGeneratorFn = () => {
    // Use crypto.randomUUID where available; fall back to a UUID-v4-shaped string.
    const cryptoRef: { randomUUID?: () => string } | undefined = (
      globalThis as unknown as { crypto?: { randomUUID?: () => string } }
    ).crypto;
    if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
      return cryptoRef.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
  return new NoesisCoreEngineImpl(skillGraph, config, systemClock, systemIdGenerator);
}
