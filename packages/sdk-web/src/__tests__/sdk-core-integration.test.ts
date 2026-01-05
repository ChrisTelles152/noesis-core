/**
 * SDK-Web to Core Engine Integration Tests
 *
 * Verifies that sdk-web correctly wires to @noesis/core and:
 * - Records practice events with canonical format
 * - Stores events in the event log
 * - Provides session planning via getNextAction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NoesisSDK } from '../NoesisSDK';
import type { Skill } from '@noesis/core';

// Sample skill graph for testing
const testSkills: Skill[] = [
  { id: 'algebra-basics', name: 'Algebra Basics', prerequisites: [] },
  { id: 'linear-equations', name: 'Linear Equations', prerequisites: ['algebra-basics'] },
  { id: 'quadratic-equations', name: 'Quadratic Equations', prerequisites: ['linear-equations'] },
];

describe('SDK-Web to Core Integration', () => {
  let sdk: NoesisSDK;

  beforeEach(() => {
    sdk = new NoesisSDK({
      debug: false,
      modules: ['core'], // Only test core module
      coreConfig: {
        learnerId: 'test-learner',
        skills: testSkills,
      },
    });
  });

  it('should initialize core engine from config', () => {
    expect(sdk.isCoreInitialized()).toBe(true);
    expect(sdk.isModuleActive('core')).toBe(true);
  });

  it('should record practice events with canonical format', () => {
    const event = sdk.recordPractice('algebra-basics', 'item-1', true, 1500);

    expect(event).not.toBeNull();
    expect(event?.type).toBe('practice');
    expect(event?.skillId).toBe('algebra-basics');
    expect(event?.itemId).toBe('item-1');
    expect(event?.correct).toBe(true);
    expect(event?.responseTimeMs).toBe(1500);
    expect(event?.id).toBeDefined();
    expect(event?.timestamp).toBeDefined();
  });

  it('should store events in the event log', () => {
    sdk.recordPractice('algebra-basics', 'item-1', true, 1000);
    sdk.recordPractice('algebra-basics', 'item-2', false, 2000);
    sdk.recordPractice('linear-equations', 'item-3', true, 1500);

    const events = sdk.getEventLog();
    expect(events.length).toBe(3);
    expect(events[0].type).toBe('practice');
    expect(events[1].type).toBe('practice');
    expect(events[2].type).toBe('practice');
  });

  it('should export event log as JSON', () => {
    sdk.recordPractice('algebra-basics', 'item-1', true, 1000);

    const json = sdk.exportEventLog();
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].type).toBe('practice');
  });

  it('should provide next action from session planner', () => {
    const action = sdk.getNextAction();

    expect(action).not.toBeNull();
    expect(action?.type).toBeDefined();
    // Should recommend practicing algebra-basics first (no prereqs)
    expect(action?.skillId).toBe('algebra-basics');
  });

  it('should update recommendations after practice', () => {
    // Practice algebra-basics to mastery (multiple correct responses)
    for (let i = 0; i < 10; i++) {
      sdk.recordPractice('algebra-basics', `item-${i}`, true, 1000);
    }

    const action = sdk.getNextAction();
    expect(action).not.toBeNull();
    // After mastering algebra-basics, should recommend linear-equations
    // (the next skill in the graph whose prerequisites are met)
  });

  it('should include core progress in learner state', () => {
    sdk.recordPractice('algebra-basics', 'item-1', true, 1000);

    const state = sdk.getLearnerState();
    expect(state.coreProgress).toBeDefined();
    expect(state.coreProgress?.learnerId).toBe('test-learner');
    expect(state.coreProgress?.totalSkills).toBe(3);
  });

  it('should allow updating skill graph', () => {
    const newSkills: Skill[] = [
      { id: 'new-skill-1', name: 'New Skill 1', prerequisites: [] },
      { id: 'new-skill-2', name: 'New Skill 2', prerequisites: ['new-skill-1'] },
    ];

    sdk.updateSkillGraph(newSkills);

    const action = sdk.getNextAction();
    expect(action?.skillId).toBe('new-skill-1');
  });

  it('should return null from core methods when core is not initialized', () => {
    const sdkWithoutCore = new NoesisSDK({
      modules: ['attention', 'mastery'],
    });

    expect(sdkWithoutCore.isCoreInitialized()).toBe(false);
    expect(sdkWithoutCore.recordPractice('skill', 'item', true, 1000)).toBeNull();
    expect(sdkWithoutCore.getNextAction()).toBeNull();
    expect(sdkWithoutCore.getEventLog()).toEqual([]);
  });
});
