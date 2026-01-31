/**
 * Performance Monitoring
 * Track and report application performance metrics
 *
 * Uses dependency injection pattern:
 * - Configure with configurePerformanceMonitor() before first use
 * - Access via getPerformanceMonitor() for DI-friendly code
 * - Direct import of `performanceMonitor` still works for convenience
 */

import type { Request, Response, NextFunction } from 'express';

// Metric types
export interface RequestMetric {
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

export interface PerformanceStats {
  requestCount: number;
  averageResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  slowRequests: number;
}

/**
 * Performance monitor configuration options
 */
export interface PerformanceMonitorOptions {
  /** Maximum metrics to retain (default: 10000) */
  maxMetrics?: number;
  /** Threshold in ms for slow requests (default: 1000) */
  slowThreshold?: number;
}

export class PerformanceMonitor {
  private metrics: RequestMetric[] = [];
  private maxMetrics: number;
  private slowThreshold: number;

  constructor(options: PerformanceMonitorOptions = {}) {
    this.maxMetrics = options.maxMetrics ?? 10000;
    this.slowThreshold = options.slowThreshold ?? 1000;
  }

  /**
   * Record a request metric
   */
  recordRequest(metric: RequestMetric): void {
    this.metrics.push(metric);

    // Trim old metrics to prevent memory issues
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get performance statistics
   */
  getStats(timeWindowMs: number = 3600000): PerformanceStats {
    const cutoff = Date.now() - timeWindowMs;
    const recentMetrics = this.metrics.filter((m) => m.timestamp >= cutoff);

    if (recentMetrics.length === 0) {
      return {
        requestCount: 0,
        averageResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        slowRequests: 0,
      };
    }

    const durations = recentMetrics.map((m) => m.duration).sort((a, b) => a - b);
    const errorCount = recentMetrics.filter((m) => m.statusCode >= 500).length;
    const slowCount = recentMetrics.filter((m) => m.duration > this.slowThreshold).length;

    return {
      requestCount: recentMetrics.length,
      averageResponseTime: this.average(durations),
      p50ResponseTime: this.percentile(durations, 50),
      p95ResponseTime: this.percentile(durations, 95),
      p99ResponseTime: this.percentile(durations, 99),
      errorRate: (errorCount / recentMetrics.length) * 100,
      slowRequests: slowCount,
    };
  }

  /**
   * Get metrics by endpoint
   */
  getEndpointStats(timeWindowMs: number = 3600000): Map<string, PerformanceStats> {
    const cutoff = Date.now() - timeWindowMs;
    const recentMetrics = this.metrics.filter((m: RequestMetric) => m.timestamp >= cutoff);

    const byEndpoint = new Map<string, RequestMetric[]>();

    for (const metric of recentMetrics) {
      const key = `${metric.method} ${metric.path}`;
      const existing = byEndpoint.get(key) || [];
      existing.push(metric);
      byEndpoint.set(key, existing);
    }

    const stats = new Map<string, PerformanceStats>();

    Array.from(byEndpoint.entries()).forEach(([endpoint, metrics]) => {
      const durations = metrics
        .map((m: RequestMetric) => m.duration)
        .sort((a: number, b: number) => a - b);
      const errorCount = metrics.filter((m: RequestMetric) => m.statusCode >= 500).length;
      const slowCount = metrics.filter(
        (m: RequestMetric) => m.duration > this.slowThreshold
      ).length;

      stats.set(endpoint, {
        requestCount: metrics.length,
        averageResponseTime: this.average(durations),
        p50ResponseTime: this.percentile(durations, 50),
        p95ResponseTime: this.percentile(durations, 95),
        p99ResponseTime: this.percentile(durations, 99),
        errorRate: (errorCount / metrics.length) * 100,
        slowRequests: slowCount,
      });
    });

    return stats;
  }

  /**
   * Get slow requests
   */
  getSlowRequests(limit: number = 10): RequestMetric[] {
    return [...this.metrics]
      .filter((m) => m.duration > this.slowThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): RequestMetric[] {
    return [...this.metrics]
      .filter((m) => m.statusCode >= 400)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Calculate average
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Singleton management
let monitorInstance: PerformanceMonitor | null = null;
let monitorOptions: PerformanceMonitorOptions = {};

/**
 * Configure the performance monitor before first access.
 */
export function configurePerformanceMonitor(options: PerformanceMonitorOptions): void {
  monitorOptions = options;
  monitorInstance = null;
}

/**
 * Get the performance monitor instance (creates on first access).
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!monitorInstance) {
    monitorInstance = new PerformanceMonitor(monitorOptions);
  }
  return monitorInstance;
}

/**
 * Reset the performance monitor singleton (for testing)
 */
export function resetPerformanceMonitor(): void {
  monitorInstance = null;
  monitorOptions = {};
}

// Default instance for convenience (uses getter internally)
export const performanceMonitor = new Proxy({} as PerformanceMonitor, {
  get(_target, prop) {
    const instance = getPerformanceMonitor();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Performance tracking middleware
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Normalize path to avoid cardinality explosion
    const normalizedPath = normalizePath(req.path);

    performanceMonitor.recordRequest({
      path: normalizedPath,
      method: req.method,
      statusCode: res.statusCode,
      duration,
      timestamp: Date.now(),
    });
  });

  next();
}

/**
 * Normalize path to prevent high cardinality
 */
function normalizePath(path: string): string {
  // Replace numeric IDs with :id
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid');
}

/**
 * Simple timer utility for manual measurements
 */
export class Timer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  stop(): number {
    this.endTime = Date.now();
    return this.duration;
  }

  get duration(): number {
    return (this.endTime || Date.now()) - this.startTime;
  }

  static measure<T>(fn: () => T): { result: T; duration: number } {
    const start = Date.now();
    const result = fn();
    return { result, duration: Date.now() - start };
  }

  static async measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    return { result, duration: Date.now() - start };
  }
}

/**
 * Rate limiting tracker
 */
export class RateLimitTracker {
  private requests: Map<string, number[]> = new Map();

  /**
   * Check if a key is rate limited
   */
  isLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = this.requests.get(key) || [];
    const recent = timestamps.filter((t) => t > cutoff);

    this.requests.set(key, [...recent, now]);

    return recent.length >= limit;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string, limit: number, windowMs: number): number {
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = this.requests.get(key) || [];
    const recent = timestamps.filter((t) => t > cutoff);

    return Math.max(0, limit - recent.length);
  }

  /**
   * Clear tracking for a key
   */
  clear(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all tracking
   */
  clearAll(): void {
    this.requests.clear();
  }
}

export default performanceMonitor;
