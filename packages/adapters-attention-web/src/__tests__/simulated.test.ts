/**
 * SimulatedAttentionTracker tests (Phase D1)
 *
 * Verifies the default attention adapter:
 *   - constructs and matches the public surface of the legacy AttentionTracker.
 *   - emits a CognitiveStateEvent on each user click when wired with a sink.
 *   - the package's `AttentionTracker` symbol now points to it (not WebGazer).
 *
 * The test is environment-agnostic: no DOM beyond what jsdom provides, no
 * webcam, no real WebGazer. That itself is the point — simulated attention
 * is supposed to be friction-free.
 */

import { describe, it, expect, vi } from 'vitest';
import { SimulatedAttentionTracker, AttentionTracker, WebGazerAttentionTracker } from '../index';
import {
  createDeterministicEngine,
  createEventFactoryContext,
  type CognitiveStateEvent,
} from '@noesis-edu/core';
import { createSkillGraph } from '@noesis-edu/core';

describe('Phase D1: SimulatedAttentionTracker', () => {
  it('emits a CognitiveStateEvent on each user click via the configured sink', () => {
    const events: CognitiveStateEvent[] = [];
    let counter = 0;
    const tracker = new SimulatedAttentionTracker({
      eventContext: createEventFactoryContext(
        () => 1000,
        () => `cs-${++counter}`
      ),
      onCognitiveStateEvent: (e) => events.push(e),
      learnerId: 'l1',
      sessionId: 's1',
    });

    tracker.recordState('focused');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('cognitive_state');
    expect(events[0]?.vector.attention.value).toBe(1.0);
    expect(events[0]?.vector.attention.confidence).toBe(1.0);
    expect(events[0]?.id).toBe('cs-1');
    expect(events[0]?.timestamp).toBe(1000);

    tracker.recordState('drifting');
    expect(events).toHaveLength(2);
    expect(events[1]?.vector.attention.value).toBe(0.3);

    tracker.recordState('break');
    expect(events).toHaveLength(3);
    expect(events[2]?.vector.attention.value).toBe(0.0);
  });

  it('updates AttentionData and fires onAttentionChange callbacks on each recordState', async () => {
    const tracker = new SimulatedAttentionTracker();
    const observed: number[] = [];
    tracker.onAttentionChange((d) => observed.push(d.score));

    await tracker.startTracking(null);
    tracker.recordState('focused');
    tracker.recordState('drifting');
    tracker.recordState('break');

    // First push from startTracking (status='tracking'), then 3 from recordState.
    expect(observed.slice(1)).toEqual([1.0, 0.3, 0.0]);
    expect(tracker.getCurrentData().score).toBe(0.0);
    expect(tracker.getCurrentData().status).toBe('tracking');
  });

  it('does not crash when no sink is configured — events just go to onAttentionChange', () => {
    const tracker = new SimulatedAttentionTracker();
    expect(() => tracker.recordState('focused')).not.toThrow();
    expect(tracker.getCurrentData().score).toBe(1.0);
  });

  it('startTracking is a no-op for webcam access (just flips status)', async () => {
    const tracker = new SimulatedAttentionTracker();
    const ok = await tracker.startTracking(null);
    expect(ok).toBe(true);
    expect(tracker.getCurrentData().status).toBe('tracking');
  });

  it('stopTracking clears callbacks and target element (memory-leak hygiene)', async () => {
    const tracker = new SimulatedAttentionTracker();
    const cb = vi.fn();
    tracker.onAttentionChange(cb);

    await tracker.startTracking(document.createElement('div'));
    await tracker.stopTracking();

    // Stop fired the change callback once for the inactive transition.
    expect(cb).toHaveBeenCalled();
    // Subsequent recordState calls should not reach the cleared callback.
    cb.mockClear();
    tracker.recordState('focused');
    expect(cb).not.toHaveBeenCalled();
  });

  it('isUsingRealGazeTracking always reports false; getCalibrationProgress always 1', () => {
    const tracker = new SimulatedAttentionTracker();
    expect(tracker.isUsingRealGazeTracking()).toBe(false);
    expect(tracker.getCalibrationProgress()).toBe(1);
  });

  it('mappings option overrides the default vector for a single signal', () => {
    const events: CognitiveStateEvent[] = [];
    const tracker = new SimulatedAttentionTracker({
      eventContext: createEventFactoryContext(
        () => 0,
        () => 'evt-1'
      ),
      onCognitiveStateEvent: (e) => events.push(e),
      learnerId: 'l1',
      sessionId: 's1',
      mappings: {
        focused: {
          attention: { value: 0.95, confidence: 0.6 },
          recallStrength: { value: 0.9, confidence: 0.6 },
          affect: { value: 0.85, confidence: 0.6 },
        },
      },
    });

    tracker.recordState('focused');
    expect(events[0]?.vector.attention).toEqual({
      value: 0.95,
      confidence: 0.6,
      timestamp: 0,
    });

    // Other signals keep their defaults.
    tracker.recordState('drifting');
    expect(events[1]?.vector.attention.value).toBe(0.3);
  });
});

describe('Phase D1: package default export wiring', () => {
  it("AttentionTracker symbol is the simulated tracker (constructor name === 'SimulatedAttentionTracker')", () => {
    expect(AttentionTracker.name).toBe('SimulatedAttentionTracker');
  });

  it('WebGazerAttentionTracker is exported as the opt-in webcam path', () => {
    expect(WebGazerAttentionTracker).toBeDefined();
    expect(WebGazerAttentionTracker.name).toBe('AttentionTracker');
  });

  it('AttentionTracker and SimulatedAttentionTracker are the same class reference', () => {
    expect(AttentionTracker).toBe(SimulatedAttentionTracker);
  });
});

describe('Phase D1: end-to-end with Core engine', () => {
  it('emitted events flow into the engine and update the cognitive-state timeline', () => {
    const engine = createDeterministicEngine(
      createSkillGraph([{ id: 'a', name: 'A', prerequisites: [] }]),
      {},
      0
    );
    const ctx = createEventFactoryContext(
      () => engine.getCurrentTime(),
      () => engine.generateEventId()
    );

    const tracker = new SimulatedAttentionTracker({
      eventContext: ctx,
      onCognitiveStateEvent: (e) => engine.processEvent(e),
      learnerId: 'l1',
      sessionId: 's1',
    });

    tracker.recordState('focused');
    tracker.recordState('drifting');
    tracker.recordState('break');

    const history = engine.getCognitiveStateHistory('l1');
    expect(history).toHaveLength(3);
    expect(history[0]?.attention.value).toBe(1.0);
    expect(history[1]?.attention.value).toBe(0.3);
    expect(history[2]?.attention.value).toBe(0.0);

    // The engine's "latest" is the most recent click — proves the simulated
    // tracker is the right end of the new pipeline INTENTION mandates:
    // explicit user signal → CognitiveStateEvent → engine reducer.
    expect(engine.getCognitiveState('l1')?.attention.value).toBe(0.0);
  });
});
