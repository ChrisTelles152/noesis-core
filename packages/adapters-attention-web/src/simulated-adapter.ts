/**
 * SimulatedAttentionTracker
 *
 * Default attention adapter for the Noesis web SDK. Sources attention from
 * explicit user input (three discrete signals: "focused", "drifting",
 * "break") rather than a webcam-driven eye tracker.
 *
 * Why this is the default:
 *   INTENTION.md, "Explicitly Out of Scope": "No real XR sensor integration
 *   in the first MVP demo (simulated attention via explicit user feedback)."
 *   Brand rules forbid surveillance-adjacent defaults; WebGazer is opt-in
 *   only via the `ENABLE_REAL_GAZE_TRACKING` flag (see useAttentionTracking).
 *
 * Wire-up:
 *   - Implements the same shape as the legacy AttentionTracker
 *     (now exported as WebGazerAttentionTracker) so it slots into NoesisSDK
 *     without code changes upstream.
 *   - Each call to {@link recordState} fires the registered
 *     onAttentionChange callbacks AND, when an event sink is provided in
 *     options, emits a canonical CognitiveStateEvent that flows into the
 *     Core engine via the SDK's existing event pipeline.
 */

import type { AttentionData, AttentionTrackingOptions, AttentionChangeCallback } from './types';
import type {
  CognitiveStateEvent,
  CognitiveStateVector,
  EventFactoryContext,
} from '@noesis-edu/core';
import { createCognitiveStateEvent } from '@noesis-edu/core';

/** Discrete user-reported attention signals. */
export type SimulatedAttentionState = 'focused' | 'drifting' | 'break';

/**
 * Mapping from a user-reported signal to a Cognitive-State Vector.
 *
 * Defaults below reflect the most natural reading: "focused" reports high
 * attention with high confidence; "break" reports zero attention with high
 * confidence; "drifting" reports low-but-not-zero attention. Recall and
 * affect track attention loosely. Consumers can override per-signal via
 * `SimulatedAttentionOptions.mappings`.
 */
const DEFAULT_MAPPINGS: Record<
  SimulatedAttentionState,
  Omit<CognitiveStateVector, 'attention' | 'recallStrength' | 'affect'> & {
    attention: { value: number; confidence: number };
    recallStrength: { value: number; confidence: number };
    affect: { value: number; confidence: number };
  }
> = {
  focused: {
    attention: { value: 1.0, confidence: 1.0 },
    recallStrength: { value: 0.8, confidence: 0.5 },
    affect: { value: 0.7, confidence: 0.5 },
  },
  drifting: {
    attention: { value: 0.3, confidence: 1.0 },
    recallStrength: { value: 0.5, confidence: 0.5 },
    affect: { value: 0.4, confidence: 0.5 },
  },
  break: {
    attention: { value: 0.0, confidence: 1.0 },
    recallStrength: { value: 0.5, confidence: 0.3 },
    affect: { value: 0.6, confidence: 0.3 },
  },
};

/**
 * Configuration for SimulatedAttentionTracker beyond the standard
 * AttentionTrackingOptions.
 *
 * Both `eventContext` and `onCognitiveStateEvent` are optional. When both are
 * present, every call to {@link SimulatedAttentionTracker.recordState} emits
 * a canonical CognitiveStateEvent through the sink. Without them the tracker
 * still works for local UI (onAttentionChange callbacks fire) but does not
 * push events into the Core engine — the consumer can wire that later.
 */
export interface SimulatedAttentionOptions extends AttentionTrackingOptions {
  /**
   * Factory context for emitted CognitiveStateEvents. Provides the clock and
   * idGenerator; matches the determinism contract enforced by Core (Phase A).
   */
  eventContext?: EventFactoryContext;
  /** Sink for emitted CognitiveStateEvents (e.g. forward to engine.processEvent). */
  onCognitiveStateEvent?: (event: CognitiveStateEvent) => void;
  /** Required when emitting events. */
  learnerId?: string;
  /** Required when emitting events. */
  sessionId?: string;
  /** Override the default state → vector mappings. */
  mappings?: Partial<typeof DEFAULT_MAPPINGS>;
}

/**
 * SimulatedAttentionTracker — default attention adapter.
 *
 * Mirrors the public surface of the legacy AttentionTracker
 * (now WebGazerAttentionTracker) so consumers don't need to switch type
 * shapes when defaults flip.
 */
export class SimulatedAttentionTracker {
  private options: SimulatedAttentionOptions;
  private debug: boolean;
  private isTracking: boolean = false;
  private targetElement: HTMLElement | null = null;
  private changeCallbacks: AttentionChangeCallback[] = [];

