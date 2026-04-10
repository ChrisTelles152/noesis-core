import { describe, it, expect } from 'vitest';
import {
  createDeterministicEngine,
  createSkillGraph,
  createPracticeEvent,
  createEventFactoryContext,
  createDeterministicIdGenerator,
} from '../index.js';
import type { Skill } from '../constitution.js';

function createTestSkills(): Skill[] {
  return [
    { id: 'arithmetic', name: 'Arithmetic', prerequisites: [] },
    { id: 'algebra', name: 'Algebra', prerequisites: ['arithmetic'] },
  ];
}

describe('Per-User Learning Speed', () => {
  describe('setLearningSpeed / getLearningSpeed', () => {
    it('should return 1.0 by default', () => {
      const engine = createDeterministicEngine(createSkillGraph(createTestSkills()));
      expect(engine.getLearningSpeed('learner-1', 'arithmetic')).toBe(1.0);
    });

    it('should store and retrieve learning speed', () => {
      const engine = createDeterministicEngine(createSkillGraph(createTestSkills()));
      engine.setLearningSpeed('learner-1', 'arithmetic', 1.5);
      expect(engine.getLearningSpeed('learner-1', 'arithmetic')).toBe(1.5);
    });

    it('should clamp speed to [0.5, 2.0]', () => {
      const engine = createDeterministicEngine(createSkillGraph(createTestSkills()));
      engine.setLearningSpeed('learner-1', 'arithmetic', 0.1);
      expect(engine.getLearningSpeed('learner-1', 'arithmetic')).toBe(0.5);

      engine.setLearningSpeed('learner-1', 'arithmetic', 5.0);
      expect(engine.getLearningSpeed('learner-1', 'arithmetic')).toBe(2.0);
    });

    it('should be independent per learner and skill', () => {
      const engine = createDeterministicEngine(createSkillGraph(createTestSkills()));
      engine.setLearningSpeed('learner-1', 'arithmetic', 1.5);
      engine.setLearningSpeed('learner-1', 'algebra', 0.8);
      engine.setLearningSpeed('learner-2', 'arithmetic', 1.2);

      expect(engine.getLearningSpeed('learner-1', 'arithmetic')).toBe(1.5);
      expect(engine.getLearningSpeed('learner-1', 'algebra')).toBe(0.8);
      expect(engine.getLearningSpeed('learner-2', 'arithmetic')).toBe(1.2);
      expect(engine.getLearningSpeed('learner-2', 'algebra')).toBe(1.0);
    });
  });

  describe('FSRS interval scaling', () => {
    it('should produce longer intervals with speed > 1.0', () => {
      const graph = createSkillGraph(createTestSkills());
      const startTime = 1000000;
      const time = startTime;
      const clock = () => time;
      const idGen = createDeterministicIdGenerator('evt');
      const ctx = createEventFactoryContext(clock, idGen);

      // Engine with default speed
      const engineDefault = createDeterministicEngine(graph, {}, startTime);

      // Engine with fast speed
      const engineFast = createDeterministicEngine(
        createSkillGraph(createTestSkills()),
        {},
        startTime
      );
      engineFast.setLearningSpeed('learner-1', 'arithmetic', 1.8);

      // Same practice event for both
      const event = createPracticeEvent(
        ctx,
        'learner-1',
        'session-1',
        'arithmetic',
        'item-1',
        true,
        5000
      );

      engineDefault.processEvent(event);
      engineFast.processEvent(event);

      const statesDefault = engineDefault.getMemoryStates('learner-1');
      const statesFast = engineFast.getMemoryStates('learner-1');

      const defaultNextReview = statesDefault.find((s) => s.skillId === 'arithmetic')!.nextReview;
      const fastNextReview = statesFast.find((s) => s.skillId === 'arithmetic')!.nextReview;

      // Fast learner should have a later nextReview (longer interval)
      expect(fastNextReview).toBeGreaterThan(defaultNextReview);
    });

    it('should produce shorter intervals with speed < 1.0', () => {
      const startTime = 1000000;
      const graph = createSkillGraph(createTestSkills());
      const clock = () => startTime;
      const idGen = createDeterministicIdGenerator('evt');
      const ctx = createEventFactoryContext(clock, idGen);

      const engineDefault = createDeterministicEngine(graph, {}, startTime);
      const engineSlow = createDeterministicEngine(
        createSkillGraph(createTestSkills()),
        {},
        startTime
      );
      engineSlow.setLearningSpeed('learner-1', 'arithmetic', 0.6);

      const event = createPracticeEvent(
        ctx,
        'learner-1',
        'session-1',
        'arithmetic',
        'item-1',
        true,
        5000
      );
      engineDefault.processEvent(event);
      engineSlow.processEvent(event);

      const defaultNext = engineDefault
        .getMemoryStates('learner-1')
        .find((s) => s.skillId === 'arithmetic')!.nextReview;
      const slowNext = engineSlow
        .getMemoryStates('learner-1')
        .find((s) => s.skillId === 'arithmetic')!.nextReview;

      // Slow learner should have an earlier nextReview (shorter interval)
      expect(slowNext).toBeLessThan(defaultNext);
    });
  });

  describe('calibrateLearningSpeed', () => {
    it('should return 1.0 with insufficient data', () => {
      const engine = createDeterministicEngine(createSkillGraph(createTestSkills()));
      expect(engine.calibrateLearningSpeed('learner-1', 'arithmetic', 5)).toBe(1.0);
    });

    it('should return a value in [0.5, 2.0]', () => {
      const startTime = 1000000;
      const graph = createSkillGraph(createTestSkills());
      const engine = createDeterministicEngine(graph, {}, startTime);
      const clock = () => startTime;
      const idGen = createDeterministicIdGenerator('evt');
      const ctx = createEventFactoryContext(clock, idGen);

      // Generate enough practice events
      for (let i = 0; i < 10; i++) {
        const event = createPracticeEvent(
          ctx,
          'learner-1',
          'session-1',
          'arithmetic',
          `item-${i}`,
          true,
          3000
        );
        engine.processEvent(event);
      }

      const speed = engine.calibrateLearningSpeed('learner-1', 'arithmetic', 5);
      expect(speed).toBeGreaterThanOrEqual(0.5);
      expect(speed).toBeLessThanOrEqual(2.0);
    });
  });

  describe('serialization', () => {
    it('should persist learning speeds through export/import', () => {
      const engine = createDeterministicEngine(createSkillGraph(createTestSkills()));
      engine.setLearningSpeed('learner-1', 'arithmetic', 1.5);
      engine.setLearningSpeed('learner-1', 'algebra', 0.7);

      const exported = engine.exportState();
      const engine2 = createDeterministicEngine(createSkillGraph(createTestSkills()));
      engine2.importState(exported);

      expect(engine2.getLearningSpeed('learner-1', 'arithmetic')).toBe(1.5);
      expect(engine2.getLearningSpeed('learner-1', 'algebra')).toBe(0.7);
    });

    it('should handle importing old state without learnerSpeeds', () => {
      const engine = createDeterministicEngine(createSkillGraph(createTestSkills()));
      const exported = engine.exportState();

      // Simulate old state format without learnerSpeeds
      const parsed = JSON.parse(exported);
      delete parsed.learnerSpeeds;
      const oldFormatState = JSON.stringify(parsed);

      const engine2 = createDeterministicEngine(createSkillGraph(createTestSkills()));
      engine2.importState(oldFormatState);

      // Should default to 1.0
      expect(engine2.getLearningSpeed('learner-1', 'arithmetic')).toBe(1.0);
    });
  });
});
