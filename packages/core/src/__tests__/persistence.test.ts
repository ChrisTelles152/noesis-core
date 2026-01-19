/**
 * Persistence Adapter Tests
 *
 * Tests for the NoesisStateStore interface and InMemoryStateStore implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { InMemoryStateStore, type NoesisStateStore } from '../persistence';
import { createSkillGraph, type Skill } from '../graph';
import { createDeterministicEngine } from '../engine';
import { createEventFactoryContext, createDeterministicIdGenerator, createPracticeEvent } from '../events';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createTestSkills(): Skill[] {
  return [
    { id: 'arithmetic', name: 'Basic Arithmetic', prerequisites: [] },
    { id: 'algebra', name: 'Algebra', prerequisites: ['arithmetic'] },
  ];
}

// =============================================================================
// IN-MEMORY STATE STORE TESTS
// =============================================================================

describe('InMemoryStateStore', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  it('should return null for non-existent learner', async () => {
    const result = await store.load('non-existent-learner');
    expect(result).toBeNull();
  });

  it('should save and load state correctly', async () => {
    const learnerId = 'learner-1';
    const testState = JSON.stringify({ version: '1.0.0', data: 'test' });

    await store.save(learnerId, testState);
    const loaded = await store.load(learnerId);

    expect(loaded).toBe(testState);
  });

  it('should overwrite existing state on save', async () => {
    const learnerId = 'learner-1';
    const state1 = JSON.stringify({ version: '1.0.0', data: 'first' });
    const state2 = JSON.stringify({ version: '1.0.0', data: 'second' });

    await store.save(learnerId, state1);
    await store.save(learnerId, state2);
    const loaded = await store.load(learnerId);

    expect(loaded).toBe(state2);
  });

  it('should store multiple learners independently', async () => {
    const state1 = JSON.stringify({ learner: '1' });
    const state2 = JSON.stringify({ learner: '2' });

    await store.save('learner-1', state1);
    await store.save('learner-2', state2);

    expect(await store.load('learner-1')).toBe(state1);
    expect(await store.load('learner-2')).toBe(state2);
  });

  it('should clear all state', async () => {
    await store.save('learner-1', 'state1');
    await store.save('learner-2', 'state2');

    store.clear();

    expect(await store.load('learner-1')).toBeNull();
    expect(await store.load('learner-2')).toBeNull();
  });

  it('should report if learner exists with has()', () => {
    store.save('learner-1', 'state');

    expect(store.has('learner-1')).toBe(true);
    expect(store.has('learner-2')).toBe(false);
  });

  it('should return all stored learner IDs with keys()', async () => {
    await store.save('learner-1', 'state1');
    await store.save('learner-2', 'state2');

    const keys = store.keys();

    expect(keys).toContain('learner-1');
    expect(keys).toContain('learner-2');
    expect(keys).toHaveLength(2);
  });
});

// =============================================================================
// INTEGRATION: ENGINE STATE PERSISTENCE
// =============================================================================

describe('Engine State Persistence', () => {
  let store: NoesisStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  it('should save and restore engine state via store', async () => {
    const learnerId = 'test-learner';

    // Create graph and engine
    const graph = createSkillGraph();
    for (const skill of createTestSkills()) {
      graph.addSkill(skill);
    }

    const engine = createDeterministicEngine(graph, {}, 1000);

    // Create and process a practice event
    const ctx = createEventFactoryContext(
      () => 1000,
      createDeterministicIdGenerator('evt')
    );
    const event = createPracticeEvent(
      ctx,
      learnerId,
      'session-1',
      'arithmetic',
      'item-1',
      true,
      500
    );
    engine.processEvent(event);

    // Save state
    const exported = engine.exportState();
    await store.save(learnerId, exported);

    // Create new engine and restore
    const engine2 = createDeterministicEngine(graph, {}, 1000);
    const loaded = await store.load(learnerId);
    expect(loaded).not.toBeNull();
    engine2.importState(loaded!);

    // Verify state was restored
    const model = engine2.getLearnerModel(learnerId);
    expect(model).toBeDefined();
    expect(model!.totalEvents).toBe(1);
  });

  it('should handle missing state gracefully', async () => {
    const loaded = await store.load('unknown-learner');
    expect(loaded).toBeNull();

    // Engine should work fine without loaded state
    const graph = createSkillGraph();
    for (const skill of createTestSkills()) {
      graph.addSkill(skill);
    }
    const engine = createDeterministicEngine(graph);
    const model = engine.getLearnerModel('unknown-learner');
    expect(model).toBeUndefined();
  });
});
