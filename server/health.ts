/**
 * Health Check System
 * Provides endpoints for monitoring application health
 */

import type { Express, Request, Response } from 'express';
import { getLLMManager } from './llm';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'warn' | 'fail';
      message?: string;
      responseTime?: number;
    };
  };
}

interface ReadinessStatus {
  ready: boolean;
  checks: {
    [key: string]: boolean;
  };
}

// Track startup time
const startTime = Date.now();

/**
 * Check if the LLM provider is available
 */
async function checkLLMProvider(): Promise<{ status: 'pass' | 'warn' | 'fail'; message: string }> {
  try {
    const llm = getLLMManager();
    const hasProvider = llm.hasLLMProvider();

    if (hasProvider) {
      return { status: 'pass', message: `Active provider: ${llm.getActiveProvider()}` };
    } else {
      return { status: 'warn', message: 'Using fallback provider (no API key configured)' };
    }
  } catch (error) {
    return { status: 'fail', message: `LLM check failed: ${error}` };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): { status: 'pass' | 'warn' | 'fail'; message: string } {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const heapUsagePercent = Math.round((used.heapUsed / used.heapTotal) * 100);

  if (heapUsagePercent > 90) {
    return { status: 'fail', message: `High memory usage: ${heapUsedMB}MB/${heapTotalMB}MB (${heapUsagePercent}%)` };
  } else if (heapUsagePercent > 75) {
    return { status: 'warn', message: `Elevated memory usage: ${heapUsedMB}MB/${heapTotalMB}MB (${heapUsagePercent}%)` };
  }

  return { status: 'pass', message: `Memory: ${heapUsedMB}MB/${heapTotalMB}MB (${heapUsagePercent}%)` };
}

/**
 * Check event loop lag
 */
async function checkEventLoop(): Promise<{ status: 'pass' | 'warn' | 'fail'; message: string; responseTime: number }> {
  const start = Date.now();

  return new Promise((resolve) => {
    setImmediate(() => {
      const lag = Date.now() - start;

      if (lag > 100) {
        resolve({ status: 'fail', message: `High event loop lag: ${lag}ms`, responseTime: lag });
      } else if (lag > 50) {
        resolve({ status: 'warn', message: `Elevated event loop lag: ${lag}ms`, responseTime: lag });
      } else {
        resolve({ status: 'pass', message: `Event loop lag: ${lag}ms`, responseTime: lag });
      }
    });
  });
}

/**
 * Setup health check routes
 */
export function setupHealthRoutes(app: Express): void {
  /**
   * Liveness probe - basic check that the server is running
   * Use this for Kubernetes liveness probes
   */
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Readiness probe - check if the server is ready to accept traffic
   * Use this for Kubernetes readiness probes
   */
  app.get('/health/ready', async (_req: Request, res: Response) => {
    const checks: ReadinessStatus['checks'] = {
      llm: false,
    };

    try {
      const llm = getLLMManager();
      checks.llm = true; // LLM manager initialized successfully
    } catch {
      checks.llm = false;
    }

    const ready = Object.values(checks).every(Boolean);

    const status: ReadinessStatus = {
      ready,
      checks,
    };

    res.status(ready ? 200 : 503).json(status);
  });

  /**
   * Full health check - detailed system status
   * Use this for monitoring dashboards
   */
  app.get('/health', async (_req: Request, res: Response) => {
    const startCheck = Date.now();

    const [llmCheck, memoryCheck, eventLoopCheck] = await Promise.all([
      checkLLMProvider(),
      Promise.resolve(checkMemory()),
      checkEventLoop(),
    ]);

    const checks = {
      llm: llmCheck,
      memory: memoryCheck,
      eventLoop: eventLoopCheck,
    };

    // Determine overall status
    const statuses = Object.values(checks).map((c) => c.status);
    let overallStatus: HealthStatus['status'] = 'healthy';

    if (statuses.includes('fail')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('warn')) {
      overallStatus = 'degraded';
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      checks,
    };

    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(healthStatus);
  });

  /**
   * Metrics endpoint - basic metrics for monitoring
   */
  app.get('/health/metrics', (_req: Request, res: Response) => {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    res.json({
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - startTime) / 1000),
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        rss: memory.rss,
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
      nodejs: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  });
}
