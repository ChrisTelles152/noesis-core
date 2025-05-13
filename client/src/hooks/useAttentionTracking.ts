import { useState, useEffect, useCallback } from 'react';
import { AttentionData } from '@/sdk/types';
import { useNoesisSDK } from './useNoesisSDK';

// Initial state for attention data
const initialAttentionData: AttentionData = {
  score: 0,
  focusStability: 0,
  cognitiveLoad: 0.3,
  gazePoint: { x: 0, y: 0 },
  timestamp: Date.now(),
  status: 'inactive'
};

export const useAttentionTracking = () => {
  const [attentionData, setAttentionData] = useState<AttentionData>(initialAttentionData);
  const [isTracking, setIsTracking] = useState(false);
  const sdk = useNoesisSDK();

  // Start tracking attention
  const startTracking = useCallback(async (targetElement: HTMLElement | null) => {
    try {
      const success = await sdk.attention.startTracking(targetElement, {
        onAttentionChange: (data) => {
          setAttentionData(data);
        }
      });
      
      setIsTracking(success);
      return success;
    } catch (error) {
      console.error('Failed to start attention tracking:', error);
      setIsTracking(false);
      return false;
    }
  }, [sdk.attention]);

  // Stop tracking attention
  const stopTracking = useCallback(async () => {
    if (isTracking) {
      await sdk.attention.stopTracking();
      setIsTracking(false);
      setAttentionData({
        ...attentionData,
        status: 'inactive'
      });
    }
  }, [isTracking, sdk.attention, attentionData]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isTracking) {
        sdk.attention.stopTracking();
      }
    };
  }, [isTracking, sdk.attention]);

  return {
    attentionData,
    isTracking,
    startTracking,
    stopTracking
  };
};
