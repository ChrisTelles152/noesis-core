import { describe, it, expect } from 'vitest';
import {
  createDeterministicEngine,
  createSkillGraph,
  createDiagnosticEvent,
  createEventFactoryContext,
  createDeterministicIdGenerator,
} from '../index.js';
import type { Skill, SessionConfig } from '../constitution.js';

const startTime = 1000000;

function createChainSkills(): Skill[] {
  return [
    { id: 'foundation', name: 'Foundation', prerequisites: [] },
    { id: 'intermediate', name: 'Intermediate', prerequisites: ['foundation'] },
    { id: 'advanced', name: 'Advanced', prerequisites: ['intermediate'] },
  ];
}

describe('Prerequisite Subgraph Mastery Enforcement (Phase 4)', () => {
  describe('getEffectiveMastery', () => {
    it('should return own mastery when no prerequisites', () => {
      const engine = createDeterministicEngine(
        createSkillGraph(createChainSkills()),
        {},
        startTime
      );
      const ctx = createEventFactoryContext(() => startTime, createDeterministicIdGenerator('evt'));

      // Set foundation to high mastery via diagnostic
      engine.processEvent(
        createDiagnosticEvent(
          ctx,
          'learner-1',
          'session-1',
          ['foundation'],
          [{ skillId: 'foundation', score: 0.9, itemsAttempted: 5, itemsCorrect: 5 }]
        )
      );

      expect(engine.getEffectiveMastery('learner-1', 'foundation')).toBeCloseTo(0.9, 1);
    });

    it('should return minimum of skill and prerequisites', () => {
      const engine = createDeterministicEngine(
        createSkillGraph(createChainSkills()),
        {},
        startTime
      );
      const ctx = createEventFactoryContext(() => startTime, createDeterministicIdGenerator('evt'));

      // Set via diagnostic: advanced=0.9, intermediate=0.9, foundation=0.4
      engine.processEvent(
        createDiagnosticEvent(
          ctx,
          'learner-1',
          'session-1',
          ['foundation', 'intermediate', 'advanced'],
          [
            { skillId: 'foundation', score: 0.4, itemsAttempted: 5, itemsCorrect: 2 },
            { skillId: 'intermediate', score: 0.9, itemsAttempted: 5, itemsCorrect: 5 },
            { skillId: 'advanced', score: 0.9, itemsAttempted: 5, itemsCorrect: 5 },
          ]
        )
      );

      // Advanced has own mastery ~0.9, but foundation is ~0.4
      // Effective mastery = min(0.9, 0.9, 0.4) ≈ 0.4
      const effective = engine.getEffectiveMastery('learner-1', 'advanced');
      expect(effective).toBeLessThan(0.5);
    });

    it('should return 0 for unknown learner', () => {
      const engine = createDeterministicEngine(
        createSkillGraph(createChainSkills()),
        {},
        startTime
      );
      expect(engine.getEffectiveMastery('unknown', 'foundation')).toBe(0);
    });

    it('should return own mastery when all prerequisites are strong', () => {
      const engine = createDeterministicEngine(
        createSkillGraph(createChainSkills()),
        {},
        startTime
      );
      const ctx = createEventFactoryContext(() => startTime, createDeterministicIdGenerator('evt'));

      // All skills at high mastery
      engine.processEvent(
        createDiagnosticEvent(
          ctx,
          'learner-1',
          'session-1',
          ['foundation', 'intermediate', 'advanced'],
          [
            { skillId: 'foundation', score: 0.95, itemsAttempted: 5, itemsCorrect: 5 },
            { skillId: 'intermediate', score: 0.9, itemsAttempted: 5, itemsCorrect: 5 },
            { skillId: 'advanced', score: 0.85, itemsAttempted: 5, itemsCorrect: 4 },
          ]
        )
      );

      const effective = engine.getEffectiveMastery('learner-1', 'advanced');
      // All prerequisites are >= 0.85, so effective = min of all, which is advanced's own
      expect(effective).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('prerequisite probe in session planner', () => {
    it('should generate prerequisite_probe when mastered skill has decayed prerequisite', () => {
      const engine = createDeterministicEngine(
        createSkillGraph(createChainSkills()),
        {},
        startTime
      );
      const ctx = createEventFactoryContext(() => startTime, createDeterministicIdGenerator('evt'));

      // Foundation low, intermediate high
      engine.processEvent(
        createDiagnosticEvent(
          ctx,
          'learner-1',
          'session-1',
          ['foundation', 'intermediate'],
          [
            { skillId: 'foundation', score: 0.3, itemsAttempted: 5, itemsCorrect: 2 },
            { skillId: 'intermediate', score: 0.95, itemsAttempted: 5, itemsCorrect: 5 },
          ]
        )
      );

      const config: SessionConfig = {
        maxDurationMinutes: 30,
        targetItems: 20,
        masteryThreshold: 0.85,
        enforceSpacedRetrieval: false, // disable to isolate probe behavior
        requireTransferTests: false,
        prerequisiteRevalidationEnabled: true,
        prerequisiteRevalidationThreshold: 0.7,
      };

      const action = engine.getNextAction('learner-1', config);

      expect(action.type).toBe('prerequisite_probe');
      expect(action.skillId).toBe('foundation');
      expect(action.reason).toContain('decayed');
    });

    it('should NOT generate probes when disabled', () => {
      const engine = createDeterministicEngine(
        createSkillGraph(createChainSkills()),
        {},
        startTime
      );
      const ctx = createEventFactoryContext(() => startTime, createDeterministicIdGenerator('evt'));

      engine.processEvent(
        createDiagnosticEvent(
          ctx,
          'learner-1',
          'session-1',
          ['foundation', 'intermediate'],
          [
            { skillId: 'foundation', score: 0.3, itemsAttempted: 5, itemsCorrect: 2 },
            { skillId: 'intermediate', score: 0.95, itemsAttempted: 5, itemsCorrect: 5 },
          ]
        )
      );

      const config: SessionConfig = {
        maxDurationMinutes: 30,
        targetItems: 20,
        masteryThreshold: 0.85,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
        prerequisiteRevalidationEnabled: false,
      };

      const action = engine.getNextAction('learner-1', config);

      // Should not be a probe — probes are disabled
      expect(action.type).not.toBe('prerequisite_probe');
    });

    it('should NOT generate probes when all prerequisites are above threshold', () => {
      const engine = createDeterministicEngine(
        createSkillGraph(createChainSkills()),
        {},
        startTime
      );
      const ctx = createEventFactoryContext(() => startTime, createDeterministicIdGenerator('evt'));

      engine.processEvent(
        createDiagnosticEvent(
          ctx,
          'learner-1',
          'session-1',
          ['foundation', 'intermediate'],
          [
            { skillId: 'foundation', score: 0.9, itemsAttempted: 5, itemsCorrect: 5 },
            { skillId: 'intermediate', score: 0.95, itemsAttempted: 5, itemsCorrect: 5 },
          ]
        )
      );

      const config: SessionConfig = {
        maxDurationMinutes: 30,
        targetItems: 20,
        masteryThreshold: 0.85,
        enforceSpacedRetrieval: false,
        requireTransferTests: false,
        prerequisiteRevalidationEnabled: true,
        prerequisiteRevalidationThreshold: 0.7,
      };

      const action = engine.getNextAction('learner-1', config);

      // Foundation is at 0.9 > 0.7 threshold — no probe needed
      expect(action.type).not.toBe('prerequisite_probe');
    });
  });
});
