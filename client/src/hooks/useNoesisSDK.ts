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
        apiKey: import.meta.env.VITE_OPENAI_API_KEY || "default_key",
        modules: ['attention', 'mastery', 'orchestration'],
        debug: import.meta.env.DEV,
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
    // Create a stub SDK to use until the real one is initialized
    const stubSDK = new NoesisSDK({
      debug: false,
      modules: ['attention', 'mastery', 'orchestration']
    });
    
    return stubSDK;
  }

  return sdk;
};
