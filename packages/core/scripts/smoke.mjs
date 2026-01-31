#!/usr/bin/env node
/* global console, process */
/**
 * Smoke Test for @noesis-edu/core
 *
 * This script verifies that the published surface of @noesis-edu/core works correctly.
 * It uses ONLY the public exports and runs in pure Node.js without any browser or server dependencies.
 *
 * Run with: npx tsx scripts/smoke.mjs
 * Or via npm: npm run smoke (from packages/core or root)
 *
 * Expected output: "✅ All smoke tests passed!"
 *
 * NOTE: We use tsx to handle ESM module resolution with TypeScript paths.
 * This simulates what a TypeScript consumer would experience.
 */

// Import from source - tsx handles TS resolution
// A real consumer would: import { ... } from '@noesis-edu/core'
import {
  createSkillGraph,
  createNoesisCoreEngine,
  createDeterministicEngine,
  createEventFactoryContext,
  createDeterministicIdGenerator,
  createPracticeEvent,
  VERSION,
} from '../src/index.ts';

console.log(`\n🔬 Running @noesis-edu/core smoke test (v${VERSION})\n`);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Create a skill graph
// ─────────────────────────────────────────────────────────────────────────────
test('Create a skill graph with 3 skills', () => {
  const skills = [
    { id: 'algebra', name: 'Algebra', prerequisites: [] },
    { id: 'linear', name: 'Linear Equations', prerequisites: ['algebra'] },
    { id: 'quadratic', name: 'Quadratic Equations', prerequisites: ['linear'] },
  ];

  const graph = createSkillGraph(skills);

  assert(graph.skills.size === 3, 'Should have 3 skills');
  assert(graph.getTopologicalOrder().length === 3, 'Topological order should have 3 skills');
  assert(graph.isPrerequisiteOf('algebra', 'linear'), 'algebra should be prerequisite of linear');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Create engine and learner model
// ─────────────────────────────────────────────────────────────────────────────
test('Create engine and learner model', () => {
  const skills = [
    { id: 'skill-a', name: 'Skill A', prerequisites: [] },
    { id: 'skill-b', name: 'Skill B', prerequisites: ['skill-a'] },
  ];

  const graph = createSkillGraph(skills);
  const engine = createNoesisCoreEngine(graph);

  // Engine should create a model on demand
  const model = engine.getOrCreateLearnerModel('learner-1');
  assert(model !== undefined, 'Should create a learner model');
  assert(model.learnerId === 'learner-1', 'Model should have correct learnerId');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Process practice events
// ─────────────────────────────────────────────────────────────────────────────
test('Process practice events and update model', () => {
  const skills = [{ id: 'math', name: 'Math', prerequisites: [] }];
  const graph = createSkillGraph(skills);

  // Use deterministic engine for reproducibility
  let time = 1000;
  const clock = () => time;
  const engine = createNoesisCoreEngine(graph, {}, clock);

  // Create events with deterministic context
  const idGen = createDeterministicIdGenerator();
  const ctx = createEventFactoryContext(clock, idGen);

  // Process 5 correct practice events
  for (let i = 0; i < 5; i++) {
    time += 1000;
    const event = createPracticeEvent(
      ctx,
      'learner-1',
      'session-1',
      'math',
      `item-${i}`,
      true,
      1000
    );
    engine.processEvent(event);
  }

  const model = engine.getLearnerModel('learner-1');
  assert(model !== undefined, 'Model should exist after processing events');
  assert(model.totalEvents === 5, 'Should have processed 5 events');

  const mathProb = model.skillProbabilities.get('math');
  assert(mathProb !== undefined, 'Should have probability for math skill');
  assert(mathProb.pMastery > 0.5, 'Mastery should increase after correct answers');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Get next action from session planner
// ─────────────────────────────────────────────────────────────────────────────
test('Get next action from session planner', () => {
  const skills = [
    { id: 'basic', name: 'Basic', prerequisites: [] },
    { id: 'intermediate', name: 'Intermediate', prerequisites: ['basic'] },
  ];
  const graph = createSkillGraph(skills);
  const engine = createDeterministicEngine(graph);

  const sessionConfig = {
    maxDurationMinutes: 30,
    targetItems: 20,
    masteryThreshold: 0.85,
    enforceSpacedRetrieval: false,
    requireTransferTests: false,
  };

  const action = engine.getNextAction('learner-1', sessionConfig);

  assert(action !== undefined, 'Should return an action');
  assert(action.type !== undefined, 'Action should have a type');
  assert(action.skillId === 'basic', 'Should recommend basic skill first (no prerequisites)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Deterministic replay
// ─────────────────────────────────────────────────────────────────────────────
test('Deterministic replay produces identical results', () => {
  const skills = [
    { id: 'a', name: 'A', prerequisites: [] },
    { id: 'b', name: 'B', prerequisites: ['a'] },
  ];
  const graph = createSkillGraph(skills);

  // Create two engines with same starting state
  const engine1 = createDeterministicEngine(graph, {}, 0);
  const engine2 = createDeterministicEngine(graph, {}, 0);

  // Same event sequence
  const idGen = createDeterministicIdGenerator();
  let time = 0;
  const events = [
    createPracticeEvent(
      { clock: () => (time += 100), idGenerator: idGen },
      'l1',
      's1',
      'a',
      'i1',
      true,
      500
    ),
    createPracticeEvent(
      { clock: () => (time += 100), idGenerator: idGen },
      'l1',
      's1',
      'a',
      'i2',
      false,
      600
    ),
    createPracticeEvent(
      { clock: () => (time += 100), idGenerator: idGen },
      'l1',
      's1',
      'a',
      'i3',
      true,
      400
    ),
  ];

  // Process events in both engines
  for (const event of events) {
    engine1.processEvent(event);
    engine2.processEvent(event);
  }

  const model1 = engine1.getLearnerModel('l1');
  const model2 = engine2.getLearnerModel('l1');

  assert(model1 !== undefined && model2 !== undefined, 'Both models should exist');
  assert(model1.totalEvents === model2.totalEvents, 'Event counts should match');

  const prob1 = model1.skillProbabilities.get('a')?.pMastery;
  const prob2 = model2.skillProbabilities.get('a')?.pMastery;

  assert(prob1 === prob2, `Mastery probabilities should match: ${prob1} vs ${prob2}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Export and import state
// ─────────────────────────────────────────────────────────────────────────────
test('Export and import state for persistence', () => {
  const skills = [{ id: 'x', name: 'X', prerequisites: [] }];
  const graph = createSkillGraph(skills);
  const engine = createDeterministicEngine(graph, {}, 1000);

  const idGen = createDeterministicIdGenerator();
  const ctx = createEventFactoryContext(() => 1000, idGen);

  engine.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'x', 'i1', true, 500));
  engine.processEvent(createPracticeEvent(ctx, 'l1', 's1', 'x', 'i2', true, 400));

  // Export state
  const exported = engine.exportState();
  assert(typeof exported === 'string', 'Exported state should be a string');
  assert(exported.length > 0, 'Exported state should not be empty');

  // Create new engine and import
  const engine2 = createDeterministicEngine(graph, {}, 1000);
  engine2.importState(exported);

  const model1 = engine.getLearnerModel('l1');
  const model2 = engine2.getLearnerModel('l1');

  assert(model1?.totalEvents === model2?.totalEvents, 'Imported state should match original');
});

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failed === 0) {
  console.log(`✅ All smoke tests passed! (${passed}/${passed + failed})\n`);
  process.exit(0);
} else {
  console.log(`❌ Some smoke tests failed. (${passed}/${passed + failed} passed)\n`);
  process.exit(1);
}
