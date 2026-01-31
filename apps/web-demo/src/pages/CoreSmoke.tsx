/**
 * Core Smoke Test Page
 *
 * Minimal in-browser integration test for @noesis-edu/core.
 * Tests: event generation, getNextAction sequence, export, and deterministic replay.
 */

import { useState, useCallback } from 'react';
import {
  createSkillGraph,
  NoesisCoreEngineImpl,
  createEventFactoryContext,
  createPracticeEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  type NoesisEvent,
  type SessionAction,
  type ClockFn,
  type IdGeneratorFn,
} from '@noesis-edu/core';

// Create deterministic clock and ID generator
function createDeterministicClock(startTime: number = 1700000000000): ClockFn {
  let t = startTime;
  return () => (t += 1000);
}

function createDeterministicIdGenerator(): IdGeneratorFn {
  let n = 0;
  return () => `evt_${++n}`;
}

// Create a test skill graph: A -> B -> C
function createTestGraph() {
  const graph = createSkillGraph();
  graph.addSkill({ id: 'A', name: 'Skill A', prerequisites: [] });
  graph.addSkill({ id: 'B', name: 'Skill B', prerequisites: ['A'] });
  graph.addSkill({ id: 'C', name: 'Skill C', prerequisites: ['B'] });
  return graph;
}

interface SmokeTestResult {
  events: NoesisEvent[];
  actions: SessionAction[];
  success: boolean;
  message: string;
}

// Run a smoke test session
function runSmokeSession(): SmokeTestResult {
  const nowFn = createDeterministicClock();
  const idFn = createDeterministicIdGenerator();
  const ctx = createEventFactoryContext(nowFn, idFn);

  const graph = createTestGraph();
  const engine = new NoesisCoreEngineImpl(graph, {}, nowFn, idFn);

  const learnerId = 'test-learner';
  const sessionId = 'session-001';
  const events: NoesisEvent[] = [];
  const actions: SessionAction[] = [];

  // Session config (full SessionConfig interface)
  const sessionConfig = {
    maxDurationMinutes: 30,
    targetItems: 10,
    masteryThreshold: 0.85,
    enforceSpacedRetrieval: true,
    requireTransferTests: false,
  };

  // 1. Session start
  const startEvent = createSessionStartEvent(ctx, learnerId, sessionId, sessionConfig);
  events.push(startEvent);
  engine.processEvent(startEvent);

  // 2. Get initial action
  actions.push(engine.getNextAction(learnerId, sessionConfig));

  // 3. Practice events with mixed results
  const practiceData = [
    { skillId: 'A', itemId: 'item-1', correct: true },
    { skillId: 'A', itemId: 'item-2', correct: true },
    { skillId: 'B', itemId: 'item-3', correct: false },
  ];

  for (const { skillId, itemId, correct } of practiceData) {
    const event = createPracticeEvent(ctx, learnerId, sessionId, skillId, itemId, correct, 2500);
    events.push(event);
    engine.processEvent(event);
    actions.push(engine.getNextAction(learnerId, sessionConfig));
  }

  // 4. Session end
  const endEvent = createSessionEndEvent(ctx, learnerId, sessionId, {
    durationMinutes: 5,
    itemsAttempted: 3,
    itemsCorrect: 2,
    skillsPracticed: ['A', 'B'],
  });
  events.push(endEvent);
  engine.processEvent(endEvent);

  return {
    events,
    actions,
    success: true,
    message: `Generated ${events.length} events and ${actions.length} actions`,
  };
}

// Verify replay produces identical results
function verifyReplay(
  originalEvents: NoesisEvent[],
  originalActions: SessionAction[]
): { ok: boolean; message: string } {
  // Reset with fresh deterministic generators
  const nowFn = createDeterministicClock();
  const idFn = createDeterministicIdGenerator();

  const graph = createTestGraph();
  const engine = new NoesisCoreEngineImpl(graph, {}, nowFn, idFn);

  const learnerId = 'test-learner';
  const sessionConfig = {
    maxDurationMinutes: 30,
    targetItems: 10,
    masteryThreshold: 0.85,
    enforceSpacedRetrieval: true,
    requireTransferTests: false,
  };

  const replayActions: SessionAction[] = [];

  // Process events and collect actions at same points
  for (let i = 0; i < originalEvents.length; i++) {
    const event = originalEvents[i];
    engine.processEvent(event);

    // After session_start and each practice event, get next action
    if (event.type === 'session_start' || event.type === 'practice') {
      replayActions.push(engine.getNextAction(learnerId, sessionConfig));
    }
  }

  // Compare action sequences
  if (replayActions.length !== originalActions.length) {
    return {
      ok: false,
      message: `Action count mismatch: expected ${originalActions.length}, got ${replayActions.length}`,
    };
  }

  for (let i = 0; i < originalActions.length; i++) {
    const orig = originalActions[i];
    const replay = replayActions[i];

    // Compare action types and skill IDs
    if (orig.type !== replay.type) {
      return {
        ok: false,
        message: `Action ${i} type mismatch: expected ${orig.type}, got ${replay.type}`,
      };
    }

    if (orig.skillId !== replay.skillId) {
      return {
        ok: false,
        message: `Action ${i} skillId mismatch: expected ${orig.skillId}, got ${replay.skillId}`,
      };
    }
  }

  return { ok: true, message: 'Replay OK - all actions match' };
}

export default function CoreSmoke() {
  const [result, setResult] = useState<SmokeTestResult | null>(null);
  const [replayStatus, setReplayStatus] = useState<string>('');

  const handleRunSmoke = useCallback(() => {
    try {
      const testResult = runSmokeSession();
      setResult(testResult);
      setReplayStatus('');
    } catch (error) {
      setResult({
        events: [],
        actions: [],
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!result) return;

    const data = JSON.stringify(
      {
        events: result.events,
        actions: result.actions,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'events.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const handleReplay = useCallback(() => {
    if (!result) return;

    try {
      const { ok, message } = verifyReplay(result.events, result.actions);
      setReplayStatus(ok ? `Replay OK: ${message}` : `Replay FAILED: ${message}`);
    } catch (error) {
      setReplayStatus(`Replay ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [result]);

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Core Engine Smoke Test</h1>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        Tests @noesis-edu/core: event generation, getNextAction sequence, export, and deterministic
        replay.
      </p>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={handleRunSmoke}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Run Core Smoke
        </button>

        <button
          onClick={handleDownload}
          disabled={!result}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: result ? '#10b981' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: result ? 'pointer' : 'not-allowed',
          }}
        >
          Download events.json
        </button>

        <button
          onClick={handleReplay}
          disabled={!result}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: result ? '#8b5cf6' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: result ? 'pointer' : 'not-allowed',
          }}
        >
          Replay and Verify
        </button>
      </div>

      {result && (
        <div style={{ marginBottom: '1rem' }}>
          <strong>Status:</strong> {result.success ? 'Success' : 'Failed'} - {result.message}
        </div>
      )}

      {replayStatus && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: replayStatus.includes('OK') ? '#d1fae5' : '#fee2e2',
            borderRadius: '4px',
            fontWeight: 'bold',
          }}
        >
          {replayStatus}
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <h3>Events ({result.events.length})</h3>
            <textarea
              readOnly
              value={JSON.stringify(result.events, null, 2)}
              style={{
                width: '100%',
                height: '400px',
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '0.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
              }}
            />
          </div>

          <div>
            <h3>Actions ({result.actions.length})</h3>
            <textarea
              readOnly
              value={JSON.stringify(result.actions, null, 2)}
              style={{
                width: '100%',
                height: '400px',
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '0.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
