/**
 * Attention Tracking Types
 *
 * These types define the attention tracking adapter interface.
 * Attention is an OPTIONAL input source for the Noesis system -
 * it is NOT part of the core SDK.
 */

export interface WebcamCaptureOptions {
  width?: number;
  height?: number;
  facingMode?: string;
}

export interface AttentionTrackingOptions {
  webcam?: boolean;
  trackingInterval?: number;
  webcamOptions?: WebcamCaptureOptions;
  onAttentionChange?: AttentionChangeCallback;
  attentionThreshold?: number;
  historySize?: number;
  /** Enable real gaze tracking using WebGazer.js (requires webcam permission) */
  useRealGazeTracking?: boolean;
  /** Show WebGazer calibration/prediction points for debugging */
  showGazePoints?: boolean;
}

export interface AttentionData {
  score: number;
  focusStability: number;
  cognitiveLoad: number;
  gazePoint: { x: number; y: number };
  timestamp: number;
  status: 'inactive' | 'tracking' | 'error';
}

export type AttentionChangeCallback = (data: AttentionData) => void;

/**
 * Gaze data from WebGazer or similar eye tracking system
 */
export interface GazeData {
  x: number;
  y: number;
  timestamp: number;
  confidence: number;
}

export type GazeCallback = (data: GazeData | null) => void;
