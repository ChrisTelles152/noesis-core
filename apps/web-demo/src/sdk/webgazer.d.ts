// Type declarations for webgazer
declare module 'webgazer' {
  interface WebGazerPrediction {
    x: number;
    y: number;
  }

  interface WebGazer {
    setGazeListener(
      callback: (data: WebGazerPrediction | null, elapsedTime: number) => void
    ): WebGazer;
    clearGazeListener(): WebGazer;
    begin(): Promise<WebGazer>;
    end(): void;
    pause(): void;
    resume(): void;
    showVideo(show: boolean): WebGazer;
    showFaceOverlay(show: boolean): WebGazer;
    showFaceFeedbackBox(show: boolean): WebGazer;
    showPredictionPoints(show: boolean): WebGazer;
    isReady(): boolean;
    getCurrentPrediction(): Promise<WebGazerPrediction | null>;
    setRegression(type: string): WebGazer;
    setTracker(type: string): WebGazer;
    params: {
      showVideoPreview: boolean;
      showFaceOverlay: boolean;
      showFaceFeedbackBox: boolean;
      showPredictionPoints: boolean;
    };
  }

  const webgazer: WebGazer;
  export default webgazer;
}
