import { useState, useEffect } from 'react';
import NoesisSDK from '@/sdk/NoesisSDK';

// Singleton pattern to ensure we only have one SDK instance across the app
let sdkInstance: NoesisSDK | null = null;

export const useNoesisSDK = () => {
  const [sdk, setSdk] = useState<NoesisSDK | null>(null);

  useEffect(() => {
    // Create the SDK instance only once if it doesn't exist
    if (!sdkInstance) {
      sdkInstance = new NoesisSDK({
        apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY || "default_key",
        modules: ['attention', 'mastery', 'orchestration'],
        debug: process.env.NODE_ENV === 'development',
        attentionOptions: {
          trackingInterval: 500, // Update every 500ms
          historySize: 20 // Keep 20 samples for stability calculation
        },
        masteryOptions: {
          threshold: 0.8, // 80% mastery required
          spacingFactor: 2.5 // For spaced repetition algorithm
        }
      });
    }

    setSdk(sdkInstance);
  }, []);

  // Ensure we have a valid SDK to return
  if (!sdk) {
    // This should only happen on the first render
    // Return a minimal placeholder until the real SDK is initialized
    return {
      attention: {
        startTracking: async () => false,
        stopTracking: async () => {},
        getCurrentData: () => ({ 
          score: 0, 
          focusStability: 0, 
          cognitiveLoad: 0,
          gazePoint: { x: 0, y: 0 },
          timestamp: Date.now(),
          status: 'inactive'
        }),
        onAttentionChange: () => {}
      },
      mastery: {
        initialize: () => {},
        recordEvent: () => {},
        getMasteryData: () => ([]),
        getReviewRecommendations: () => ([]),
        getObjectiveProgress: () => null,
        onMasteryUpdate: () => {}
      },
      orchestration: {
        getNextStep: async () => ({ suggestion: '' }),
        suggestEngagement: async () => ({ message: '', type: '' })
      },
      getLearnerState: () => ({ timestamp: Date.now() })
    } as NoesisSDK;
  }

  return sdk;
};
