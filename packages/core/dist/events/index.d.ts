/**
 * Canonical Event Schema
 *
 * This module defines the event types and factory functions for the Noesis system.
 * All adapters and apps should use these event types for interoperability.
 *
 * DETERMINISM: All event factories accept injected clock and ID generators
 * to support replay and testing.
 */
import type { BaseEvent, PracticeEvent, DiagnosticEvent, TransferTestEvent, SessionEvent, SessionConfig, ImplicitCreditEvent, CognitiveStateEvent, CognitiveStateVector, StageCompletedEvent } from '../constitution.js';
export type { BaseEvent, PracticeEvent, DiagnosticEvent, TransferTestEvent, SessionEvent, NoesisEvent, CognitiveStateEvent, CognitiveStateVector, CognitiveStateMeasurement, StageCompletedEvent, CanonicalStage, } from '../constitution.js';
/**
 * Event schema version for forward compatibility
 */
export declare const EVENT_SCHEMA_VERSION = "1.0.0";
/**
 * Clock function type - returns current timestamp
 */
export type ClockFn = () => number;
/**
 * ID generator function type - returns unique ID
 */
export type IdGeneratorFn = () => string;
/**
 * Runtime guard — throws if `clock` is not a function.
 *
 * Used by Core constructors to enforce the determinism contract:
 * the wall clock must be injected by the caller. JavaScript callers that
 * bypass TypeScript's required-parameter check still hit this guard.
 *
 * For replay/test, use `createDeterministicEngine(...)`.
 * For production paths that need wall-clock time, use `createSystemEngine(...)`,
 * which opts in to `Date.now()` explicitly.
 */
export declare function requireClock(clock: ClockFn | undefined): ClockFn;
/**
 * Runtime guard — throws if `idGenerator` is not a function.
 *
 * Counterpart to {@link requireClock}. Same contract, same escape hatches.
 */
export declare function requireIdGenerator(idGenerator: IdGeneratorFn | undefined): IdGeneratorFn;
/**
 * Create a deterministic ID generator for testing/replay
 * Returns incrementing IDs like "evt-0001", "evt-0002", etc.
 */
export declare function createDeterministicIdGenerator(prefix?: string): IdGeneratorFn;
/**
 * Event factory context - provides clock and ID generator
 */
export interface EventFactoryContext {
    clock: ClockFn;
    idGenerator: IdGeneratorFn;
}
/**
 * Create an event factory context. Both `clock` and `idGenerator` are required —
 * silent defaults are not allowed. See {@link requireClock} for the rationale.
 */
export declare function createEventFactoryContext(clock: ClockFn, idGenerator: IdGeneratorFn): EventFactoryContext;
/**
 * Validate that required fields are present in an event
 */
export declare function validateEvent(event: BaseEvent): {
    valid: boolean;
    errors: string[];
};
/**
 * Create a PracticeEvent
 */
export declare function createPracticeEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, skillId: string, itemId: string, correct: boolean, responseTimeMs: number, options?: {
    confidence?: number;
    errorCategory?: string;
}): PracticeEvent;
/**
 * Create a DiagnosticEvent
 */
export declare function createDiagnosticEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, skillsAssessed: string[], results: Array<{
    skillId: string;
    score: number;
    itemsAttempted: number;
    itemsCorrect: number;
}>): DiagnosticEvent;
/**
 * Create a TransferTestEvent
 */
export declare function createTransferTestEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, testId: string, skillId: string, transferType: 'near' | 'far', score: number, passed: boolean): TransferTestEvent;
/**
 * Create a SessionEvent (start)
 */
export declare function createSessionStartEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, config: SessionConfig): SessionEvent;
/**
 * Create a SessionEvent (end)
 */
export declare function createSessionEndEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, summary: {
    durationMinutes: number;
    itemsAttempted: number;
    itemsCorrect: number;
    skillsPracticed: string[];
}): SessionEvent;
/**
 * Create a CognitiveStateEvent (NALS).
 *
 * The factory uses `ctx.clock` for `timestamp` and `ctx.idGenerator` for `id`.
 * The vector itself is supplied by the caller (typically an attention/affect
 * adapter that already filled in per-measurement timestamps and confidences).
 */
export declare function createCognitiveStateEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, vector: CognitiveStateVector): CognitiveStateEvent;
/**
 * Create a StageCompletedEvent for a non-practice stage.
 *
 * Use for `concept_introduction` (learner finished the intro screen) and
 * `reflection` (learner wrote a reflection). Practice and application stages
 * are recorded automatically via {@link createPracticeEvent} (set
 * `PracticeEvent.stage = 'application'` to mark application).
 */
export declare function createStageCompletedEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, skillId: string, stage: 'concept_introduction' | 'reflection', options?: {
    notes?: string;
}): StageCompletedEvent;
/**
 * Create an implicit credit event (FIRe-inspired trickle-down).
 * Generated automatically when practicing a skill that encompasses other skills.
 */
export declare function createImplicitCreditEvent(ctx: EventFactoryContext, learnerId: string, sessionId: string, sourceSkillId: string, targetSkillId: string, creditFraction: number, nextReviewShiftMs: number): ImplicitCreditEvent;
//# sourceMappingURL=index.d.ts.map