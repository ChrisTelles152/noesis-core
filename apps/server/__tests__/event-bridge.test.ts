import { describe, it, expect } from 'vitest';
import {
  coreEventToLearningEvent,
  learningEventToCoreEvent,
  extractCoreEvents,
  isCoreEvent,
  validateNoesisEvent,
} from '../event-bridge';
import type { NoesisEvent, PracticeEvent, DiagnosticEvent, TransferTestEvent, SessionEvent } from '@noesis-edu/core';
import type { LearningEvent } from '@shared/schema';

// --- Test fixtures ---

const practiceEvent: PracticeEvent = {
  id: 'evt-001',
  type: 'practice',
  learnerId: 'learner-1',
  sessionId: 'session-1',
  timestamp: 1700000000000,
  skillId: 'addition',
  itemId: 'q-001',
  correct: true,
  responseTimeMs: 2500,
};

const diagnosticEvent: DiagnosticEvent = {
  id: 'evt-002',
  type: 'diagnostic',
  learnerId: 'learner-1',
  sessionId: 'session-1',
  timestamp: 1700000001000,
  skillsAssessed: ['addition', 'subtraction'],
  results: [
    { skillId: 'addition', score: 0.9, itemsAttempted: 5, itemsCorrect: 4 },
    { skillId: 'subtraction', score: 0.6, itemsAttempted: 5, itemsCorrect: 3 },
  ],
};

const transferEvent: TransferTestEvent = {
  id: 'evt-003',
  type: 'transfer_test',
  learnerId: 'learner-1',
  sessionId: 'session-1',
  timestamp: 1700000002000,
  testId: 'tt-001',
  skillId: 'addition',
  transferType: 'near',
  score: 0.85,
  passed: true,
};

const sessionStartEvent: SessionEvent = {
  id: 'evt-004',
  type: 'session_start',
  learnerId: 'learner-1',
  sessionId: 'session-1',
  timestamp: 1700000003000,
  config: {
    maxDurationMinutes: 30,
    targetItems: 20,
    masteryThreshold: 0.85,
    enforceSpacedRetrieval: true,
    requireTransferTests: false,
  },
};

const sessionEndEvent: SessionEvent = {
  id: 'evt-005',
  type: 'session_end',
  learnerId: 'learner-1',
  sessionId: 'session-1',
  timestamp: 1700000004000,
  summary: {
    durationMinutes: 25,
    itemsAttempted: 18,
    itemsCorrect: 15,
    skillsPracticed: ['addition', 'subtraction'],
  },
};

function makeLearningEvent(id: number, userId: number, type: string, data: Record<string, unknown>, timestamp: Date): LearningEvent {
  return { id, userId, type, data, timestamp } as LearningEvent;
}

// --- Tests ---

