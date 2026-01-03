import {
  AttentionData,
  AttentionTrackingOptions,
  AttentionChangeCallback,
} from './types';
import { WebGazerAdapter, getWebGazerAdapter, GazeData } from './webgazer-adapter';

export class AttentionTracker {
  private options: AttentionTrackingOptions;
  private debug: boolean;
  private isTracking: boolean = false;
  private webcamStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private trackingInterval: number | null = null;
  private targetElement: HTMLElement | null = null;
  private changeCallbacks: AttentionChangeCallback[] = [];
  private webgazerAdapter: WebGazerAdapter | null = null;
  private useRealGazeTracking: boolean = false;
  private lastRealGaze: GazeData | null = null;

  private attentionData: AttentionData = {
    score: 0,
    focusStability: 0,
    cognitiveLoad: 0.3,
    gazePoint: { x: 0, y: 0 },
    timestamp: Date.now(),
    status: 'inactive'
  };

  private attentionHistory: number[] = [];

  constructor(options: AttentionTrackingOptions = {}, debug: boolean = false) {
    this.options = {
      trackingInterval: options.trackingInterval || 500,
      webcamOptions: options.webcamOptions || {
        width: 640,
        height: 480,
        facingMode: 'user'
      },
      attentionThreshold: options.attentionThreshold || 0.7,
      historySize: options.historySize || 20,
      useRealGazeTracking: options.useRealGazeTracking || false,
      showGazePoints: options.showGazePoints || false
    };
    this.debug = debug;
    this.useRealGazeTracking = this.options.useRealGazeTracking || false;
    this.log('AttentionTracker initialized' + (this.useRealGazeTracking ? ' with WebGazer' : ' in simulation mode'));
  }

  /**
   * Start tracking user attention
   * @param targetElement The HTML element containing the learning content
   * @param options Optional overrides for tracking configuration
   */
  async startTracking(
    targetElement: HTMLElement | null,
    options: Partial<AttentionTrackingOptions> = {}
  ): Promise<boolean> {
    if (this.isTracking) {
      this.log('Attention tracking is already active');
      return true;
    }

    // Update options with any provided overrides
    this.options = { ...this.options, ...options };
    this.targetElement = targetElement;

    // Check if useRealGazeTracking was overridden
    if (options.useRealGazeTracking !== undefined) {
      this.useRealGazeTracking = options.useRealGazeTracking;
    }

    try {
      // Initialize gaze tracking (WebGazer or webcam-based)
      if (this.useRealGazeTracking) {
        await this.initializeWebGazer();
      } else if (this.options.webcam !== false) {
        await this.initializeWebcam();
      }

      // Start tracking loop
      this.isTracking = true;
      this.attentionData.status = 'tracking';
      this.startTrackingLoop();

      this.log('Attention tracking started' + (this.useRealGazeTracking ? ' with real gaze tracking' : ''));
      return true;
    } catch (error) {
      this.log('Failed to start attention tracking:', error);
      this.attentionData.status = 'error';
      return false;
    }
  }

