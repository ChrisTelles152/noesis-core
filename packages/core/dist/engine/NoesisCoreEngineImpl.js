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
import { BKTEngine, createBKTEngine } from '../learner/index.js';
import { createFSRSScheduler } from '../memory/index.js';
import { SessionPlannerImpl } from '../planning/index.js';
import { createTransferGate } from '../transfer/index.js';
import { createDiagnosticEngine } from '../diagnostic/index.js';
/**
 * Noesis Core Engine Implementation
 */
export class NoesisCoreEngineImpl {
    graph;
    learnerEngine;
    memoryScheduler;
    sessionPlanner;
    transferGate;
    diagnosticEngine;
    clock;
    // idGenerator can be used for creating events within the engine
    idGenerator;
    // Internal state
    learnerModels = new Map();
    memoryStates = new Map();
    transferResults = [];
    transferTests = [];
    itemMappings = [];
    eventLog = [];
    constructor(skillGraph, config = {}, clock = () => Date.now(), idGenerator = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`) {
        this.graph = skillGraph;
        this.clock = clock;
        this.idGenerator = idGenerator;
        // Initialize components
        this.learnerEngine = createBKTEngine(config.bkt, clock);
        this.memoryScheduler = createFSRSScheduler(config.fsrs, clock);
        this.transferGate = createTransferGate(config.transfer);
        this.diagnosticEngine = createDiagnosticEngine(config.diagnostic);
        // Session planner needs transfer data
        this.sessionPlanner = new SessionPlannerImpl(config.planner, this.transferTests, this.transferResults);
    }
    /**
     * Process an event and update all internal state
     */
    processEvent(event) {
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
    processPracticeEvent(event) {
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
        let skillState = states.find(s => s.skillId === skillId);
        if (!skillState) {
            skillState = this.memoryScheduler.createState(skillId);
            states = [...states, skillState];
        }
        // Convert correct to rating (simplified: correct=Good(3), incorrect=Again(1))
        const rating = correct ? 3 : 1;
        const updatedState = this.memoryScheduler.scheduleReview(skillState, correct, rating);
        // Replace the state in the array
        states = states.map(s => s.skillId === skillId ? updatedState : s);
        this.memoryStates.set(learnerId, states);
    }
    /**
     * Process a diagnostic event
     */
    processDiagnosticEvent(event) {
        const { learnerId, results, timestamp } = event;
        // Convert results to mastery estimates
        const masteryEstimates = new Map();
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
            model = this.learnerEngine.initializeFromDiagnostic(model, masteryEstimates, timestamp);
        }
        this.learnerModels.set(learnerId, model);
    }
    /**
     * Process a transfer test event
     */
    processTransferTestEvent(event) {
        const result = {
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
    processSessionEvent(_event) {
        // Session events are logged but don't directly modify learner state
        // They could be used for analytics or session tracking
    }
    /**
     * Get the current learner model
     */
    getLearnerModel(learnerId) {
        return this.learnerModels.get(learnerId);
    }
    /**
     * Get or create a learner model
     */
    getOrCreateLearnerModel(learnerId) {
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
    getMemoryStates(learnerId) {
        return this.memoryStates.get(learnerId) || [];
    }
    /**
     * Get next recommended action
     */
    getNextAction(learnerId, config) {
        const model = this.getOrCreateLearnerModel(learnerId);
        const states = this.getMemoryStates(learnerId);
        return this.sessionPlanner.getNextAction(model, this.graph, states, config);
    }
    /**
     * Plan a complete session
     */
    planSession(learnerId, config) {
        const model = this.getOrCreateLearnerModel(learnerId);
        const states = this.getMemoryStates(learnerId);
        return this.sessionPlanner.planSession(model, this.graph, states, config);
    }
    /**
     * Register transfer tests
     */
    registerTransferTests(tests) {
        this.transferTests = tests;
        // Re-create session planner with updated tests
        this.sessionPlanner = new SessionPlannerImpl({}, this.transferTests, this.transferResults);
    }
    /**
     * Register item-skill mappings for diagnostics
     */
    registerItemMappings(mappings) {
        this.itemMappings = mappings;
    }
    /**
     * Generate a diagnostic test
     */
    generateDiagnostic(maxItems) {
        return this.diagnosticEngine.generateDiagnostic(this.graph, this.itemMappings, maxItems);
    }
    /**
     * Export all state for persistence
     */
    exportState() {
        const now = this.clock();
        const serialized = {
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
        const memoryStatesArray = Array.from(this.memoryStates.entries());
        return JSON.stringify({
            ...serialized,
            memoryStates: memoryStatesArray,
        });
    }
    /**
     * Import state from persistence
     */
    importState(data) {
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
    replayEvents(events) {
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
    getEventLog() {
        return [...this.eventLog];
    }
    /**
     * Get transfer test results
     */
    getTransferResults() {
        return [...this.transferResults];
    }
    /**
     * Check if a skill is unlocked (passed transfer tests)
     */
    isSkillUnlocked(skillId) {
        return this.transferGate.isSkillUnlocked(skillId, this.transferResults, this.transferTests);
    }
    /**
     * Get pending transfer tests for a skill
     */
    getPendingTransferTests(skillId) {
        return this.transferGate.getPendingTests(skillId, this.transferResults, this.transferTests);
    }
    /**
     * Get a summary of learner progress
     */
    getLearnerProgress(learnerId) {
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
            }
            else if (prob.pMastery >= 0.3) {
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
    generateEventId() {
        return this.idGenerator();
    }
    /**
     * Get the current time from the injected clock
     */
    getCurrentTime() {
        return this.clock();
    }
}
/**
 * Factory function to create a NoesisCoreEngine
 */
export function createNoesisCoreEngine(skillGraph, config = {}, clock = () => Date.now(), idGenerator) {
    return new NoesisCoreEngineImpl(skillGraph, config, clock, idGenerator);
}
/**
 * Create a deterministic core engine for testing/replay
 */
export function createDeterministicEngine(skillGraph, config = {}, startTime = 0) {
    let currentTime = startTime;
    let eventCounter = 0;
    const deterministicClock = () => currentTime;
    const deterministicIdGenerator = () => {
        eventCounter++;
        return `evt-${eventCounter.toString().padStart(6, '0')}`;
    };
    return new NoesisCoreEngineImpl(skillGraph, config, deterministicClock, deterministicIdGenerator);
}
//# sourceMappingURL=NoesisCoreEngineImpl.js.map