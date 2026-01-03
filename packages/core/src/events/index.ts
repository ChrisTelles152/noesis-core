/**
 * Canonical Event Schema
 *
 * This module defines the event types used throughout the Noesis system.
 * All adapters and apps should use these event types for interoperability.
 */

export type {
  BaseEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
  NoesisEvent,
} from '../constitution';

/**
 * Create a unique event ID
 */
export function createEventId(): string {
  // Simple UUID v4 implementation (no dependencies)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a base event with common fields
 */
export function createBaseEvent(
  type: string,
  learnerId: string,
  sessionId: string
): Omit<import('../constitution').BaseEvent, 'id'> & { id: string } {
  return {
    id: createEventId(),
    type,
    learnerId,
    sessionId,
    timestamp: Date.now(),
  };
}
