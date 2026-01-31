import { describe, it, expect } from 'vitest';
import {
  cn,
  calculateAttentionScore,
  estimateGazeFromFace,
  getFocusStabilityLabel,
  getCognitiveLoadLabel,
  formatAttentionFeedback,
  type GazePoint,
  type FaceData,
} from '../utils';

describe('cn (className merge utility)', () => {
  it('should merge class names', () => {
    const result = cn('class1', 'class2');
    expect(result).toBe('class1 class2');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    const result = cn('base', isActive && 'active');
    expect(result).toBe('base active');
  });

  it('should filter out falsy values', () => {
    const result = cn('base', false, null, undefined, 'valid');
    expect(result).toBe('base valid');
  });

  it('should handle Tailwind class conflicts', () => {
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });
});

describe('calculateAttentionScore', () => {
  it('should return 0 when no target element', () => {
    const gaze: GazePoint = { x: 100, y: 100 };
    const result = calculateAttentionScore(gaze, null);
    expect(result).toBe(0);
  });

  it('should return 0 when no gaze data', () => {
    const element = document.createElement('div');
    const result = calculateAttentionScore(null, element);
    expect(result).toBe(0);
  });

  it('should return high score when gaze is within element', () => {
    const element = document.createElement('div');
    // Mock getBoundingClientRect
    element.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      top: 0,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const gaze: GazePoint = { x: 100, y: 100 };
    const result = calculateAttentionScore(gaze, element);

    // When in element: 0.8 + random(0-0.2)
    expect(result).toBeGreaterThanOrEqual(0.8);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('should return low score when gaze is outside element', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const gaze: GazePoint = { x: 500, y: 500 };
    const result = calculateAttentionScore(gaze, element);

    // When outside element: 0.2 + random(0-0.3)
    expect(result).toBeGreaterThanOrEqual(0.2);
    expect(result).toBeLessThanOrEqual(0.5);
  });
});

describe('estimateGazeFromFace', () => {
  it('should return center of screen when no face data', () => {
    const result = estimateGazeFromFace(null);
    expect(result.x).toBe(window.innerWidth / 2);
    expect(result.y).toBe(window.innerHeight / 2);
  });

  it('should return center of screen when no landmarks', () => {
    const faceData: FaceData = {};
    const result = estimateGazeFromFace(faceData);
    expect(result.x).toBe(window.innerWidth / 2);
    expect(result.y).toBe(window.innerHeight / 2);
  });

  it('should calculate gaze from eye positions', () => {
    const faceData: FaceData = {
      landmarks: {
        leftEye: { x: 100, y: 100 },
        rightEye: { x: 200, y: 100 },
      },
    };

    const result = estimateGazeFromFace(faceData);

    expect(result.x).toBe(150); // Average of 100 and 200
    expect(result.y).toBe(100); // Both at 100
  });
});

describe('getFocusStabilityLabel', () => {
  it('should return High for scores > 0.8', () => {
    expect(getFocusStabilityLabel(0.9)).toBe('High');
    expect(getFocusStabilityLabel(0.85)).toBe('High');
    expect(getFocusStabilityLabel(1)).toBe('High');
  });

  it('should return Medium for scores > 0.5 and <= 0.8', () => {
    expect(getFocusStabilityLabel(0.6)).toBe('Medium');
    expect(getFocusStabilityLabel(0.7)).toBe('Medium');
    expect(getFocusStabilityLabel(0.8)).toBe('Medium');
  });

  it('should return Low for scores <= 0.5', () => {
    expect(getFocusStabilityLabel(0.5)).toBe('Low');
    expect(getFocusStabilityLabel(0.3)).toBe('Low');
    expect(getFocusStabilityLabel(0)).toBe('Low');
  });
});

describe('getCognitiveLoadLabel', () => {
  it('should return High for scores > 0.7', () => {
    expect(getCognitiveLoadLabel(0.8)).toBe('High');
    expect(getCognitiveLoadLabel(0.75)).toBe('High');
    expect(getCognitiveLoadLabel(1)).toBe('High');
  });

  it('should return Medium for scores > 0.4 and <= 0.7', () => {
    expect(getCognitiveLoadLabel(0.5)).toBe('Medium');
    expect(getCognitiveLoadLabel(0.6)).toBe('Medium');
    expect(getCognitiveLoadLabel(0.7)).toBe('Medium');
  });

  it('should return Low for scores <= 0.4', () => {
    expect(getCognitiveLoadLabel(0.4)).toBe('Low');
    expect(getCognitiveLoadLabel(0.2)).toBe('Low');
    expect(getCognitiveLoadLabel(0)).toBe('Low');
  });
});

describe('formatAttentionFeedback', () => {
  it('should return positive feedback for high scores', () => {
    const result = formatAttentionFeedback(0.9);

    expect(result.message).toContain('excellent');
    expect(result.icon).toContain('text-green');
  });

  it('should return moderate feedback for medium scores', () => {
    const result = formatAttentionFeedback(0.6);

    expect(result.message).toContain('good');
    expect(result.icon).toContain('text-blue');
  });

  it('should return warning feedback for low scores', () => {
    const result = formatAttentionFeedback(0.3);

    expect(result.message).toContain('drifting');
    expect(result.icon).toContain('text-yellow');
  });

  it('should handle boundary cases', () => {
    // Exactly at boundaries
    expect(formatAttentionFeedback(0.75).message).toContain('good');
    expect(formatAttentionFeedback(0.76).message).toContain('excellent');
    expect(formatAttentionFeedback(0.5).message).toContain('drifting');
    expect(formatAttentionFeedback(0.51).message).toContain('good');
  });
});
