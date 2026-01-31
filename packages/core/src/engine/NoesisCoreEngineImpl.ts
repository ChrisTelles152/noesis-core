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
import type { ClockFn, IdGeneratorFn } from '../events/index.js';

/**
 * Core engine configuration
 */
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
}

/**
 * Noesis Core Engine Implementation
 */
export class NoesisCoreEngineImpl implements NoesisCoreEngine {
  readonly graph: SkillGraph;
  readonly learnerEngine: LearnerModelEngine;
  readonly memoryScheduler: MemoryScheduler;
  readonly sessionPlanner: SessionPlanner;
  readonly transferGate: TransferGate;
  readonly diagnosticEngine: DiagnosticEngine;

  private readonly clock: ClockFn;
  // idGenerator can be used for creating events within the engine
  private readonly idGenerator: IdGeneratorFn;

  // Internal state
  private learnerModels: Map<string, LearnerModel> = new Map();
  private memoryStates: Map<string, MemoryState[]> = new Map();
  private transferResults: TransferTestResult[] = [];
  private transferTests: TransferTest[] = [];
  private itemMappings: ItemSkillMapping[] = [];
  private eventLog: NoesisEvent[] = [];

  constructor(
    skillGraph: SkillGraph,
    config: CoreEngineConfig = {},
    clock: ClockFn = () => Date.now(),
    idGenerator: IdGeneratorFn = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  ) {
    this.graph = skillGraph;
    this.clock = clock;
    this.idGenerator = idGenerator;

    // Initialize components
    this.learnerEngine = createBKTEngine(config.bkt, clock);
    this.memoryScheduler = createFSRSScheduler(config.fsrs, clock);
    this.transferGate = createTransferGate(config.transfer);
    this.diagnosticEngine = createDiagnosticEngine(config.diagnostic);

    // Session planner needs transfer data
    this.sessionPlanner = new SessionPlannerImpl(
      config.planner,
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

    // Convert correct to rating (simplified: correct=Good(3), incorrect=Again(1))
    const rating: 1 | 2 | 3 | 4 = correct ? 3 : 1;
    const updatedState = this.memoryScheduler.scheduleReview(skillState, correct, rating);

    // Replace the state in the array
    states = states.map((s) => (s.skillId === skillId ? updatedState : s));
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
    // They could be used for analytics or session tracking
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

    // Re-create session planner with updated tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).sessionPlanner = new SessionPlannerImpl(
      {},
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

    return JSON.stringify({
      ...serialized,
      memoryStates: memoryStatesArray,
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
 * Factory function to create a NoesisCoreEngine
 */
export function createNoesisCoreEngine(
  skillGraph: SkillGraph,
  config: CoreEngineConfig = {},
  clock: ClockFn = () => Date.now(),
  idGenerator?: IdGeneratorFn
): NoesisCoreEngineImpl {
  return new NoesisCoreEngineImpl(skillGraph, config, clock, idGenerator);
}

/**
 * Create a deterministic core engine for testing/replay
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
