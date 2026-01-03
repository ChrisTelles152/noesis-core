/**
 * WebGazer.js Adapter for Noesis SDK
 *
 * This module provides real gaze tracking using WebGazer.js,
 * an ML-based eye tracking library that works in the browser.
 *
 * @see https://webgazer.cs.brown.edu/
 */

// WebGazer types (the library doesn't have official TypeScript definitions)
interface WebGazerPrediction {
  x: number;
  y: number;
}

interface WebGazerInstance {
  setGazeListener(callback: (data: WebGazerPrediction | null, elapsedTime: number) => void): WebGazerInstance;
  clearGazeListener(): WebGazerInstance;
  begin(): Promise<WebGazerInstance>;
  end(): void;
  pause(): void;
  resume(): void;
  showVideo(show: boolean): WebGazerInstance;
  showFaceOverlay(show: boolean): WebGazerInstance;
  showFaceFeedbackBox(show: boolean): WebGazerInstance;
  showPredictionPoints(show: boolean): WebGazerInstance;
  isReady(): boolean;
  getCurrentPrediction(): Promise<WebGazerPrediction | null>;
  setRegression(type: string): WebGazerInstance;
  setTracker(type: string): WebGazerInstance;
  params: {
    showVideoPreview: boolean;
    showFaceOverlay: boolean;
    showFaceFeedbackBox: boolean;
    showPredictionPoints: boolean;
  };
}

export interface GazeData {
  x: number;
  y: number;
  timestamp: number;
  confidence: number;
}

export type GazeCallback = (data: GazeData | null) => void;

export class WebGazerAdapter {
  private webgazer: WebGazerInstance | null = null;
  private isInitialized: boolean = false;
  private isActive: boolean = false;
  private gazeCallback: GazeCallback | null = null;
  private lastPrediction: GazeData | null = null;
  private predictionCount: number = 0;
  private debug: boolean;
  private showGazePoints: boolean;

  constructor(debug: boolean = false, showGazePoints: boolean = false) {
    this.debug = debug;
    this.showGazePoints = showGazePoints;
  }

  /**
   * Initialize WebGazer.js
   * This will request webcam permission and start loading the ML model
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      this.log("WebGazer already initialized");
      return true;
    }

    try {
      // Dynamically import WebGazer to avoid SSR issues
      const webgazerModule = await import("webgazer");
      this.webgazer = webgazerModule.default as unknown as WebGazerInstance;

      if (!this.webgazer) {
        throw new Error("Failed to load WebGazer module");
      }

      // Configure WebGazer
      this.webgazer
        .setRegression("ridge") // Ridge regression for gaze prediction
        .setTracker("TFFacemesh") // TensorFlow.js facemesh model
        .showVideo(false) // Hide the video preview
        .showFaceOverlay(false) // Hide face overlay
        .showFaceFeedbackBox(false) // Hide feedback box
        .showPredictionPoints(this.showGazePoints); // Optionally show prediction points

      // Start WebGazer
      await this.webgazer.begin();

      // Set up gaze listener
      this.webgazer.setGazeListener((data: WebGazerPrediction | null, elapsedTime: number) => {
        if (data) {
          this.predictionCount++;
          const gazeData: GazeData = {
            x: data.x,
            y: data.y,
            timestamp: Date.now(),
            // Confidence increases as we get more predictions (calibration effect)
            confidence: Math.min(1, this.predictionCount / 100),
          };
          this.lastPrediction = gazeData;

          if (this.gazeCallback) {
            this.gazeCallback(gazeData);
          }
        } else if (this.gazeCallback) {
          this.gazeCallback(null);
        }
      });

      this.isInitialized = true;
      this.isActive = true;
      this.log("WebGazer initialized successfully");
      return true;
    } catch (error) {
      this.log("Failed to initialize WebGazer:", error);
      return false;
    }
  }

  /**
   * Pause gaze tracking (keeps model loaded)
   */
  pause(): void {
    if (this.webgazer && this.isActive) {
      this.webgazer.pause();
      this.isActive = false;
      this.log("WebGazer paused");
    }
  }

  /**
   * Resume gaze tracking
   */
  resume(): void {
    if (this.webgazer && !this.isActive && this.isInitialized) {
      this.webgazer.resume();
      this.isActive = true;
      this.log("WebGazer resumed");
    }
  }

  /**
   * Stop and clean up WebGazer
   */
  async shutdown(): Promise<void> {
    if (this.webgazer) {
      this.webgazer.clearGazeListener();
      this.webgazer.end();
      this.webgazer = null;
    }
    this.isInitialized = false;
    this.isActive = false;
    this.gazeCallback = null;
    this.lastPrediction = null;
    this.predictionCount = 0;
    this.log("WebGazer shut down");
  }

  /**
   * Set a callback for gaze data updates
   */
  setGazeCallback(callback: GazeCallback): void {
    this.gazeCallback = callback;
  }

  /**
   * Get the last known gaze prediction
   */
  getLastPrediction(): GazeData | null {
    return this.lastPrediction;
  }

  /**
   * Get current prediction (async)
   */
  async getCurrentPrediction(): Promise<GazeData | null> {
    if (!this.webgazer || !this.isActive) {
      return null;
    }

    try {
      const prediction = await this.webgazer.getCurrentPrediction();
      if (prediction) {
        return {
          x: prediction.x,
          y: prediction.y,
          timestamp: Date.now(),
          confidence: Math.min(1, this.predictionCount / 100),
        };
      }
    } catch (error) {
      this.log("Error getting current prediction:", error);
    }
    return null;
  }

  /**
   * Check if WebGazer is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.isActive && (this.webgazer?.isReady() ?? false);
  }

  /**
   * Show/hide gaze prediction points on screen
   */
  setShowPredictionPoints(show: boolean): void {
    if (this.webgazer) {
      this.webgazer.showPredictionPoints(show);
    }
  }

  /**
   * Get calibration progress (0-1)
   * More predictions = better calibration
   */
  getCalibrationProgress(): number {
    return Math.min(1, this.predictionCount / 100);
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[WebGazerAdapter] ${message}`, ...args);
    }
  }
}

// Singleton instance for global access
let globalAdapter: WebGazerAdapter | null = null;

export function getWebGazerAdapter(debug: boolean = false, showGazePoints: boolean = false): WebGazerAdapter {
  if (!globalAdapter) {
    globalAdapter = new WebGazerAdapter(debug, showGazePoints);
  }
  return globalAdapter;
}

export function resetWebGazerAdapter(): void {
  if (globalAdapter) {
    globalAdapter.shutdown();
    globalAdapter = null;
  }
}