describe('Event Bridge', () => {
  describe('coreEventToLearningEvent', () => {
    it('should convert a practice event', () => {
      const result = coreEventToLearningEvent(42, practiceEvent);

      expect(result.userId).toBe(42);
      expect(result.type).toBe('core:practice');
      expect(result.timestamp).toEqual(new Date(1700000000000));
      // _coreEvent is stored as a JSON string for JSONB compatibility
      expect(JSON.parse((result.data as Record<string, unknown>)._coreEvent as string)).toEqual(practiceEvent);
    });

    it('should convert a diagnostic event', () => {
      const result = coreEventToLearningEvent(42, diagnosticEvent);

      expect(result.type).toBe('core:diagnostic');
      expect(JSON.parse((result.data as Record<string, unknown>)._coreEvent as string)).toEqual(diagnosticEvent);
    });

    it('should convert a transfer_test event', () => {
      const result = coreEventToLearningEvent(42, transferEvent);

      expect(result.type).toBe('core:transfer_test');
    });

    it('should convert session_start and session_end events', () => {
      const start = coreEventToLearningEvent(1, sessionStartEvent);
      const end = coreEventToLearningEvent(1, sessionEndEvent);

      expect(start.type).toBe('core:session_start');
      expect(end.type).toBe('core:session_end');
    });
  });

  describe('learningEventToCoreEvent', () => {
    it('should round-trip a practice event', () => {
      const stored = coreEventToLearningEvent(42, practiceEvent);
      const le = makeLearningEvent(1, 42, stored.type, stored.data as Record<string, unknown>, stored.timestamp!);
      const recovered = learningEventToCoreEvent(le);

      expect(recovered).toEqual(practiceEvent);
    });

    it('should round-trip all event types', () => {
      const events: NoesisEvent[] = [practiceEvent, diagnosticEvent, transferEvent, sessionStartEvent, sessionEndEvent];

      for (const event of events) {
        const stored = coreEventToLearningEvent(1, event);
        const le = makeLearningEvent(1, 1, stored.type, stored.data as Record<string, unknown>, stored.timestamp!);
        const recovered = learningEventToCoreEvent(le);
        expect(recovered).toEqual(event);
      }
    });

    it('should return null for legacy server events (no _coreEvent)', () => {
      const legacy = makeLearningEvent(1, 1, 'attention', { attentionScore: 0.8 }, new Date());
      expect(learningEventToCoreEvent(legacy)).toBeNull();
    });

    it('should return null for events with invalid core data', () => {
      const bad = makeLearningEvent(1, 1, 'core:practice', { _coreEvent: { id: 123 } }, new Date());
      expect(learningEventToCoreEvent(bad)).toBeNull();
    });

    it('should return null for null data', () => {
      const noData = makeLearningEvent(1, 1, 'core:practice', null as unknown as Record<string, unknown>, new Date());
      expect(learningEventToCoreEvent(noData)).toBeNull();
    });
  });

  describe('extractCoreEvents', () => {
    it('should filter and sort core events from mixed list', () => {
      const mixed: LearningEvent[] = [
        // Legacy event (should be skipped)
        makeLearningEvent(1, 1, 'attention', { attentionScore: 0.5 }, new Date()),
        // Core events (out of order)
        makeLearningEvent(2, 1, 'core:practice',
          (coreEventToLearningEvent(1, { ...practiceEvent, timestamp: 3000 })).data as Record<string, unknown>,
          new Date(3000)),
        makeLearningEvent(3, 1, 'core:practice',
          (coreEventToLearningEvent(1, { ...practiceEvent, id: 'evt-006', timestamp: 1000 })).data as Record<string, unknown>,
          new Date(1000)),
        // Another legacy event
        makeLearningEvent(4, 1, 'recommendation', { recommendation: 'study more' }, new Date()),
      ];

      const result = extractCoreEvents(mixed);

      expect(result).toHaveLength(2);
      // Should be sorted by timestamp ascending
      expect(result[0].timestamp).toBe(1000);
      expect(result[1].timestamp).toBe(3000);
    });

    it('should return empty array when no core events exist', () => {
      const legacy: LearningEvent[] = [
        makeLearningEvent(1, 1, 'attention', { attentionScore: 0.5 }, new Date()),
      ];

      expect(extractCoreEvents(legacy)).toEqual([]);
    });
  });

  describe('isCoreEvent', () => {
    it('should return true for core events', () => {
      const stored = coreEventToLearningEvent(1, practiceEvent);
      const le = makeLearningEvent(1, 1, stored.type, stored.data as Record<string, unknown>, stored.timestamp!);
      expect(isCoreEvent(le)).toBe(true);
    });

    it('should return false for legacy events', () => {
      const legacy = makeLearningEvent(1, 1, 'attention', { attentionScore: 0.5 }, new Date());
      expect(isCoreEvent(legacy)).toBe(false);
    });
  });

  describe('validateNoesisEvent', () => {
    it('should accept valid practice events', () => {
      const result = validateNoesisEvent(practiceEvent);
      expect(result.valid).toBe(true);
    });

    it('should accept valid diagnostic events', () => {
      const result = validateNoesisEvent(diagnosticEvent);
      expect(result.valid).toBe(true);
    });

    it('should accept valid transfer_test events', () => {
      const result = validateNoesisEvent(transferEvent);
      expect(result.valid).toBe(true);
    });

    it('should accept valid session events', () => {
      expect(validateNoesisEvent(sessionStartEvent).valid).toBe(true);
      expect(validateNoesisEvent(sessionEndEvent).valid).toBe(true);
    });

    it('should reject non-objects', () => {
      expect(validateNoesisEvent(null).valid).toBe(false);
      expect(validateNoesisEvent('string').valid).toBe(false);
      expect(validateNoesisEvent(42).valid).toBe(false);
    });

    it('should reject events missing base fields', () => {
      expect(validateNoesisEvent({ type: 'practice' }).valid).toBe(false);
      expect(validateNoesisEvent({ ...practiceEvent, id: '' }).valid).toBe(false);
      expect(validateNoesisEvent({ ...practiceEvent, learnerId: '' }).valid).toBe(false);
      expect(validateNoesisEvent({ ...practiceEvent, timestamp: -1 }).valid).toBe(false);
    });

    it('should reject practice events missing required fields', () => {
      const { skillId: _, ...noSkill } = practiceEvent;
      expect(validateNoesisEvent(noSkill).valid).toBe(false);

      const { correct: __, ...noCorrect } = practiceEvent;
      expect(validateNoesisEvent(noCorrect).valid).toBe(false);
    });

    it('should reject transfer_test events missing required fields', () => {
      const { testId: _, ...noTestId } = transferEvent;
      expect(validateNoesisEvent(noTestId).valid).toBe(false);
    });

    it('should reject unknown event types', () => {
      const result = validateNoesisEvent({ ...practiceEvent, type: 'unknown_type' });
      expect(result.valid).toBe(false);
    });

    it('should accept practice events with optional fields', () => {
      const withOptional = { ...practiceEvent, confidence: 0.9, errorCategory: 'arithmetic' };
      expect(validateNoesisEvent(withOptional).valid).toBe(true);
    });
  });
});
