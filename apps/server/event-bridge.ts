/**
 * Event Bridge
 *
 * Converts between the server's generic LearningEvent format and the core
 * engine's typed NoesisEvent format. This enables:
 *
 * 1. Storing core engine events in the server database
 * 2. Reconstructing NoesisEvents from stored data for engine replay
 *
 * Server format:  { id, userId, type, data: JSONB, timestamp: Date }
 * Core format:    { id, type, learnerId, sessionId, timestamp: number, ...typed fields }
 *
 * The bridge stores the full NoesisEvent inside the `data` JSONB column,
 * keyed under a `_coreEvent` field to distinguish from legacy generic events.
 */

import type { LearningEvent, InsertLearningEvent } from '@shared/schema';
import type {
  NoesisEvent,
  PracticeEvent,
  DiagnosticEvent,
  TransferTestEvent,
  SessionEvent,
} from '@noesis-edu/core';

/**
 * Convert a core NoesisEvent into a server InsertLearningEvent for storage.
 *
 * The entire NoesisEvent is stored in `data._coreEvent` so it can be
 * losslessly reconstructed. The top-level `type` uses a `core:` prefix
 * to distinguish from legacy server event types (e.g., 'attention', 'recommendation').
 */
export function coreEventToLearningEvent(
  userId: number,
  event: NoesisEvent
): InsertLearningEvent {
  return {
    userId,
    type: `core:${event.type}`,
    data: {
      _coreEvent: JSON.stringify(event),
    },
    timestamp: new Date(event.timestamp),
  };
}

/**
 * Extract a NoesisEvent from a stored LearningEvent.
 *
 * Returns null if the LearningEvent doesn't contain a core event
 * (i.e., it's a legacy server event like 'attention' or 'recommendation').
 */
export function learningEventToCoreEvent(
  event: LearningEvent
): NoesisEvent | null {
  const data = event.data as Record<string, unknown> | null;
  if (!data || !data._coreEvent) {
    return null;
  }

  const coreEvent = data._coreEvent as Record<string, unknown>;

  // Validate minimum required fields
  if (
    typeof coreEvent.id !== 'string' ||
    typeof coreEvent.type !== 'string' ||
    typeof coreEvent.learnerId !== 'string' ||
    typeof coreEvent.sessionId !== 'string' ||
    typeof coreEvent.timestamp !== 'number'
  ) {
    return null;
  }

  return coreEvent as unknown as NoesisEvent;
}

/**
 * Filter and convert an array of LearningEvents to NoesisEvents.
 * Skips any events that don't contain valid core events.
 * Returns events sorted by timestamp (ascending) for deterministic replay.
 */
export function extractCoreEvents(events: LearningEvent[]): NoesisEvent[] {
  const coreEvents: NoesisEvent[] = [];

  for (const event of events) {
    const coreEvent = learningEventToCoreEvent(event);
    if (coreEvent) {
      coreEvents.push(coreEvent);
    }
  }

  // Sort by timestamp for deterministic replay order
  coreEvents.sort((a, b) => a.timestamp - b.timestamp);

  return coreEvents;
}

/**
 * Check if a LearningEvent contains a core engine event.
 */
export function isCoreEvent(event: LearningEvent): boolean {
  const data = event.data as Record<string, unknown> | null;
  return !!(data && data._coreEvent);
}

/**
 * Validate that a plain object is a valid NoesisEvent.
 * Checks discriminated union fields based on `type`.
 */
export function validateNoesisEvent(
  obj: unknown
): { valid: true; event: NoesisEvent } | { valid: false; error: string } {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: 'Event must be an object' };
  }

  const e = obj as Record<string, unknown>;

  // Check base fields
  if (typeof e.id !== 'string' || e.id.length === 0) {
    return { valid: false, error: 'Missing or invalid id' };
  }
  if (typeof e.type !== 'string') {
    return { valid: false, error: 'Missing or invalid type' };
  }
  if (typeof e.learnerId !== 'string' || e.learnerId.length === 0) {
    return { valid: false, error: 'Missing or invalid learnerId' };
  }
  if (typeof e.sessionId !== 'string' || e.sessionId.length === 0) {
    return { valid: false, error: 'Missing or invalid sessionId' };
  }
  if (typeof e.timestamp !== 'number' || e.timestamp < 0) {
    return { valid: false, error: 'Missing or invalid timestamp' };
  }

  // Check type-specific fields
  switch (e.type) {
    case 'practice': {
      if (typeof e.skillId !== 'string') return { valid: false, error: 'practice: missing skillId' };
      if (typeof e.itemId !== 'string') return { valid: false, error: 'practice: missing itemId' };
      if (typeof e.correct !== 'boolean') return { valid: false, error: 'practice: missing correct' };
      if (typeof e.responseTimeMs !== 'number') return { valid: false, error: 'practice: missing responseTimeMs' };
      return { valid: true, event: e as unknown as PracticeEvent };
    }
    case 'diagnostic': {
      if (!Array.isArray(e.skillsAssessed)) return { valid: false, error: 'diagnostic: missing skillsAssessed' };
      if (!Array.isArray(e.results)) return { valid: false, error: 'diagnostic: missing results' };
      return { valid: true, event: e as unknown as DiagnosticEvent };
    }
    case 'transfer_test': {
      if (typeof e.testId !== 'string') return { valid: false, error: 'transfer_test: missing testId' };
      if (typeof e.skillId !== 'string') return { valid: false, error: 'transfer_test: missing skillId' };
      if (typeof e.transferType !== 'string') return { valid: false, error: 'transfer_test: missing transferType' };
      if (typeof e.score !== 'number') return { valid: false, error: 'transfer_test: missing score' };
      if (typeof e.passed !== 'boolean') return { valid: false, error: 'transfer_test: missing passed' };
      return { valid: true, event: e as unknown as TransferTestEvent };
    }
    case 'session_start':
    case 'session_end': {
      return { valid: true, event: e as unknown as SessionEvent };
    }
    default:
      return { valid: false, error: `Unknown event type: ${e.type}` };
  }
}