  private attentionData: AttentionData = {
    score: 0,
    focusStability: 0,
    cognitiveLoad: 0.3,
    gazePoint: { x: 0, y: 0 },
    timestamp: 0,
    status: 'inactive',
  };

  constructor(options: SimulatedAttentionOptions = {}, debug: boolean = false) {
    this.options = options;
    this.debug = debug;
    // Honour an existing clock if provided; otherwise leave timestamp 0
    // until the first recordState call sets it.
    if (options.eventContext) {
      this.attentionData.timestamp = options.eventContext.clock();
    }
    this.log('SimulatedAttentionTracker initialized');
  }

  /**
   * Start the simulated tracker. Mirrors the AttentionTracker shape but does
   * not request webcam access — the only "tracking" is wiring the event sink.
   */
  async startTracking(
    targetElement: HTMLElement | null,
    options: Partial<SimulatedAttentionOptions> = {}
  ): Promise<boolean> {
    if (this.isTracking) {
      this.log('SimulatedAttentionTracker already tracking');
      return true;
    }
    this.options = { ...this.options, ...options };
    this.targetElement = targetElement;
    this.isTracking = true;
    this.attentionData = { ...this.attentionData, status: 'tracking' };
    this.notify();
    this.log('SimulatedAttentionTracker started');
    return true;
  }

  async stopTracking(): Promise<void> {
    if (!this.isTracking) return;
    this.isTracking = false;
    this.attentionData = { ...this.attentionData, status: 'inactive' };
    this.notify();
    // Match AttentionTracker semantics — clear callbacks on stop to prevent
    // leaks across mount cycles.
    this.changeCallbacks = [];
    this.targetElement = null;
    this.log('SimulatedAttentionTracker stopped');
  }

  onAttentionChange(callback: AttentionChangeCallback): () => void {
    this.changeCallbacks.push(callback);
    return () => this.offAttentionChange(callback);
  }

  offAttentionChange(callback: AttentionChangeCallback): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index !== -1) this.changeCallbacks.splice(index, 1);
  }

  removeAllCallbacks(): void {
    this.changeCallbacks = [];
  }

  getCurrentData(): AttentionData {
    return { ...this.attentionData };
  }

  /**
   * Reports `false` always. Provided for interface parity with
   * AttentionTracker so callers can `if (!tracker.isUsingRealGazeTracking())`
   * without runtime error.
   */
  isUsingRealGazeTracking(): boolean {
    return false;
  }

  /**
   * Reports `1` always. The simulated tracker has no calibration phase.
   */
  getCalibrationProgress(): number {
    return 1;
  }

  /**
   * Record an explicit user signal. Updates internal AttentionData, fires
   * onAttentionChange callbacks, and emits a CognitiveStateEvent through the
   * configured sink (when one is provided).
   *
   * This is the single ingestion point — the UI binds this to the three
   * "focused / drifting / break" buttons.
   */
  recordState(state: SimulatedAttentionState): void {
    const mapping = { ...DEFAULT_MAPPINGS[state], ...this.options.mappings?.[state] };
    const ctx = this.options.eventContext;
    const timestamp = ctx ? ctx.clock() : Date.now();

    const vector: CognitiveStateVector = {
      attention: { ...mapping.attention, timestamp },
      recallStrength: { ...mapping.recallStrength, timestamp },
      affect: { ...mapping.affect, timestamp },
    };

    // Update the cached AttentionData so getCurrentData and the legacy
    // change-callback consumers see the new value. We map the cognitive
    // vector down to the legacy fields for back-compat.
    this.attentionData = {
      score: vector.attention.value,
      focusStability: vector.attention.confidence,
      cognitiveLoad: 1 - vector.attention.value,
      gazePoint: { x: 0, y: 0 },
      timestamp,
      status: this.isTracking ? 'tracking' : 'inactive',
    };
    this.notify();

    // Emit the canonical event when the consumer has wired a sink + factory.
    const sink = this.options.onCognitiveStateEvent;
    if (sink && ctx && this.options.learnerId && this.options.sessionId) {
      const event = createCognitiveStateEvent(
        ctx,
        this.options.learnerId,
        this.options.sessionId,
        vector
      );
      sink(event);
    }
  }

  /** Get the configured target element (for the rendering layer). */
  getTargetElement(): HTMLElement | null {
    return this.targetElement;
  }

  private notify(): void {
    for (const cb of this.changeCallbacks) cb({ ...this.attentionData });
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log('[SimulatedAttentionTracker]', ...args);
    }
  }
}
