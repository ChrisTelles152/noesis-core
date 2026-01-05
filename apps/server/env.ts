/**
 * Environment Validation and Configuration
 * Validates and provides typed access to environment variables
 */

import { z } from 'zod';

// Default port (5174 avoids macOS AirPlay Receiver conflict on port 5000)
export const DEFAULT_PORT = 5174;

// Environment variable schema
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server port (defaults to 5174 to avoid macOS AirPlay conflict on 5000)
  PORT: z.string().transform(v => parseInt(v, 10)).pipe(z.number().min(1).max(65535)).optional(),

  // LLM Providers (at least one optional)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Database (optional for in-memory mode)
  DATABASE_URL: z.string().url().optional(),

  // Security
  SESSION_SECRET: z.string().min(16).optional(),
  DISABLE_CSRF: z.string().transform(v => v === 'true').optional(),
  ALLOWED_ORIGINS: z.string().optional(),

  // Feature flags
  ENABLE_REAL_GAZE_TRACKING: z.string().transform(v => v === 'true').optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

// Validation result type
interface ValidationResult {
  valid: boolean;
  env: Env | null;
  errors: string[];
  warnings: string[];
}

/**
 * Validate environment variables at startup
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const env = envSchema.parse(process.env);

    // Check for LLM provider
    if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
      warnings.push(
        'No LLM API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY). ' +
        'Using fallback mode for recommendations.'
      );
    }

    // Check for database
    if (!env.DATABASE_URL) {
      warnings.push(
        'No DATABASE_URL configured. Using in-memory storage. ' +
        'Data will not persist across restarts.'
      );
    }

    // Security warnings for production
    if (env.NODE_ENV === 'production') {
      if (!env.SESSION_SECRET || env.SESSION_SECRET === 'your-session-secret-here') {
        errors.push(
          'SESSION_SECRET must be set to a secure random value in production.'
        );
      }

      if (env.DISABLE_CSRF) {
        errors.push(
          'CSRF protection cannot be disabled in production mode.'
        );
      }

      if (!env.ALLOWED_ORIGINS) {
        warnings.push(
          'ALLOWED_ORIGINS not set. CORS will deny all cross-origin requests in production.'
        );
      }
    }

    // Development warnings
    if (env.NODE_ENV === 'development') {
      if (env.SESSION_SECRET === 'your-session-secret-here') {
        warnings.push(
          'Using default SESSION_SECRET. Please set a custom value for better security.'
        );
      }
    }

    return {
      valid: errors.length === 0,
      env,
      errors,
      warnings,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodErrors = error.errors.map(e =>
        `${e.path.join('.')}: ${e.message}`
      );
      return {
        valid: false,
        env: null,
        errors: zodErrors,
        warnings,
      };
    }

    return {
      valid: false,
      env: null,
      errors: [`Unexpected error: ${error}`],
      warnings,
    };
  }
}

/**
 * Log environment status at startup
 */
export function logEnvironmentStatus(log: (message: string) => void): boolean {
  const result = validateEnvironment();

  log('=== Environment Configuration ===');
  log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

  // Log LLM status
  if (process.env.OPENAI_API_KEY) {
    log('LLM Provider: OpenAI (configured)');
  } else if (process.env.ANTHROPIC_API_KEY) {
    log('LLM Provider: Anthropic (configured)');
  } else {
    log('LLM Provider: Fallback mode (no API key)');
  }

  // Log database status
  if (process.env.DATABASE_URL) {
    log('Database: PostgreSQL (configured)');
  } else {
    log('Database: In-memory storage');
  }

  // Log warnings
  for (const warning of result.warnings) {
    log(`[WARN] ${warning}`);
  }

  // Log errors
  for (const error of result.errors) {
    log(`[ERROR] ${error}`);
  }

  if (!result.valid) {
    log('=== Environment validation FAILED ===');
    return false;
  }

  log('=== Environment OK ===');
  return true;
}

/**
 * Get typed environment configuration
 */
export function getEnv(): Env {
  const result = validateEnvironment();
  if (!result.env) {
    throw new Error('Environment validation failed');
  }
  return result.env;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Get the server port from environment or default
 * Uses DEFAULT_PORT (5174) to avoid macOS AirPlay Receiver conflict on port 5000
 */
export function getPort(): number {
  const portStr = process.env.PORT;
  if (portStr) {
    const port = parseInt(portStr, 10);
    if (!isNaN(port) && port >= 1 && port <= 65535) {
      return port;
    }
  }
  return DEFAULT_PORT;
}
