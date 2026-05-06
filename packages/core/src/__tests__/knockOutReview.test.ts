import { describe, it, expect } from 'vitest';
import {
  createNoesisCoreEngine,
  createSkillGraph,
  createPracticeEvent,
  createEventFactoryContext,
  createDeterministicIdGenerator,
} from '../index.js';
import type { Skill, SessionConfig } from '../constitution.js';

function createEncompassingSkills(): Skill[] {
  return [
    { id: 'a', name: 'A', prerequisites: [] },
    { id: 'b', name: 'B', prerequisites: [] },
    { id: 'c', name: 'C', prerequisites: [] },
    { id: 'x', name: 'X', prerequisites: ['a', 'b', 'c'], encompassedSkills: ['a', 'b', 'c'] },
    { id: 'y', name: 'Y', prerequisites: ['a'], encompassedSkills: ['a'] },
  ];
}

const MS_PER_DAY = 86400000;

/**
 * Create an engine where all skills were practiced long ago and are now due.
 * The engine's clock is set to "now" and the practice happened 365 days ago.
 */
function setupAllDueEngine(now: number) {
  const pastTime = now - 365 * MS_PER_DAY;
  const graph = createSkillGraph(createEncompassingSkills());
  // Use pastTime as clock for initial practice
  let time = pastTime;
  const engine = createNoesisCoreEngine(
    graph,
    {},
    () => time,
    createDeterministicIdGenerator('engine')
  );
  const idGen = createDeterministicIdGenerator('evt');
  const ctx = createEventFactoryContext(() => time, idGen);

  // Practice all skills in the past
  for (const skill of createEncompassingSkills()) {
    engine.processEvent(
      createPracticeEvent(ctx, 'learner-1', 'session-1', skill.id, `item-${skill.id}`, true, 5000)
    );
  }

  // Advance clock to "now" — all skills should be overdue
  time = now;

  // Process one more event to update lastUpdated on the learner model
  engine.processEvent(
    createPracticeEvent(
      createEventFactoryContext(() => time, createDeterministicIdGenerator('now')),
      'learner-1',
      'session-2',
      'a',
      'item-refresh',
      true,
      5000
    )
  );

  return engine;
}

describe('Knock-Out Review Selection (Phase 3)', () => {
  const now = 1000000 + 400 * MS_PER_DAY;

  it('should prefer review that covers most other due skills when enabled', () => {
    const engine = setupAllDueEngine(now);

    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 10,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: true,
      requireTransferTests: false,
      enableKnockOutReviews: true,
    };

    const plan = engine.planSession('learner-1', config);
    const reviewActions = plan.filter((a) => a.type === 'review');

    // With knock-out: X covers a,b,c — fewer total reviews
    expect(reviewActions.length).toBeLessThan(5);

    const xReview = reviewActions.find((a) => a.skillId === 'x');
    expect(xReview).toBeDefined();
    expect(xReview!.reason).toContain('Knock-out');
  });

  it('should fall back to linear selection when disabled', () => {
    const engine = setupAllDueEngine(now);

    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 10,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: true,
      requireTransferTests: false,
      enableKnockOutReviews: false,
    };

    const plan = engine.planSession('learner-1', config);
    const reviewActions = plan.filter((a) => a.type === 'review');

    // a was just practiced (refreshed) so it may not be due.
    // b, c, x, y should all be due (365+ days overdue)
    expect(reviewActions.length).toBeGreaterThanOrEqual(4);
  });

  it('should use knock-out in getNextAction', () => {
    const engine = setupAllDueEngine(now);

    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 20,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: true,
      requireTransferTests: false,
      enableKnockOutReviews: true,
    };

    const action = engine.getNextAction('learner-1', config);

    // Should pick X (covers b,c — a was just refreshed) as the best knock-out
    expect(action.type).toBe('review');
    expect(action.reason).toContain('Knock-out');
  });

  it('should work with skills that have no encompassed skills (no knock-out possible)', () => {
    const skills: Skill[] = [
      { id: 'p', name: 'P', prerequisites: [] },
      { id: 'q', name: 'Q', prerequisites: ['p'] },
    ];
    const graph = createSkillGraph(skills);
    const pastTime = now - 365 * MS_PER_DAY;
    let time = pastTime;
    const engine = createNoesisCoreEngine(
      graph,
      {},
      () => time,
      createDeterministicIdGenerator('engine')
    );
    const idGen = createDeterministicIdGenerator('evt');
    const ctx = createEventFactoryContext(() => time, idGen);

    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 's1', 'p', 'i1', true, 5000));
    engine.processEvent(createPracticeEvent(ctx, 'learner-1', 's1', 'q', 'i2', true, 5000));

    time = now;
    engine.processEvent(
      createPracticeEvent(
        createEventFactoryContext(() => time, createDeterministicIdGenerator('r')),
        'learner-1',
        's2',
        'p',
        'i3',
        true,
        5000
      )
    );

    const config: SessionConfig = {
      maxDurationMinutes: 30,
      targetItems: 10,
      masteryThreshold: 0.85,
      enforceSpacedRetrieval: true,
      requireTransferTests: false,
      enableKnockOutReviews: true,
    };

    const plan = engine.planSession('learner-1', config);
    const reviewActions = plan.filter((a) => a.type === 'review');

    // q is due but no knock-out possible — should still be reviewed
    expect(reviewActions.length).toBeGreaterThanOrEqual(1);
    // No knock-out reason since no encompassed skills
    const knockOutActions = reviewActions.filter((a) => a.reason.includes('Knock-out'));
    expect(knockOutActions.length).toBe(0);
  });
});