  /**
   * Stop tracking user attention and release resources
   */
  async stopTracking(): Promise<void> {
    if (!this.isTracking) return;

    // Clear interval
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    // Clean up WebGazer if used
    if (this.webgazerAdapter) {
      await this.webgazerAdapter.shutdown();
      this.webgazerAdapter = null;
    }

    // Release webcam
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop());
      this.webcamStream = null;
    }

    // Clean up
    this.videoElement = null;
    this.isTracking = false;
    this.attentionData.status = 'inactive';
    this.lastRealGaze = null;

    this.log('Attention tracking stopped');
  }

  /**
   * Register a callback for attention data changes
   */
  onAttentionChange(callback: AttentionChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Get the current attention data
   */
  getCurrentData(): AttentionData {
    return { ...this.attentionData };
  }

  /**
   * Check if real gaze tracking is being used
   */
  isUsingRealGazeTracking(): boolean {
    return this.useRealGazeTracking && this.webgazerAdapter !== null;
  }

  /**
   * Get WebGazer calibration progress (0-1)
   */
  getCalibrationProgress(): number {
    if (this.webgazerAdapter) {
      return this.webgazerAdapter.getCalibrationProgress();
    }
    return 1; // Simulation doesn't need calibration
  }

  /**
   * Initialize WebGazer.js for real gaze tracking
   */
  private async initializeWebGazer(): Promise<void> {
    try {
      this.webgazerAdapter = getWebGazerAdapter(
        this.debug,
        this.options.showGazePoints || false
      );

      const success = await this.webgazerAdapter.initialize();
      if (!success) {
        throw new Error('WebGazer initialization failed');
      }

      // Set up gaze callback to capture real-time gaze data
      this.webgazerAdapter.setGazeCallback((data: GazeData | null) => {
        this.lastRealGaze = data;
      });

      this.log('WebGazer initialized successfully');
    } catch (error) {
      this.log('Error initializing WebGazer, falling back to simulation:', error);
      this.useRealGazeTracking = false;
      // Fall back to webcam-based simulation
      if (this.options.webcam !== false) {
        await this.initializeWebcam();
      }
    }
  }

  /**
   * Initialize webcam for face/gaze tracking (simulation mode)
   */
  private async initializeWebcam(): Promise<void> {
    try {
      // Request webcam access
      const webcamOptions: MediaStreamConstraints = {
        video: this.options.webcamOptions || true,
        audio: false
      };

      this.webcamStream = await navigator.mediaDevices.getUserMedia(webcamOptions);

      // Find an existing video element with id="webcam-feed" or create one if none exists
      this.videoElement = document.querySelector('video') || document.createElement('video');
      this.videoElement.srcObject = this.webcamStream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      // If we created a new element (no existing video found), hide it and append to body
      if (!this.videoElement.parentElement) {
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
      }

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        if (this.videoElement) {
          this.videoElement.onloadedmetadata = () => {
            this.videoElement?.play().catch(err => {
              this.log('Error playing video:', err);
            });
            resolve();
          };
        } else {
          resolve();
        }
      });

      this.log('Webcam initialized successfully');
    } catch (error) {
      this.log('Error initializing webcam:', error);
      throw new Error('Failed to access webcam. Please ensure you have granted camera permissions.');
    }
  }

  /**
   * Start the periodic tracking loop
   */
  private startTrackingLoop(): void {
    this.trackingInterval = window.setInterval(() => {
      this.updateAttentionData();
    }, this.options.trackingInterval || 500);
  }

  /**
   * Update attention data based on available inputs
   */
  private updateAttentionData(): void {
    const now = Date.now();
    const previousScore = this.attentionData.score;

    // Get gaze coordinates (real or simulated)
    let gazeCoordinates: { x: number; y: number };
    let gazeConfidence = 1;

    if (this.useRealGazeTracking && this.lastRealGaze) {
      // Use real gaze data from WebGazer
      gazeCoordinates = { x: this.lastRealGaze.x, y: this.lastRealGaze.y };
      gazeConfidence = this.lastRealGaze.confidence;
    } else {
      // Use simulated gaze tracking
      gazeCoordinates = this.simulateGazeTracking();
    }

    const isUserAttentive = this.isGazeOnTarget(gazeCoordinates);

    // Generate attention score based on gaze
    let newScore = previousScore;

    if (isUserAttentive) {
      // When attentive, score gradually increases
      // With real tracking, confidence affects the rate of increase
      const increment = this.useRealGazeTracking
        ? 0.05 * gazeConfidence + (Math.random() * 0.02)
        : 0.05 + (Math.random() * 0.02);
      newScore = Math.min(1, previousScore + increment);
    } else {
      // When inattentive, score gradually decreases
      const decrement = 0.08 + (Math.random() * 0.03);
      newScore = Math.max(0, previousScore - decrement);
    }

    // Update history for calculating stability
    this.attentionHistory.push(newScore);
    const historySize = this.options.historySize || 10;
    if (this.attentionHistory.length > historySize) {
      this.attentionHistory.shift();
    }

    // Calculate focus stability based on attention variance
    const stabilityScore = this.calculateStabilityScore();

    // Calculate cognitive load
    // With real tracking, use gaze stability as a proxy for cognitive load
    let cognitiveLoad: number;
    if (this.useRealGazeTracking && this.lastRealGaze) {
      // Lower gaze movement = higher cognitive load (user is concentrating)
      cognitiveLoad = 0.3 + (stabilityScore * 0.4);
    } else {
      // Simulate cognitive load
      cognitiveLoad = 0.3 + (Math.random() * 0.4);
    }

    // Update attention data
    this.attentionData = {
      score: newScore,
      focusStability: stabilityScore,
      cognitiveLoad: cognitiveLoad,
      gazePoint: gazeCoordinates,
      timestamp: now,
      status: 'tracking'
    };

    // Log for debugging
    const mode = this.useRealGazeTracking ? 'real' : 'sim';
    this.log(`Attention [${mode}] - score: ${Math.round(newScore * 100)}%, stability: ${Math.round(stabilityScore * 100)}%`);

    // Notify callbacks
    this.notifyCallbacks();
  }

  /**
   * Simulate gaze tracking - used when WebGazer is not available
   */
  private simulateGazeTracking(): { x: number, y: number } {
    if (!this.targetElement) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    const rect = this.targetElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // 70% chance of looking at target when attentive
    const isLookingAtTarget = Math.random() < 0.7;

    if (isLookingAtTarget) {
      // Gaze point near the center of target with some random offset
      return {
        x: centerX + (Math.random() * 100 - 50),
        y: centerY + (Math.random() * 100 - 50)
      };
    } else {
      // Gaze point elsewhere on screen
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight
      };
    }
  }

  /**
   * Check if the gaze point is on the target element
   */
  private isGazeOnTarget(gazePoint: { x: number, y: number }): boolean {
    if (!this.targetElement) return false;

    const rect = this.targetElement.getBoundingClientRect();
    return (
      gazePoint.x >= rect.left &&
      gazePoint.x <= rect.right &&
      gazePoint.y >= rect.top &&
      gazePoint.y <= rect.bottom
    );
  }

  /**
   * Calculate stability score based on attention history variance
   */
  private calculateStabilityScore(): number {
    if (!this.attentionHistory || this.attentionHistory.length < 2) return 1;

    // Calculate variance
    const mean = this.attentionHistory.reduce((sum, val) => sum + val, 0) / this.attentionHistory.length;
    const variance = this.attentionHistory.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / this.attentionHistory.length;

    // Convert variance to stability score (lower variance = higher stability)
    return Math.max(0, Math.min(1, 1 - (variance * 5)));
  }

  /**
   * Notify all registered callbacks with updated attention data
   */
  private notifyCallbacks(): void {
    this.changeCallbacks.forEach(callback => {
      try {
        callback(this.attentionData);
      } catch (error) {
        this.log('Error in attention change callback:', error);
      }
    });
  }

  /**
   * Log messages if debug mode is enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[AttentionTracker] ${message}`, ...args);
    }
  }
}
