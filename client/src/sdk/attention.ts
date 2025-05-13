import { 
  AttentionData, 
  AttentionTrackingOptions, 
  AttentionChangeCallback,
  WebcamCaptureOptions 
} from './types';

export class AttentionTracker {
  private options: AttentionTrackingOptions;
  private debug: boolean;
  private isTracking: boolean = false;
  private webcamStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private trackingInterval: number | null = null;
  private targetElement: HTMLElement | null = null;
  private changeCallbacks: AttentionChangeCallback[] = [];
  
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
      historySize: options.historySize || 20
    };
    this.debug = debug;
    this.log('AttentionTracker initialized');
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
    
    try {
      // Initialize webcam
      if (this.options.webcam !== false) {
        await this.initializeWebcam();
      }

      // Start tracking loop
      this.isTracking = true;
      this.attentionData.status = 'tracking';
      this.startTrackingLoop();
      
      this.log('Attention tracking started');
      return true;
    } catch (error) {
      this.log('Failed to start attention tracking:', error);
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

    // Release webcam
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop());
      this.webcamStream = null;
    }

    // Clean up
    this.videoElement = null;
    this.isTracking = false;
    this.attentionData.status = 'inactive';
    
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
   * Initialize webcam for face/gaze tracking
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
    
    // In a real implementation, this would use computer vision to analyze
    // webcam data for gaze, head pose, etc. For this demo, we'll simulate it.
    const simulatedGazeCoordinates = this.simulateGazeTracking();
    const isUserAttentive = this.isGazeOnTarget(simulatedGazeCoordinates);
    
    // Generate a somewhat realistic attention score
    // In production, this would be based on actual gaze/face analysis
    let newScore = previousScore;
    
    if (isUserAttentive) {
      // When attentive, score gradually increases but with some random fluctuation
      newScore = Math.min(1, previousScore + 0.05 + (Math.random() * 0.02));
    } else {
      // When inattentive, score gradually decreases but with some random fluctuation
      newScore = Math.max(0, previousScore - 0.08 - (Math.random() * 0.03));
    }
    
    // Update history for calculating stability
    this.attentionHistory.push(newScore);
    if (this.attentionHistory.length > this.options.historySize) {
      this.attentionHistory.shift();
    }
    
    // Calculate focus stability based on attention variance
    const stabilityScore = this.calculateStabilityScore();
    
    // Simulate cognitive load (would be more sophisticated in production)
    const cognitiveLoad = 0.3 + (Math.random() * 0.4);
    
    // Update attention data
    this.attentionData = {
      score: newScore,
      focusStability: stabilityScore,
      cognitiveLoad: cognitiveLoad,
      gazePoint: simulatedGazeCoordinates,
      timestamp: now,
      status: 'tracking'
    };
    
    // Notify callbacks
    this.notifyCallbacks();
  }

  /**
   * Simulate gaze tracking - in production this would use proper computer vision
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
    if (this.attentionHistory.length < 2) return 1;
    
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
  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[AttentionTracker] ${message}`, ...args);
    }
  }
}
