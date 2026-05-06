/**
 * Phase H equivalence adapter — MultiChannelBKTEngine (core 0.3.0-rc.0)
 *
 * Wraps `@noesis-edu/core`'s MultiChannelBKTEngine in the ImplAdapter shape
 * defined by `noesis-proof/adelaide/tools/phaseh-equivalence/src/types.ts`.
 *
 * Used by the framework's CLI (`--new <this-file>`) and by future per-vertical
 * push-down runs that compare each vertical's local `bktService.ts` against
 * this adapter on the verticals' own replay fixtures.
 *
 * The framework's adapter-loader does a dynamic `import()` on this file from
 * the proof workspace, so:
 *   1. Imports must resolve at the adapter's filesystem location, not the
 *      framework's. Hence the relative path to MultiChannelBKTEngine.
 *   2. The framework's types are inlined below rather than imported, to avoid
 *      a cross-workspace dependency from packages/core onto the proof repo.
 *      The shapes are mirrors of `phaseh-equivalence/src/types.ts` — see that
 *      file for the canonical definitions and §3 of the framework design doc
 *      (`noesis-proof/adelaide/docs/PHASE_H_EQUIVALENCE_FRAMEWORK.md`) for the
 *      contract.
 */

import {
  MultiChannelBKTEngine,
  type ChannelSkillProbability,
  type MultiChannelBKTConfig,
} from '../../../src/learner/MultiChannelBKTEngine.js';

// ============================================================================
// Inlined framework types (mirrors phaseh-equivalence/src/types.ts)
// ============================================================================

interface ReplayEvent {
  type: string;
  id: string;
  timestamp: number;
  learnerId: string;
  sessionId: string;
  [extra: string]: unknown;
}

interface FixtureMeta {
  fixtureVersion: string;
  id: string;
  concern: string;
  description: string;
  producedBy: string;
  producedAt: string;
  engineModulesUnderTest: string[];
  packId: string;
  packVersion: string;
  seedTime: number;
  learnerId: string;
  sessionId: string;
  stateShapeVersion: string;
}

interface AdapterContext {
  clock: { now(): number };
  idGen: { nextId(): string };
}

interface StepResult<TState> {
  state: TState;
  decision?: unknown;
  metric?: unknown;
  emittedEvents?: ReplayEvent[];
}

interface ImplAdapter<TState> {
  readonly name: string;
  init(opts: { initialState: TState; context: AdapterContext; fixtureMeta: FixtureMeta }): void;
  step(event: ReplayEvent): StepResult<TState>;
  finalize(): TState;
}

type ImplAdapterFactory<TState> = () => ImplAdapter<TState>;

// ============================================================================
// Initial-state.json shape for this fixture concern
// ============================================================================

interface MCBKTInitialState {
  config: MultiChannelBKTConfig;
  /** skillId -> category name (looked up against config.skillCategoryModifiers). */
  skillCategories?: Record<string, string>;
}

// ============================================================================
// Snapshot shape returned by step() / finalize()
// ============================================================================

/**
 * Plain-object snapshot of MCBKT state — Maps converted to Records so the
 * framework's path-based comparator can walk the structure. Keys are sorted
 * lexicographically so the JSON shape is stable across runs.
 */
interface MCBKTSnapshot {
  skills: Record<string, Record<string, ChannelSkillProbability>>;
}

function snapshotEngine(engine: MultiChannelBKTEngine): MCBKTSnapshot {
  const all = engine.getAllStates();
  const skillEntries = [...all.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const skills: Record<string, Record<string, ChannelSkillProbability>> = {};
  for (const [skillId, byChannel] of skillEntries) {
    const channelEntries = [...byChannel.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    const inner: Record<string, ChannelSkillProbability> = {};
    for (const [channelId, state] of channelEntries) {
      inner[channelId] = state;
    }
    skills[skillId] = inner;
  }
  return { skills };
}

// ============================================================================
// Adapter factory
// ============================================================================

const adapterFactory: ImplAdapterFactory<MCBKTSnapshot> = () => {
  let engine: MultiChannelBKTEngine | null = null;
  let skillCategories: Record<string, string> = {};

  return {
    name: 'core.MultiChannelBKTEngine@0.3.0-rc.0',

    init({ initialState }) {
      const init = initialState as unknown as MCBKTInitialState;
      engine = new MultiChannelBKTEngine(init.config);
      skillCategories = init.skillCategories ?? {};
    },

    step(event) {
      if (!engine) throw new Error('adapter.step called before init');

      // Non-practice events leave state untouched. The fixture currently emits
      // only practice events; keeping this branch makes the adapter robust to
      // mixed-event fixtures that future verticals will produce.
      if (event.type !== 'practice') {
        return { state: snapshotEngine(engine) };
      }

      const skillId = String(event.skillId);
      const channel = String(event.channel);
      const correct = Boolean(event.correct);
      const skillCategory = skillCategories[skillId];

      engine.applyAttempt({
        skillId,
        channel,
        correct,
        sessionId: event.sessionId,
        now: event.timestamp,
        skillCategory,
      });

      return { state: snapshotEngine(engine) };
    },

    finalize() {
      if (!engine) throw new Error('adapter.finalize called before init');
      return snapshotEngine(engine);
    },
  };
};

export default adapterFactory;
