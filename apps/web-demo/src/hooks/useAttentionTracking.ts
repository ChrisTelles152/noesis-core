import { useState, useEffect, useCallback } from 'react';
import { AttentionData } from '@/sdk/types';
import {
  SimulatedAttentionTracker,
  WebGazerAttentionTracker,
} from '@noesis/adapters-attention-web';

// Initial state for attention data
const initialAttentionData: AttentionData = {
  score: 0,
  focusStability: 0,
  cognitiveLoad: 0.3,
  gazePoint: { x: 0, y: 0 },
  timestamp: Date.now(),
  status: 'inactive',
};

/**
 * Module-level singleton so multiple components mounting useAttentionTracking
 * share one tracker (the same way useNoesisSDK shares one SDK instance).
 */
let trackerInstance: SimulatedAttentionTracker | WebGazerAttentionTracker | null = null;

/**
 * Test-only — reset the singleton so each test selects its own tracker
 * based on the current env flag. Not part of the public hook contract.
 */
export function _resetAttentionTrackerForTesting(): void {
  trackerInstance = null;
}

/**
 * Choose the attention tracker based on the build-time env flag.
 *
 * `VITE_ENABLE_REAL_GAZE_TRACKING=true` opts the demo into the legacy
 * webcam-driven tracker (WebGazer). Anything else — including unset, 'false',
 * or any other value — yields the SimulatedAttentionTracker, which sources
 * attention from explicit user clicks and emits canonical CognitiveStateEvents.
 *
 * INTENTION.md mandates simulated as the MVP default; WebGazer is opt-in only.
 *
 * Exported (rather than purely internal) so tests can assert which class the
 * hook actually instantiates.
 */
export function getAttentionTracker(): SimulatedAttentionTracker | WebGazerAttentionTracker {
  if (trackerInstance) return trackerInstance;
  const flag = import.meta.env.VITE_ENABLE_REAL_GAZE_TRACKING;
  const useWebGazer = flag === 'true';
  trackerInstance = useWebGazer
    ? new WebGazerAttentionTracker({ useRealGazeTracking: true }, import.meta.env.DEV)
    : new SimulatedAttentionTracker({}, import.meta.env.DEV);
  return trackerInstance;
}

export const useAttentionTracking = () => {
  const [attentionData, setAttentionData] = useState<AttentionData>(initialAttentionData);
  const [isTracking, setIsTracking] = useState(false);
  // Hook owns the tracker selection — sdk.attention from useNoesisSDK is
  // still constructed (it's the SDK's default), but for the demo's attention
  // UI we use the env-flag-driven tracker so the simulated default is the
  // path that actually reaches the screen.
  const tracker = getAttentionTracker();

  // Start tracking attention
  const startTracking = useCallback(
    async (targetElement: HTMLElement | null) => {
      try {
        // Register the callback to ensure we get updates
        tracker.onAttentionChange((data) => {
          setAttentionData(data);
        });

        // Then start tracking
        const success = await tracker.startTracking(targetElement);

        setIsTracking(success);
        return success;
      } catch (error) {
        console.error('Failed to start attention tracking:', error);
        setIsTracking(false);
        return false;
      }
    },
    [tracker]
  );

  // Stop tracking attention
  const stopTracking = useCallback(async () => {
    if (isTracking) {
      await tracker.stopTracking();
      setIsTracking(false);
      setAttentionData((prevData) => ({
        ...prevData,
        status: 'inactive',
      }));
    }
  }, [isTracking, tracker]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isTracking) {
        tracker.stopTracking();
      }
    };
  }, [isTracking, tracker]);

  return {
    attentionData,
    isTracking,
    startTracking,
    stopTracking,
    /** The actual tracker the hook is driving — exposed for diagnostics. */
    tracker,
  };
};
