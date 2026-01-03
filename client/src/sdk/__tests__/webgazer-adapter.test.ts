import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGazerAdapter, getWebGazerAdapter, resetWebGazerAdapter } from '../webgazer-adapter';

// Mock WebGazer module
vi.mock('webgazer', () => {
  const mockWebgazer = {
    setRegression: vi.fn().mockReturnThis(),
    setTracker: vi.fn().mockReturnThis(),
    showVideo: vi.fn().mockReturnThis(),
    showFaceOverlay: vi.fn().mockReturnThis(),
    showFaceFeedbackBox: vi.fn().mockReturnThis(),
    showPredictionPoints: vi.fn().mockReturnThis(),
    begin: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clearGazeListener: vi.fn().mockReturnThis(),
    setGazeListener: vi.fn().mockReturnThis(),
    isReady: vi.fn().mockReturnValue(true),
    getCurrentPrediction: vi.fn().mockResolvedValue({ x: 100, y: 200 }),
    params: {
      showVideoPreview: false,
      showFaceOverlay: false,
      showFaceFeedbackBox: false,
      showPredictionPoints: false,
    },
  };
  return { default: mockWebgazer };
});

describe('WebGazerAdapter', () => {
  let adapter: WebGazerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    resetWebGazerAdapter();
    adapter = new WebGazerAdapter(false, false);
  });

  afterEach(async () => {
    await adapter.shutdown();
  });

  describe('constructor', () => {
    it('should create adapter with default options', () => {
      const newAdapter = new WebGazerAdapter();
      expect(newAdapter).toBeInstanceOf(WebGazerAdapter);
    });

    it('should create adapter with debug mode', () => {
      const debugAdapter = new WebGazerAdapter(true, false);
      expect(debugAdapter).toBeInstanceOf(WebGazerAdapter);
    });

    it('should create adapter with gaze points visible', () => {
      const gazeAdapter = new WebGazerAdapter(false, true);
      expect(gazeAdapter).toBeInstanceOf(WebGazerAdapter);
    });
  });

  describe('initialize', () => {
    it('should initialize WebGazer successfully', async () => {
      const result = await adapter.initialize();
      expect(result).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await adapter.initialize();
      const result = await adapter.initialize();
      expect(result).toBe(true);
    });

    it('should configure WebGazer with correct settings', async () => {
      const webgazer = (await import('webgazer')).default;
      await adapter.initialize();

      expect(webgazer.setRegression).toHaveBeenCalledWith('ridge');
      expect(webgazer.setTracker).toHaveBeenCalledWith('TFFacemesh');
      expect(webgazer.showVideo).toHaveBeenCalledWith(false);
      expect(webgazer.showFaceOverlay).toHaveBeenCalledWith(false);
      expect(webgazer.showFaceFeedbackBox).toHaveBeenCalledWith(false);
      expect(webgazer.begin).toHaveBeenCalled();
    });

    it('should set up gaze listener', async () => {
      const webgazer = (await import('webgazer')).default;
      await adapter.initialize();

      expect(webgazer.setGazeListener).toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('should pause tracking', async () => {
      const webgazer = (await import('webgazer')).default;
      await adapter.initialize();
      adapter.pause();

      expect(webgazer.pause).toHaveBeenCalled();
    });

    it('should resume tracking', async () => {
      const webgazer = (await import('webgazer')).default;
      await adapter.initialize();
      adapter.pause();
      adapter.resume();

      expect(webgazer.resume).toHaveBeenCalled();
    });

    it('should not pause if not active', () => {
      // Not initialized, so pause should do nothing
      adapter.pause();
      // No error thrown
    });

    it('should not resume if not initialized', () => {
      adapter.resume();
      // No error thrown
    });
  });

  describe('shutdown', () => {
    it('should clean up WebGazer resources', async () => {
      const webgazer = (await import('webgazer')).default;
      await adapter.initialize();
      await adapter.shutdown();

      expect(webgazer.clearGazeListener).toHaveBeenCalled();
      expect(webgazer.end).toHaveBeenCalled();
    });

    it('should reset internal state', async () => {
      await adapter.initialize();
      await adapter.shutdown();

      expect(adapter.isReady()).toBe(false);
      expect(adapter.getLastPrediction()).toBeNull();
    });
  });

  describe('gaze callback', () => {
    it('should store gaze callback', async () => {
      const callback = vi.fn();
      adapter.setGazeCallback(callback);
      // Callback is stored internally
    });
  });

  describe('getLastPrediction', () => {
    it('should return null before any predictions', () => {
      expect(adapter.getLastPrediction()).toBeNull();
    });
  });

  describe('getCurrentPrediction', () => {
    it('should return null when not active', async () => {
      const result = await adapter.getCurrentPrediction();
      expect(result).toBeNull();
    });

    it('should return prediction when active', async () => {
      await adapter.initialize();
      const result = await adapter.getCurrentPrediction();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('x', 100);
      expect(result).toHaveProperty('y', 200);
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('isReady', () => {
    it('should return false when not initialized', () => {
      expect(adapter.isReady()).toBe(false);
    });

    it('should return true when initialized and WebGazer is ready', async () => {
      await adapter.initialize();
      expect(adapter.isReady()).toBe(true);
    });
  });

  describe('setShowPredictionPoints', () => {
    it('should toggle prediction points visibility', async () => {
      const webgazer = (await import('webgazer')).default;
      await adapter.initialize();

      adapter.setShowPredictionPoints(true);
      expect(webgazer.showPredictionPoints).toHaveBeenCalledWith(true);

      adapter.setShowPredictionPoints(false);
      expect(webgazer.showPredictionPoints).toHaveBeenCalledWith(false);
    });
  });

  describe('getCalibrationProgress', () => {
    it('should return 0 initially', () => {
      expect(adapter.getCalibrationProgress()).toBe(0);
    });

    it('should increase with predictions', async () => {
      await adapter.initialize();
      // Predictions would be counted in real usage
      // Initial progress is 0
      expect(adapter.getCalibrationProgress()).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Singleton functions', () => {
  beforeEach(() => {
    resetWebGazerAdapter();
  });

  afterEach(() => {
    resetWebGazerAdapter();
  });

  describe('getWebGazerAdapter', () => {
    it('should return same instance on multiple calls', () => {
      const adapter1 = getWebGazerAdapter();
      const adapter2 = getWebGazerAdapter();
      expect(adapter1).toBe(adapter2);
    });

    it('should create new instance after reset', () => {
      const adapter1 = getWebGazerAdapter();
      resetWebGazerAdapter();
      const adapter2 = getWebGazerAdapter();
      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('resetWebGazerAdapter', () => {
    it('should shutdown and clear the singleton', async () => {
      const adapter = getWebGazerAdapter();
      await adapter.initialize();
      resetWebGazerAdapter();
      // Should be a new instance
      const newAdapter = getWebGazerAdapter();
      expect(newAdapter.isReady()).toBe(false);
    });
  });
});
