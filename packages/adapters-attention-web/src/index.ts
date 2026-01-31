/**
 * @noesis/adapters-attention-web
 *
 * Web-based attention tracking adapter using WebGazer.js or webcam simulation.
 *
 * This is an OPTIONAL adapter for the Noesis system. Attention tracking provides
 * additional context for learning recommendations but is NOT required for the
 * core mastery-based learning loop.
 *
 * @packageDocumentation
 */

export { AttentionTracker } from './attention';
export { WebGazerAdapter, getWebGazerAdapter, resetWebGazerAdapter } from './webgazer-adapter';

export type {
  AttentionData,
  AttentionTrackingOptions,
  AttentionChangeCallback,
  WebcamCaptureOptions,
  GazeData,
  GazeCallback,
} from './types';
