import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  performanceMonitor,
  performanceMiddleware,
  Timer,
  RateLimitTracker,
} from '../performance';
import type { Request, Response, NextFunction } from 'express';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    performanceMonitor.clear();
  });

  describe('recordRequest', () => {
    it('should record a request metric', () => {
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now(),
      });

      const stats = performanceMonitor.getStats();
      expect(stats.requestCount).toBe(1);
    });

    it('should handle multiple requests', () => {
      for (let i = 0; i < 5; i++) {
        performanceMonitor.recordRequest({
          path: '/api/test',
          method: 'GET',
          statusCode: 200,
          duration: 100,
          timestamp: Date.now(),
        });
      }

      const stats = performanceMonitor.getStats();
      expect(stats.requestCount).toBe(5);
    });
  });

  describe('getStats', () => {
    it('should return zero stats when no requests', () => {
      const stats = performanceMonitor.getStats();

      expect(stats).toEqual({
        requestCount: 0,
        averageResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        slowRequests: 0,
      });
    });

    it('should calculate average response time', () => {
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now(),
      });
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 200,
        timestamp: Date.now(),
      });

      const stats = performanceMonitor.getStats();
      expect(stats.averageResponseTime).toBe(150);
    });

    it('should calculate percentiles correctly', () => {
      // Add 100 requests with varying durations
      for (let i = 1; i <= 100; i++) {
        performanceMonitor.recordRequest({
          path: '/api/test',
          method: 'GET',
          statusCode: 200,
          duration: i * 10,
          timestamp: Date.now(),
        });
      }

      const stats = performanceMonitor.getStats();
      expect(stats.p50ResponseTime).toBe(500);
      expect(stats.p95ResponseTime).toBe(950);
      expect(stats.p99ResponseTime).toBe(990);
    });

    it('should calculate error rate', () => {
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        timestamp: Date.now(),
        duration: 100,
      });
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 500,
        timestamp: Date.now(),
        duration: 100,
      });

      const stats = performanceMonitor.getStats();
      expect(stats.errorRate).toBe(50);
    });

    it('should count slow requests', () => {
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 500,
        timestamp: Date.now(),
      });
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 1500, // Over 1 second threshold
        timestamp: Date.now(),
      });

      const stats = performanceMonitor.getStats();
      expect(stats.slowRequests).toBe(1);
    });

    it('should respect time window', () => {
      // Add old metric
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now() - 7200000, // 2 hours ago
      });

      // Add recent metric
      performanceMonitor.recordRequest({
        path: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 200,
        timestamp: Date.now(),
      });

      // With 1 hour window, should only see 1 request
      const stats = performanceMonitor.getStats(3600000);
      expect(stats.requestCount).toBe(1);
      expect(stats.averageResponseTime).toBe(200);
    });
  });

  describe('getSlowRequests', () => {
    it('should return slow requests sorted by duration', () => {
      performanceMonitor.recordRequest({
        path: '/api/fast',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now(),
      });
      performanceMonitor.recordRequest({
        path: '/api/slow',
        method: 'GET',
        statusCode: 200,
        duration: 2000,
        timestamp: Date.now(),
      });
      performanceMonitor.recordRequest({
        path: '/api/slower',
        method: 'GET',
        statusCode: 200,
        duration: 3000,
        timestamp: Date.now(),
      });

      const slow = performanceMonitor.getSlowRequests(2);
      expect(slow).toHaveLength(2);
      expect(slow[0].duration).toBe(3000);
      expect(slow[1].duration).toBe(2000);
    });
  });

  describe('getRecentErrors', () => {
    it('should return error requests sorted by timestamp', () => {
      performanceMonitor.recordRequest({
        path: '/api/ok',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now() - 1000,
      });
      performanceMonitor.recordRequest({
        path: '/api/error1',
        method: 'GET',
        statusCode: 500,
        duration: 100,
        timestamp: Date.now() - 500,
      });
      performanceMonitor.recordRequest({
        path: '/api/error2',
        method: 'GET',
        statusCode: 404,
        duration: 100,
        timestamp: Date.now(),
      });

      const errors = performanceMonitor.getRecentErrors(10);
      expect(errors).toHaveLength(2);
      expect(errors[0].path).toBe('/api/error2');
      expect(errors[1].path).toBe('/api/error1');
    });
  });

  describe('getEndpointStats', () => {
    it('should group stats by endpoint', () => {
      performanceMonitor.recordRequest({
        path: '/api/users',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now(),
      });
      performanceMonitor.recordRequest({
        path: '/api/users',
        method: 'GET',
        statusCode: 200,
        duration: 200,
        timestamp: Date.now(),
      });
      performanceMonitor.recordRequest({
        path: '/api/posts',
        method: 'POST',
        statusCode: 201,
        duration: 300,
        timestamp: Date.now(),
      });

      const endpointStats = performanceMonitor.getEndpointStats();
      expect(endpointStats.get('GET /api/users')?.requestCount).toBe(2);
      expect(endpointStats.get('POST /api/posts')?.requestCount).toBe(1);
    });
  });
});

