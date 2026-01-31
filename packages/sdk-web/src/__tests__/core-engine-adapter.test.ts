/**
 * Core Engine Adapter Tests
 *
 * Tests for CoreEngineAdapter edge cases and branch coverage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoreEngineAdapter, createCoreEngineAdapter } from '../core/CoreEngineAdapter';
import type { Skill } from '@noesis-edu/core';

const testSkills: Skill[] = [
  { id: 'skill-a', name: 'Skill A', prerequisites: [] },
  { id: 'skill-b', name: 'Skill B', prerequisites: ['skill-a'] },
  { id: 'skill-c', name: 'Skill C', prerequisites: ['skill-b'] },
];

describe('CoreEngineAdapter', () => {
  let adapter: CoreEngineAdapter;
  const fixedTime = 1700000000000;

  beforeEach(() => {
    adapter = createCoreEngineAdapter({
      learnerId: 'test-learner',
      skills: testSkills,
      debug: false,
      clock: () => fixedTime,
    });
  });

  describe('initialization', () => {
    it('should create adapter with default options', () => {
      const simpleAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
      });
      expect(simpleAdapter).toBeDefined();
      expect(simpleAdapter.getSessionId()).toBeDefined();
    });

    it('should use custom clock function', () => {
      const customTime = 1234567890000;
      const customAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
        clock: () => customTime,
      });
      const event = customAdapter.startSession();
      expect(event.timestamp).toBe(customTime);
    });

    it('should use custom ID generator', () => {
      let counter = 0;
      const customAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
        idGenerator: () => `custom-id-${++counter}`,
      });
      const event = customAdapter.startSession();
      expect(event.id).toMatch(/^custom-id-/);
    });

    it('should initialize with debug mode', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const debugAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
        debug: true,
      });
      expect(debugAdapter).toBeDefined();
      // Verify that debug logging occurred
      const adapterLogs = consoleSpy.mock.calls.filter((call) =>
        String(call[0]).includes('[CoreEngineAdapter]')
      );
      expect(adapterLogs.length).toBeGreaterThan(0);
      consoleSpy.mockRestore();
    });

    it('should apply custom session config', () => {
      const customAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
        sessionConfig: {
          maxDurationMinutes: 60,
          targetItems: 50,
        },
      });
      expect(customAdapter).toBeDefined();
    });
  });

  describe('session management', () => {
    it('should start a new session', () => {
      const event = adapter.startSession();
      expect(event.type).toBe('session_start');
      expect(event.learnerId).toBe('test-learner');
    });

    it('should end a session with summary', () => {
      adapter.startSession();
      const event = adapter.endSession({
        durationMinutes: 15,
        itemsAttempted: 10,
        itemsCorrect: 8,
        skillsPracticed: ['skill-a', 'skill-b'],
      });
      expect(event.type).toBe('session_end');
      expect(event.summary.durationMinutes).toBe(15);
      expect(event.summary.itemsCorrect).toBe(8);
    });

    it('should generate new session ID on each startSession', () => {
      const id1 = adapter.getSessionId();
      adapter.startSession();
      const id2 = adapter.getSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('practice events', () => {
    it('should record practice event', () => {
      const event = adapter.recordPractice('skill-a', 'item-1', true, 1500);
      expect(event.type).toBe('practice');
      expect(event.skillId).toBe('skill-a');
      expect(event.correct).toBe(true);
    });

    it('should record practice with optional fields', () => {
      const event = adapter.recordPractice('skill-a', 'item-1', false, 2000, {
        confidence: 0.7,
        errorCategory: 'calculation',
      });
      expect(event.correct).toBe(false);
      expect(event.confidence).toBe(0.7);
      expect(event.errorCategory).toBe('calculation');
    });
  });

  describe('diagnostic events', () => {
    it('should record diagnostic event', () => {
      const event = adapter.recordDiagnostic(
        ['skill-a', 'skill-b'],
        [
          { skillId: 'skill-a', score: 0.8, itemsAttempted: 5, itemsCorrect: 4 },
          { skillId: 'skill-b', score: 0.6, itemsAttempted: 5, itemsCorrect: 3 },
        ]
      );
      expect(event.type).toBe('diagnostic');
      expect(event.skillsAssessed).toEqual(['skill-a', 'skill-b']);
      expect(event.results.length).toBe(2);
    });
  });

  describe('skill mastery', () => {
    it('should return 0 for unknown skill', () => {
      const mastery = adapter.getSkillMastery('unknown-skill');
      expect(mastery).toBe(0);
    });

    it('should return mastery for practiced skill', () => {
      // Practice skill-a multiple times
      for (let i = 0; i < 5; i++) {
        adapter.recordPractice('skill-a', `item-${i}`, true, 1000);
      }
      const mastery = adapter.getSkillMastery('skill-a');
      expect(mastery).toBeGreaterThan(0);
    });

    it('should get unmastered skills with default threshold', () => {
      const unmastered = adapter.getUnmasteredSkills();
      expect(Array.isArray(unmastered)).toBe(true);
    });

    it('should get unmastered skills with custom threshold', () => {
      // Practice skill-a
      for (let i = 0; i < 3; i++) {
        adapter.recordPractice('skill-a', `item-${i}`, true, 1000);
      }
      const unmastered = adapter.getUnmasteredSkills(0.5);
      expect(Array.isArray(unmastered)).toBe(true);
    });
  });

  describe('event log', () => {
    it('should get empty event log initially', () => {
      const events = adapter.getEventLog();
      expect(events).toEqual([]);
    });

    it('should accumulate events in log', () => {
      adapter.startSession();
      adapter.recordPractice('skill-a', 'item-1', true, 1000);
      adapter.recordPractice('skill-a', 'item-2', false, 1500);
      const events = adapter.getEventLog();
      expect(events.length).toBe(3);
    });

    it('should export event log as JSON string', () => {
      adapter.recordPractice('skill-a', 'item-1', true, 1000);
      const json = adapter.exportEventLog();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });

    it('should clear event log', () => {
      adapter.recordPractice('skill-a', 'item-1', true, 1000);
      expect(adapter.getEventLog().length).toBe(1);
      adapter.clearEventLog();
      expect(adapter.getEventLog().length).toBe(0);
    });
  });

  describe('session planning', () => {
    it('should get next action', () => {
      const action = adapter.getNextAction();
      expect(action).toBeDefined();
      expect(action.type).toBeDefined();
    });

    it('should plan full session', () => {
      const plan = adapter.planSession();
      expect(Array.isArray(plan)).toBe(true);
    });

    it('should get learner progress', () => {
      adapter.recordPractice('skill-a', 'item-1', true, 1000);
      const progress = adapter.getLearnerProgress();
      expect(progress).toBeDefined();
    });
  });

  describe('engine and graph access', () => {
    it('should expose core engine', () => {
      const engine = adapter.getCoreEngine();
      expect(engine).toBeDefined();
    });

    it('should expose skill graph', () => {
      const graph = adapter.getSkillGraph();
      expect(graph).toBeDefined();
    });

    it('should update skill graph', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const debugAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
        skills: testSkills,
        debug: true,
      });

      const newSkills: Skill[] = [{ id: 'new-skill', name: 'New Skill', prerequisites: [] }];
      debugAdapter.updateSkillGraph(newSkills);

      const action = debugAdapter.getNextAction();
      expect(action.skillId).toBe('new-skill');
      consoleSpy.mockRestore();
    });
  });

  describe('debug logging', () => {
    it('should log when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const debugAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
        debug: true,
      });

      debugAdapter.recordPractice('skill-a', 'item-1', true, 1000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CoreEngineAdapter]'),
        expect.anything(),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should not log when debug is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const quietAdapter = createCoreEngineAdapter({
        learnerId: 'learner-1',
        debug: false,
      });

      quietAdapter.recordPractice('skill-a', 'item-1', true, 1000);

      // Should not have any CoreEngineAdapter logs
      const adapterLogs = consoleSpy.mock.calls.filter((call) =>
        String(call[0]).includes('[CoreEngineAdapter]')
      );
      expect(adapterLogs.length).toBe(0);
      consoleSpy.mockRestore();
    });
  });
});
