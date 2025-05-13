import { useState, useCallback, useEffect } from 'react';
import { LearningObjective, MasteryData } from '@/sdk/types';
import { useNoesisSDK } from './useNoesisSDK';

export const useMasteryTracking = (initialObjectives: { id: string, name: string, progress: number }[] = []) => {
  const [masteryData, setMasteryData] = useState<MasteryData>([]);
  const sdk = useNoesisSDK();

  // Initialize mastery tracking with provided objectives
  useEffect(() => {
    // Convert the initial objectives with progress to format expected by SDK
    const objectives = initialObjectives.map(obj => ({
      id: obj.id,
      name: obj.name
    }));

    // Initialize mastery tracking
    sdk.mastery.initialize({
      objectives,
      onMasteryUpdate: (data) => {
        setMasteryData(data);
      }
    });

    // Set initial progress values after initialization
    initialObjectives.forEach(obj => {
      // Create a synthetic learning event to set the initial progress
      // This uses recordEvent instead of directly modifying state to ensure
      // all the SDK's internal calculations are properly applied
      if (obj.progress > 0) {
        sdk.mastery.recordEvent({
          objectiveId: obj.id,
          result: obj.progress,
          confidence: 1.0 // High confidence for initial setting
        });
      }
    });

    // Get initial mastery data
    setMasteryData(sdk.mastery.getMasteryData());

  }, [sdk.mastery, initialObjectives]);

  // Record progress for a specific objective
  const recordProgress = useCallback((objectiveId: string, result: number, confidence?: number) => {
    sdk.mastery.recordEvent({
      objectiveId,
      result,
      confidence
    });
    
    // Update our local state with the latest data
    setMasteryData(sdk.mastery.getMasteryData());
  }, [sdk.mastery]);

  // Get recommended objectives to review
  const getReviewRecommendations = useCallback(() => {
    return sdk.mastery.getReviewRecommendations();
  }, [sdk.mastery]);

  // Get progress for a specific objective
  const getObjectiveProgress = useCallback((objectiveId: string) => {
    return sdk.mastery.getObjectiveProgress(objectiveId);
  }, [sdk.mastery]);

  return {
    masteryData,
    recordProgress,
    getReviewRecommendations,
    getObjectiveProgress
  };
};