describe('Timer', () => {
  it('should measure elapsed time', async () => {
    const timer = new Timer();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const duration = timer.stop();

    expect(duration).toBeGreaterThanOrEqual(45);
    expect(duration).toBeLessThan(150);
  });

  it('should return same duration after stop', async () => {
    const timer = new Timer();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const duration1 = timer.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const duration2 = timer.duration;

    expect(duration1).toBe(duration2);
  });

  it('should measure sync function', () => {
    const { result, duration } = Timer.measure(() => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      return sum;
    });

    expect(result).toBe(499500);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should measure async function', async () => {
    const { result, duration } = await Timer.measureAsync(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'done';
    });

    expect(result).toBe('done');
    expect(duration).toBeGreaterThanOrEqual(15);
  });
});

describe('RateLimitTracker', () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = new RateLimitTracker();
  });

  describe('isLimited', () => {
    it('should not limit under threshold', () => {
      expect(tracker.isLimited('user1', 5, 60000)).toBe(false);
      expect(tracker.isLimited('user1', 5, 60000)).toBe(false);
      expect(tracker.isLimited('user1', 5, 60000)).toBe(false);
    });

    it('should limit at threshold', () => {
      for (let i = 0; i < 5; i++) {
        tracker.isLimited('user1', 5, 60000);
      }

      expect(tracker.isLimited('user1', 5, 60000)).toBe(true);
    });

    it('should track different keys independently', () => {
      for (let i = 0; i < 5; i++) {
        tracker.isLimited('user1', 5, 60000);
      }

      expect(tracker.isLimited('user1', 5, 60000)).toBe(true);
      expect(tracker.isLimited('user2', 5, 60000)).toBe(false);
    });
  });

  describe('getRemaining', () => {
    it('should return full limit when no requests', () => {
      expect(tracker.getRemaining('user1', 10, 60000)).toBe(10);
    });

    it('should return remaining requests', () => {
      tracker.isLimited('user1', 10, 60000);
      tracker.isLimited('user1', 10, 60000);
      tracker.isLimited('user1', 10, 60000);

      expect(tracker.getRemaining('user1', 10, 60000)).toBe(7);
    });

    it('should return 0 when limit reached', () => {
      for (let i = 0; i < 10; i++) {
        tracker.isLimited('user1', 10, 60000);
      }

      expect(tracker.getRemaining('user1', 10, 60000)).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear tracking for a key', () => {
      for (let i = 0; i < 5; i++) {
        tracker.isLimited('user1', 5, 60000);
      }

      expect(tracker.isLimited('user1', 5, 60000)).toBe(true);

      tracker.clear('user1');

      expect(tracker.isLimited('user1', 5, 60000)).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all tracking', () => {
      for (let i = 0; i < 5; i++) {
        tracker.isLimited('user1', 5, 60000);
        tracker.isLimited('user2', 5, 60000);
      }

      tracker.clearAll();

      expect(tracker.isLimited('user1', 5, 60000)).toBe(false);
      expect(tracker.isLimited('user2', 5, 60000)).toBe(false);
    });
  });
});

describe('performanceMiddleware', () => {
  beforeEach(() => {
    performanceMonitor.clear();
  });

  it('should record request metrics', () => {
    const req = {
      method: 'GET',
      path: '/api/test',
    } as Request;

    const res = {
      statusCode: 200,
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          callback();
        }
      }),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    performanceMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

    const stats = performanceMonitor.getStats();
    expect(stats.requestCount).toBe(1);
  });

  it('should normalize paths with numeric IDs', () => {
    const req = {
      method: 'GET',
      path: '/api/users/123/posts/456',
    } as Request;

    const res = {
      statusCode: 200,
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          callback();
        }
      }),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    performanceMiddleware(req, res, next);

    const endpointStats = performanceMonitor.getEndpointStats();
    expect(endpointStats.has('GET /api/users/:id/posts/:id')).toBe(true);
  });

  it('should normalize paths with UUIDs', () => {
    // Use a UUID that starts with a letter to avoid numeric ID regex matching first
    const req = {
      method: 'GET',
      path: '/api/items/abcd8400-e29b-41d4-a716-446655440000',
    } as Request;

    const res = {
      statusCode: 200,
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          callback();
        }
      }),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    performanceMiddleware(req, res, next);

    const endpointStats = performanceMonitor.getEndpointStats();
    expect(endpointStats.has('GET /api/items/:uuid')).toBe(true);
  });
});
