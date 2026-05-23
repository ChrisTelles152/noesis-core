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
import { assertValidEngineConfigOverrides } from '../config/index.js';
import { createEventFactoryContext, createImplicitCreditEvent, requireClock, requireIdGenerator, } from '../events/index.js';
export const DEFAULT_RATING_CONFIG = {
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
export function computeRating(event, config = DEFAULT_RATING_CONFIG) {
    if (!event.correct)
        return 1;
    const confidence = event.confidence;
    const responseTimeMs = event.responseTimeMs;
    const hasConfidence = confidence !== undefined;
    const hasResponseTime = responseTimeMs !== undefined && responseTimeMs > 0;
    // Check for Hard (2): low confidence OR very slow
    if (hasConfidence && confidence < config.hardConfidenceThreshold)
        return 2;
    if (hasResponseTime &&
        responseTimeMs > config.baselineResponseTimeMs * config.hardResponseTimeFactor)
        return 2;
    // Check for Easy (4): high confidence AND fast
    if (hasConfidence &&
        confidence >= config.easyConfidenceThreshold &&
        (!hasResponseTime ||
            responseTimeMs < config.baselineResponseTimeMs * config.easyResponseTimeFactor))
        return 4;
    // Default: Good (3)
    return 3;
}
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
    plannerConfig;
    ratingConfig;
    implicitCreditFraction;
    implicitCreditMinSpeed;
    eventContext;
    /** Pack-supplied overrides (frozen on construction). */
    configOverrides;
    // Internal state
    learnerModels = new Map();
    memoryStates = new Map();
    transferResults = [];
    transferTests = [];
    itemMappings = [];
    eventLog = [];
    // Per-user, per-skill learning speed multipliers (learnerId → skillId → speed)
    learnerSpeeds = new Map();
    // Per-learner Cognitive-State Vector timeline (learnerId → ordered vectors).
    // Appended to on every cognitive_state event; never overwritten in place
    // so the history is auditable and replay-safe.
    cognitiveStates = new Map();
    // Canonical-loop stage history (learnerId → skillId → set of stages seen).
    // Used by the planner when SessionConfig.enforceCanonicalLoop is true.
    // Populated from PracticeEvent (stage defaults to 'practice') and from
    // StageCompletedEvent (concept_introduction / reflection).
    stageHistory = new Map();
    /**
     * @param skillGraph - The skill DAG this engine will operate over.
     * @param config - Optional core-engine configuration (BKT, FSRS, planner, etc.).
     * @param clock - Wall-clock function. **Required**: must be injected by the caller
     *               so replay determinism is preserved. Throws if not a function.
     *               For replay/test, use {@link createDeterministicEngine}.
     *               For production paths, use {@link createSystemEngine} to opt in to `Date.now()`.
     * @param idGenerator - Event-ID generator. **Required** for the same reason as `clock`.
     */
    constructor(skillGraph, config = {}, clock, idGenerator) {
        this.graph = skillGraph;
        this.clock = requireClock(clock);
        this.idGenerator = requireIdGenerator(idGenerator);
        // Validate pack-supplied overrides eagerly — bad values fail at engine
        // construction, not at first practice event.
        if (config.overrides) {
            assertValidEngineConfigOverrides(config.overrides);
        }
        this.configOverrides = config.overrides;
        // Merge override.session into the legacy planner config (planner config
        // is a SessionConfig superset). Explicit config.planner still wins.
        const sessionFromOverrides = config.overrides?.session ?? {};
        this.plannerConfig = { ...sessionFromOverrides, ...(config.planner || {}) };
        this.ratingConfig = { ...DEFAULT_RATING_CONFIG, ...config.rating };
        this.implicitCreditFraction = config.implicitCreditFraction ?? 0.5;
        this.implicitCreditMinSpeed = config.implicitCreditMinSpeed ?? 1.0;
        this.eventContext = createEventFactoryContext(this.clock, this.idGenerator);
        // Initialize components. Explicit per-component config (bkt / fsrs)
        // takes precedence over override.bktDefaults / override.fsrs.
        const bktConfig = config.bkt ?? config.overrides?.bktDefaults;
        const fsrsConfig = config.fsrs ?? config.overrides?.fsrs;
        this.learnerEngine = createBKTEngine(bktConfig, this.clock);
        this.memoryScheduler = createFSRSScheduler(fsrsConfig, this.clock);
        this.transferGate = createTransferGate(config.transfer);
        this.diagnosticEngine = createDiagnosticEngine(config.diagnostic);
        // Session planner needs transfer data
        this.sessionPlanner = new SessionPlannerImpl(this.plannerConfig, this.transferTests, this.transferResults);
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
            case 'implicit_credit':
                this.processImplicitCreditEvent(event);
                break;
            case 'cognitive_state':
                this.processCognitiveStateEvent(event);
                break;
            case 'stage_completed':
                this.processStageCompletedEvent(event);
                break;
        }
    }
    /**
     * Record a canonical-loop stage transition for the given learner+skill.
     * Idempotent — if the stage is already in the set, the call is a no-op.
     */
    recordStage(learnerId, skillId, stage) {
        let perLearner = this.stageHistory.get(learnerId);
        if (!perLearner) {
            perLearner = new Map();
            this.stageHistory.set(learnerId, perLearner);
        }
        let perSkill = perLearner.get(skillId);
        if (!perSkill) {
            perSkill = new Set();
            perLearner.set(skillId, perSkill);
        }
        perSkill.add(stage);
    }
    /**
     * Reduce a StageCompletedEvent — record the stage in stageHistory.
     * Used for stages that have no practice attempt (concept_introduction,
     * reflection). Practice and application stages are recorded automatically
     * via processPracticeEvent.
     */
    processStageCompletedEvent(event) {
        this.recordStage(event.learnerId, event.skillId, event.stage);
    }
    /**
     * Append a Cognitive-State Vector to the per-learner timeline.
     *
     * The reducer is intentionally minimal: it stores the vector verbatim and
     * does not mutate it. Downstream consumers (planner, analytics) are
     * responsible for interpreting confidence/staleness.
     */
    processCognitiveStateEvent(event) {
        const existing = this.cognitiveStates.get(event.learnerId) ?? [];
        this.cognitiveStates.set(event.learnerId, [...existing, event.vector]);
    }
    /**
     * Process a practice event
     */
    processPracticeEvent(event) {
        const { learnerId, skillId, correct } = event;
        // Record canonical-loop stage progression. Default 'practice'; consumers
        // that mark application attempts via event.stage record 'application' too.
        this.recordStage(learnerId, skillId, event.stage ?? 'practice');
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
        const updatedState = this.memoryScheduler.scheduleReview(skillState, correct, rating, learningSpeed);
        // Replace the state in the array
        states = states.map((s) => (s.skillId === skillId ? updatedState : s));
        // Implicit credit propagation (FIRe-inspired): when a skill is practiced
        // correctly, encompassed skills get their nextReview shifted forward.
        if (correct && this.implicitCreditFraction > 0) {
            const encompassed = this.graph.getEncompassedSkills(skillId);
            for (const targetId of encompassed) {
                const targetState = states.find((s) => s.skillId === targetId);
                if (!targetState)
                    continue;
                // Skip credit for learners struggling with this skill (speed < minSpeed)
                const targetSpeed = this.learnerSpeeds.get(learnerId)?.get(targetId) ?? 1.0;
                if (targetSpeed < this.implicitCreditMinSpeed)
                    continue;
                // Shift nextReview forward by creditFraction * remaining interval
                const remainingInterval = targetState.nextReview - targetState.lastReview;
                if (remainingInterval <= 0)
                    continue;
                const shiftMs = Math.round(remainingInterval * this.implicitCreditFraction);
                const newNextReview = targetState.nextReview + shiftMs;
                states = states.map((s) => s.skillId === targetId ? { ...s, nextReview: newNextReview } : s);
                // Log implicit credit event for replay determinism
                const creditEvent = createImplicitCreditEvent(this.eventContext, learnerId, event.sessionId, skillId, targetId, this.implicitCreditFraction, shiftMs);
                this.eventLog.push(creditEvent);
            }
        }
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
    }
    /**
     * Process an implicit credit event (during replay).
     * Applies the nextReview shift to the target skill.
     */
    processImplicitCreditEvent(event) {
        const { learnerId, targetSkillId, nextReviewShiftMs } = event;
        const states = this.memoryStates.get(learnerId);
        if (!states)
            return;
        const updated = states.map((s) => s.skillId === targetSkillId ? { ...s, nextReview: s.nextReview + nextReviewShiftMs } : s);
        this.memoryStates.set(learnerId, updated);
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
     * Get the most recent Cognitive-State Vector for a learner, or undefined
     * if no cognitive_state events have been processed for them.
     *
     * Returned object is a fresh shallow copy — mutating it does not affect
     * engine state (the underlying vectors are stored verbatim, not cloned).
     */
    getCognitiveState(learnerId) {
        const timeline = this.cognitiveStates.get(learnerId);
        if (!timeline || timeline.length === 0)
            return undefined;
        const latest = timeline[timeline.length - 1];
        return latest ? { ...latest } : undefined;
    }
    /**
     * Get the full Cognitive-State Vector timeline for a learner, ordered
     * from oldest to newest. Returns an empty array when no events have
     * been processed.
     *
     * The returned array is a copy — appending to it does not mutate engine
     * state — but the inner vectors are shared references.
     */
    getCognitiveStateHistory(learnerId) {
        return [...(this.cognitiveStates.get(learnerId) ?? [])];
    }
    /**
     * Get the set of canonical-loop stages recorded for a given learner+skill.
     * Returns an empty set when nothing has been recorded.
     *
     * The returned set is a defensive copy.
     */
    getStageHistory(learnerId, skillId) {
        const set = this.stageHistory.get(learnerId)?.get(skillId);
        return new Set(set);
    }
    /**
     * Get the full per-skill stage map for a learner, suitable for passing
     * into {@link SessionPlanner.getNextAction} as the stageHistory argument.
     * Returns `undefined` when no stages have been recorded.
     */
    getStageHistoryForLearner(learnerId) {
        return this.stageHistory.get(learnerId);
    }
    /**
     * Get next recommended action
     */
    getNextAction(learnerId, config) {
        const model = this.getOrCreateLearnerModel(learnerId);
        const states = this.getMemoryStates(learnerId);
        return this.sessionPlanner.getNextAction(model, this.graph, states, config, this.getStageHistoryForLearner(learnerId));
    }
    /**
     * Plan a complete session
     */
    planSession(learnerId, config) {
        const model = this.getOrCreateLearnerModel(learnerId);
        const states = this.getMemoryStates(learnerId);
        return this.sessionPlanner.planSession(model, this.graph, states, config, this.getStageHistoryForLearner(learnerId));
    }
    /**
     * Register transfer tests
     */
    registerTransferTests(tests) {
        this.transferTests = tests;
        // Re-create session planner with updated tests, preserving original config
        this.sessionPlanner = new SessionPlannerImpl(this.plannerConfig, this.transferTests, this.transferResults);
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
            version: '1.3.0',
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
        // Serialize learner speeds
        const learnerSpeedsArray = Array.from(this.learnerSpeeds.entries()).map(([learnerId, speeds]) => [learnerId, Array.from(speeds.entries())]);
        // Serialize per-learner Cognitive-State Vector timelines (v1.2).
        const cognitiveStatesArray = Array.from(this.cognitiveStates.entries());
        // Serialize per-learner per-skill stage history (v1.3). Stages are
        // serialized as arrays for portability; importState turns them back
        // into Sets.
        const stageHistoryArray = Array.from(this.stageHistory.entries()).map(([learnerId, perSkill]) => [
            learnerId,
            Array.from(perSkill.entries()).map(([skillId, stages]) => [skillId, Array.from(stages)]),
        ]);
        return JSON.stringify({
            ...serialized,
            memoryStates: memoryStatesArray,
            learnerSpeeds: learnerSpeedsArray,
            cognitiveStates: cognitiveStatesArray,
            stageHistory: stageHistoryArray,
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
        // Restore learner speeds (backward compatible — missing in old serialized data)
        this.learnerSpeeds.clear();
        if (parsed.learnerSpeeds) {
            for (const [learnerId, speedEntries] of parsed.learnerSpeeds) {
                this.learnerSpeeds.set(learnerId, new Map(speedEntries));
            }
        }
        // Restore Cognitive-State Vector timelines (v1.2; backward compatible —
        // pre-1.2 snapshots have no `cognitiveStates` field, in which case the
        // map starts empty).
        this.cognitiveStates.clear();
        if (parsed.cognitiveStates) {
            for (const [learnerId, timeline] of parsed.cognitiveStates) {
                this.cognitiveStates.set(learnerId, [...timeline]);
            }
        }
        // Restore canonical-loop stage history (v1.3; backward compatible —
        // pre-1.3 snapshots have no `stageHistory` field).
        this.stageHistory.clear();
        if (parsed.stageHistory) {
            for (const [learnerId, perSkill] of parsed.stageHistory) {
                const skillMap = new Map();
                for (const [skillId, stages] of perSkill) {
                    skillMap.set(skillId, new Set(stages));
                }
                this.stageHistory.set(learnerId, skillMap);
            }
        }
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
        this.learnerSpeeds.clear();
        this.cognitiveStates.clear();
        this.stageHistory.clear();
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
     * Get effective mastery for a skill, accounting for prerequisite subgraph health.
     * Returns the minimum of the skill's own pMastery and the minimum pMastery
     * among all its transitive prerequisites. A skill is only truly mastered
     * if its entire foundation is solid.
     *
     * Pure computation — no stored state, no cache.
     */
    getEffectiveMastery(learnerId, skillId) {
        const model = this.learnerModels.get(learnerId);
        if (!model)
            return 0;
        const ownMastery = model.skillProbabilities.get(skillId)?.pMastery ?? 0;
        const prereqs = this.graph.getAllPrerequisites(skillId);
        if (prereqs.length === 0)
            return ownMastery;
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
    setLearningSpeed(learnerId, skillId, speed) {
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
    getLearningSpeed(learnerId, skillId) {
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
    calibrateLearningSpeed(learnerId, skillId, minEvents = 5) {
        const practiceEvents = this.eventLog.filter((e) => e.type === 'practice' &&
            e.learnerId === learnerId &&
            e.skillId === skillId);
        if (practiceEvents.length < minEvents)
            return 1.0;
        // Compare actual success rate vs predicted retention at time of each review
        const states = this.memoryStates.get(learnerId) || [];
        const skillState = states.find((s) => s.skillId === skillId);
        if (!skillState)
            return 1.0;
        // Simple calibration: ratio of actual accuracy to expected retention
        const correctCount = practiceEvents.filter((e) => e.correct).length;
        const actualAccuracy = correctCount / practiceEvents.length;
        const predictedRetention = this.memoryScheduler.getRetention(skillState, this.clock());
        if (predictedRetention <= 0)
            return 1.0;
        // Speed = actual / predicted, clamped to [0.5, 2.0]
        const rawSpeed = actualAccuracy / predictedRetention;
        return Math.max(0.5, Math.min(2.0, rawSpeed));
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
    /**
     * Get the pack-supplied EngineConfigOverrides this engine was constructed
     * with, or `undefined` if none were supplied. MCBKT-aware consumers
     * (LayeredMasteryModel, BudgetedSessionPlanner, FatigueDetector,
     * EloDifficultyCalibrator) can read per-channel + pack-specific tuning
     * from this surface. Added in 0.3.0.
     */
    getConfigOverrides() {
        return this.configOverrides;
    }
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
export function createNoesisCoreEngine(skillGraph, config = {}, clock, idGenerator) {
    return new NoesisCoreEngineImpl(skillGraph, config, clock, idGenerator);
}
/**
 * Create a deterministic core engine for testing/replay.
 *
 * Uses a fixed clock (returns `startTime` always) and a counter-based ID generator
 * (`evt-000001`, `evt-000002`, ...). Identical inputs produce byte-identical state.
 */
export function createDeterministicEngine(skillGraph, config = {}, startTime = 0) {
    const currentTime = startTime;
    let eventCounter = 0;
    const deterministicClock = () => currentTime;
    const deterministicIdGenerator = () => {
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
export function createSystemEngine(skillGraph, config = {}) {
    const systemClock = () => Date.now();
    const systemIdGenerator = () => {
        // Use crypto.randomUUID where available; fall back to a UUID-v4-shaped string.
        const cryptoRef = globalThis.crypto;
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
//# sourceMappingURL=NoesisCoreEngineImpl.js.map