/**
 * Canonical Event Schema
 *
 * This module defines the event types and factory functions for the Noesis system.
 * All adapters and apps should use these event types for interoperability.
 *
 * DETERMINISM: All event factories accept injected clock and ID generators
 * to support replay and testing.
 */

import type {
  BaseEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
  SessionConfig,
} from '../constitution';

export type {
  BaseEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
  NoesisEvent,
} from '../constitution';

/**
 * Event schema version for forward compatibility
 */
export const EVENT_SCHEMA_VERSION = '1.0.0';

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
export const defaultClock: ClockFn = () => Date.now();

/**
 * Default ID generator using UUID v4
 *
 * NOTE: This is a NON-DETERMINISTIC default for convenience.
 * For deterministic operation (testing, replay), use createDeterministicIdGenerator()
 * or inject a custom ID generator.
 */
export const defaultIdGenerator: IdGeneratorFn = (): string => {
  // Simple UUID v4 implementation (no dependencies)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Create a deterministic ID generator for testing/replay
 * Returns incrementing IDs like "evt-0001", "evt-0002", etc.
 */
export function createDeterministicIdGenerator(prefix: string = 'evt'): IdGeneratorFn {
  let counter = 0;
  return () => `${prefix}-${String(++counter).padStart(4, '0')}`;
}

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
export function createEventFactoryContext(
  clock: ClockFn = defaultClock,
  idGenerator: IdGeneratorFn = defaultIdGenerator
): EventFactoryContext {
  return { clock, idGenerator };
}

/**
 * Validate that required fields are present in an event
 */
export function validateEvent(event: BaseEvent): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!event.id || typeof event.id !== 'string') {
    errors.push('Event must have a valid id');
  }
  if (!event.type || typeof event.type !== 'string') {
    errors.push('Event must have a valid type');
  }
  if (!event.learnerId || typeof event.learnerId !== 'string') {
    errors.push('Event must have a valid learnerId');
  }
  if (typeof event.timestamp !== 'number' || event.timestamp < 0) {
    errors.push('Event must have a valid timestamp');
  }
  if (!event.sessionId || typeof event.sessionId !== 'string') {
    errors.push('Event must have a valid sessionId');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a PracticeEvent
 */
export function createPracticeEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  skillId: string,
  itemId: string,
  correct: boolean,
  responseTimeMs: number,
  options: {
    confidence?: number;
    errorCategory?: string;
  } = {}
): PracticeEvent {
  return {
    id: ctx.idGenerator(),
    type: 'practice',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    skillId,
    itemId,
    correct,
    responseTimeMs,
    confidence: options.confidence,
    errorCategory: options.errorCategory,
  };
}

/**
 * Create a DiagnosticEvent
 */
export function createDiagnosticEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  skillsAssessed: string[],
  results: Array<{
    skillId: string;
    score: number;
    itemsAttempted: number;
    itemsCorrect: number;
  }>
): DiagnosticEvent {
  return {
    id: ctx.idGenerator(),
    type: 'diagnostic',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    skillsAssessed,
    results,
  };
}

/**
 * Create a TransferTestEvent
 */
export function createTransferTestEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  testId: string,
  skillId: string,
  transferType: 'near' | 'far',
  score: number,
  passed: boolean
): TransferTestEvent {
  return {
    id: ctx.idGenerator(),
    type: 'transfer_test',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    testId,
    skillId,
    transferType,
    score,
    passed,
  };
}

/**
 * Create a SessionEvent (start)
 */
export function createSessionStartEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  config: SessionConfig
): SessionEvent {
  return {
    id: ctx.idGenerator(),
    type: 'session_start',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    config,
  };
}

/**
 * Create a SessionEvent (end)
 */
export function createSessionEndEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  summary: {
    durationMinutes: number;
    itemsAttempted: number;
    itemsCorrect: number;
    skillsPracticed: string[];
  }
): SessionEvent {
  return {
    id: ctx.idGenerator(),
    type: 'session_end',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    summary,
  };
}

// NOTE: Legacy createEventId and createBaseEvent removed in v0.1.0
// They were non-deterministic. Use createEventFactoryContext() with
// injected clock/idGenerator for deterministic event creation.
