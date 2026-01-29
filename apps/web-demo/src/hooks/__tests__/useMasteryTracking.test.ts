import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the useNoesisSDK hook
const mockMastery = {
  initialize: vi.fn(),
  recordEvent: vi.fn(),
  getMasteryData: vi.fn(() => []),
  getReviewRecommendations: vi.fn(() => []),
  getObjectiveProgress: vi.fn(() => 0.5),
};

const mockSDK = {
  mastery: mockMastery,
  attention: {},
  orchestration: {},
};

vi.mock('../useNoesisSDK', () => ({
  useNoesisSDK: () => mockSDK,
}));

// Import after mocking
import { useMasteryTracking } from '../useMasteryTracking';

describe('useMasteryTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMastery.getMasteryData.mockReturnValue([]);
  });

  describe('initialization', () => {
    it('should initialize with empty objectives by default', () => {
      renderHook(() => useMasteryTracking());

      expect(mockMastery.initialize).toHaveBeenCalledWith({
        objectives: [],
        onMasteryUpdate: expect.any(Function),
      });
    });

    it('should initialize with provided objectives', () => {
      const initialObjectives = [
        { id: 'obj1', name: 'Objective 1', progress: 0 },
        { id: 'obj2', name: 'Objective 2', progress: 0.5 },
      ];

      renderHook(() => useMasteryTracking(initialObjectives));

      expect(mockMastery.initialize).toHaveBeenCalledWith({
        objectives: [
          { id: 'obj1', name: 'Objective 1' },
          { id: 'obj2', name: 'Objective 2' },
        ],
        onMasteryUpdate: expect.any(Function),
      });
    });

    it('should record initial progress for objectives with progress > 0', () => {
      const initialObjectives = [
        { id: 'obj1', name: 'Objective 1', progress: 0 },
        { id: 'obj2', name: 'Objective 2', progress: 0.7 },
      ];

      renderHook(() => useMasteryTracking(initialObjectives));

      // Should only record event for obj2 which has progress > 0
      expect(mockMastery.recordEvent).toHaveBeenCalledTimes(1);
      expect(mockMastery.recordEvent).toHaveBeenCalledWith({
        objectiveId: 'obj2',
        result: 0.7,
        confidence: 1.0,
      });
    });
  });

  describe('recordProgress', () => {
    it('should record progress for an objective', () => {
      const { result } = renderHook(() => useMasteryTracking());

      act(() => {
        result.current.recordProgress('obj1', 0.8);
      });

      expect(mockMastery.recordEvent).toHaveBeenCalledWith({
        objectiveId: 'obj1',
        result: 0.8,
        confidence: undefined,
      });
    });

    it('should record progress with confidence', () => {
      const { result } = renderHook(() => useMasteryTracking());

      act(() => {
        result.current.recordProgress('obj1', 0.9, 0.95);
      });

      expect(mockMastery.recordEvent).toHaveBeenCalledWith({
        objectiveId: 'obj1',
        result: 0.9,
        confidence: 0.95,
      });
    });

    it('should update mastery data after recording', () => {
      const newMasteryData = [
        { id: 'obj1', name: 'Objective 1', mastery: 0.8, lastPracticed: Date.now() },
      ];
      mockMastery.getMasteryData.mockReturnValue(newMasteryData);

      const { result } = renderHook(() => useMasteryTracking());

      act(() => {
        result.current.recordProgress('obj1', 0.8);
      });

      expect(result.current.masteryData).toEqual(newMasteryData);
    });
  });

  describe('getReviewRecommendations', () => {
    it('should return review recommendations from SDK', () => {
      const mockRecommendations = [
        { id: 'obj1', name: 'Objective 1', mastery: 0.4 },
        { id: 'obj2', name: 'Objective 2', mastery: 0.3 },
      ];
      mockMastery.getReviewRecommendations.mockReturnValue(mockRecommendations);

      const { result } = renderHook(() => useMasteryTracking());

      const recommendations = result.current.getReviewRecommendations();

      expect(recommendations).toEqual(mockRecommendations);
      expect(mockMastery.getReviewRecommendations).toHaveBeenCalled();
    });
  });

  describe('getObjectiveProgress', () => {
    it('should return progress for a specific objective', () => {
      mockMastery.getObjectiveProgress.mockReturnValue(0.75);

      const { result } = renderHook(() => useMasteryTracking());

      const progress = result.current.getObjectiveProgress('obj1');

      expect(progress).toBe(0.75);
      expect(mockMastery.getObjectiveProgress).toHaveBeenCalledWith('obj1');
    });

    it('should return null for unknown objective', () => {
      mockMastery.getObjectiveProgress.mockReturnValue(null);

      const { result } = renderHook(() => useMasteryTracking());

      const progress = result.current.getObjectiveProgress('unknown');

      expect(progress).toBeNull();
    });
  });

  describe('masteryData state', () => {
    it('should start with empty mastery data', () => {
      const { result } = renderHook(() => useMasteryTracking());

      expect(result.current.masteryData).toEqual([]);
    });

    it('should update when onMasteryUpdate callback is called', async () => {
      let capturedCallback: ((data: unknown[]) => void) | null = null;

      // Override initialize mock to capture the callback
      mockMastery.initialize.mockImplementation((options: { onMasteryUpdate: (data: unknown[]) => void }) => {
        capturedCallback = options.onMasteryUpdate;
      });

      const { result, rerender } = renderHook(() => useMasteryTracking());

      // Verify callback was captured
      expect(capturedCallback).not.toBeNull();

      const newData = [
        { id: 'obj1', name: 'Test', mastery: 0.9 },
      ];

      // Also update getMasteryData to return the new data (simulating SDK state sync)
      mockMastery.getMasteryData.mockReturnValue(newData);

      // Call the captured callback to simulate SDK triggering an update
      await act(async () => {
        if (capturedCallback) {
          capturedCallback(newData);
        }
      });

      // Force a rerender to pick up the state change
      rerender();

      expect(result.current.masteryData).toEqual(newData);
    });
  });
});
