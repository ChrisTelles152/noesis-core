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
  ImplicitCreditEvent,
  CognitiveStateEvent,
  CognitiveStateVector,
  StageCompletedEvent,
} from '../constitution.js';

export type {
  BaseEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
  NoesisEvent,
  CognitiveStateEvent,
  CognitiveStateVector,
  CognitiveStateMeasurement,
  StageCompletedEvent,
  CanonicalStage,
} from '../constitution.js';

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
export function requireClock(clock: ClockFn | undefined): ClockFn {
  if (typeof clock !== 'function') {
    throw new Error(
      'Noesis: clock must be injected. Use createDeterministicEngine(...) for replay, ' +
        'or createSystemEngine(...) for production paths that opt in to Date.now().'
    );
  }
  return clock;
}

/**
 * Runtime guard — throws if `idGenerator` is not a function.
 *
 * Counterpart to {@link requireClock}. Same contract, same escape hatches.
 */
export function requireIdGenerator(idGenerator: IdGeneratorFn | undefined): IdGeneratorFn {
  if (typeof idGenerator !== 'function') {
    throw new Error(
      'Noesis: idGenerator must be injected. Use createDeterministicEngine(...) for replay, ' +
        'or createSystemEngine(...) for production paths that opt in to crypto.randomUUID().'
    );
  }
  return idGenerator;
}

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
 * Create an event factory context. Both `clock` and `idGenerator` are required —
 * silent defaults are not allowed. See {@link requireClock} for the rationale.
 */
export function createEventFactoryContext(
  clock: ClockFn,
  idGenerator: IdGeneratorFn
): EventFactoryContext {
  return { clock: requireClock(clock), idGenerator: requireIdGenerator(idGenerator) };
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

/**
 * Create a CognitiveStateEvent (NALS).
 *
 * The factory uses `ctx.clock` for `timestamp` and `ctx.idGenerator` for `id`.
 * The vector itself is supplied by the caller (typically an attention/affect
 * adapter that already filled in per-measurement timestamps and confidences).
 */
export function createCognitiveStateEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  vector: CognitiveStateVector
): CognitiveStateEvent {
  return {
    id: ctx.idGenerator(),
    type: 'cognitive_state',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    vector,
  };
}

/**
 * Create a StageCompletedEvent for a non-practice stage.
 *
 * Use for `concept_introduction` (learner finished the intro screen) and
 * `reflection` (learner wrote a reflection). Practice and application stages
 * are recorded automatically via {@link createPracticeEvent} (set
 * `PracticeEvent.stage = 'application'` to mark application).
 */
export function createStageCompletedEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  skillId: string,
  stage: 'concept_introduction' | 'reflection',
  options: { notes?: string } = {}
): StageCompletedEvent {
  return {
    id: ctx.idGenerator(),
    type: 'stage_completed',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    skillId,
    stage,
    notes: options.notes,
  };
}

/**
 * Create an implicit credit event (FIRe-inspired trickle-down).
 * Generated automatically when practicing a skill that encompasses other skills.
 */
export function createImplicitCreditEvent(
  ctx: EventFactoryContext,
  learnerId: string,
  sessionId: string,
  sourceSkillId: string,
  targetSkillId: string,
  creditFraction: number,
  nextReviewShiftMs: number
): ImplicitCreditEvent {
  return {
    id: ctx.idGenerator(),
    type: 'implicit_credit',
    learnerId,
    sessionId,
    timestamp: ctx.clock(),
    sourceSkillId,
    targetSkillId,
    creditFraction,
    nextReviewShiftMs,
  };
}

// NOTE: Legacy createEventId and createBaseEvent removed in v0.1.0
// They were non-deterministic. Use createEventFactoryContext() with
// injected clock/idGenerator for deterministic event creation.
