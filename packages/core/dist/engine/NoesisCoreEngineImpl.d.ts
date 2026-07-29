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
import type { NoesisCoreEngine, SkillGraph, LearnerModelEngine, MemoryScheduler, SessionPlanner, TransferGate, DiagnosticEngine, LearnerModel, MemoryState, SessionConfig, SessionAction, NoesisEvent, TransferTest, TransferTestResult, ItemSkillMapping } from '../constitution';
import { type BKTParams } from '../learner';
import { type FSRSParams } from '../memory';
import { type SessionPlannerConfig } from '../planning';
import { type TransferGateConfig } from '../transfer';
import { type DiagnosticConfig } from '../diagnostic';
import type { ClockFn, IdGeneratorFn } from '../events';
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
 * Noesis Core Engine Implementation
 */
export declare class NoesisCoreEngineImpl implements NoesisCoreEngine {
    readonly graph: SkillGraph;
    readonly learnerEngine: LearnerModelEngine;
    readonly memoryScheduler: MemoryScheduler;
    readonly sessionPlanner: SessionPlanner;
    readonly transferGate: TransferGate;
    readonly diagnosticEngine: DiagnosticEngine;
    private readonly clock;
    private readonly idGenerator;
    private learnerModels;
    private memoryStates;
    private transferResults;
    private transferTests;
    private itemMappings;
    private eventLog;
    constructor(skillGraph: SkillGraph, config?: CoreEngineConfig, clock?: ClockFn, idGenerator?: IdGeneratorFn);
    /**
     * Process an event and update all internal state
     */
    processEvent(event: NoesisEvent): void;
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
     * Generate a new event ID using the injected generator
     * Useful for creating events externally that will be processed by this engine
     */
    generateEventId(): string;
    /**
     * Get the current time from the injected clock
     */
    getCurrentTime(): number;
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
export declare function createNoesisCoreEngine(skillGraph: SkillGraph, config?: CoreEngineConfig, clock?: ClockFn, idGenerator?: IdGeneratorFn): NoesisCoreEngineImpl;
/**
 * Create a deterministic core engine for testing/replay
 */
export declare function createDeterministicEngine(skillGraph: SkillGraph, config?: CoreEngineConfig, startTime?: number): NoesisCoreEngineImpl;
//# sourceMappingURL=NoesisCoreEngineImpl.d.ts.map