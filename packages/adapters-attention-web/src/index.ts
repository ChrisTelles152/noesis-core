/**
 * @noesis/adapters-attention-web
 *
 * Web-based attention tracking adapters for Noesis.
 *
 * Default: {@link SimulatedAttentionTracker} (also exported as
 * `AttentionTracker`). Sources attention from explicit user signals
 * ("focused" / "drifting" / "break") and emits canonical
 * CognitiveStateEvents — no webcam, no surveillance-adjacent default.
 *
 * Opt-in: {@link WebGazerAttentionTracker} (the legacy webcam-driven
 * tracker). Wire this only when a deployment explicitly enables real gaze
 * tracking via `ENABLE_REAL_GAZE_TRACKING=true`. INTENTION.md keeps this
 * out of the MVP path.
 *
 * Both implementations share the same public surface, so the SDK and any
 * consumer can swap them by changing which constructor they call.
 *
 * @packageDocumentation
 */

// Default attention adapter.
export { SimulatedAttentionTracker } from './simulated-adapter';
export type { SimulatedAttentionOptions, SimulatedAttentionState } from './simulated-adapter';

// `AttentionTracker` is the default symbol — a re-export of the simulated
// tracker. INTENTION.md mandates simulated-by-default. Consumers who used
// `import { AttentionTracker }` previously get the safer default for free.
export { SimulatedAttentionTracker as AttentionTracker } from './simulated-adapter';

// Opt-in WebGazer-driven tracker. Renamed from the legacy `AttentionTracker`
// to make the intent explicit at the call site.
export { AttentionTracker as WebGazerAttentionTracker } from './attention';

// Low-level WebGazer adapter (for direct WebGazer integration; rarely needed).
export { WebGazerAdapter, getWebGazerAdapter, resetWebGazerAdapter } from './webgazer-adapter';

export type {
  AttentionData,
  AttentionTrackingOptions,
  AttentionChangeCallback,
  WebcamCaptureOptions,
  GazeData,
  GazeCallback,
} from './types';
