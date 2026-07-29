/**
 * Canonical Event Schema
 *
 * This module defines the event types and factory functions for the Noesis system.
 * All adapters and apps should use these event types for interoperability.
 *
 * DETERMINISM: All event factories accept injected clock and ID generators
 * to support replay and testing.
 */
import type { BaseEvent, PracticeEvent, DiagnosticEvent, TransferTestEvent, SessionEvent, SessionConfig } from '../constitution.js';
export type { BaseEvent, PracticeEvent, DiagnosticEvent, TransferTestEvent, SessionEvent, NoesisEvent, } from '../constitution.js';
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
 * Default clock using Date.now()
 *
 * NOTE: This is a NON-DETERMINISTIC default for convenience.
 * For deterministic operation (testing, replay), inject a custom clock.
 */
export declare const defaultClock: ClockFn;
/**
 * Default ID generator using UUID v4
 *
 * NOTE: This is a NON-DETERMINISTIC default for convenience.
 * For deterministic operation (testing, replay), use createDeterministicIdGenerator()
 * or inject a custom ID generator.
 */
export declare const defaultIdGenerator: IdGeneratorFn;
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
 * Create default factory context
 */
export declare function createEventFactoryContext(clock?: ClockFn, idGenerator?: IdGeneratorFn): EventFactoryContext;
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
//# sourceMappingURL=index.d.ts.map