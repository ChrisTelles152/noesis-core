/**
 * Centralized Logging System
 * Provides structured logging with levels and context
 *
 * Uses dependency injection pattern:
 * - Configure with configureLogger() before first use
 * - Access via getLogger() for DI-friendly code
 * - Direct import of `logger` still works for convenience
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level (default: 'info' or LOG_LEVEL env var) */
  minLevel?: LogLevel;
  /** Whether to use production format (default: based on NODE_ENV) */
  isProduction?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private minLevel: LogLevel;
  private isProduction: boolean;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info';
    this.isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    if (this.isProduction) {
      // JSON format for production (easier to parse)
      return JSON.stringify(entry);
    }

    // Human-readable format for development
    const levelIcon = {
      debug: '🔍',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
    }[entry.level];

    let output = `${entry.timestamp} ${levelIcon} [${entry.level.toUpperCase()}] ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${JSON.stringify(entry.context)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack && this.minLevel === 'debug') {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'debug':
      case 'info':
        // eslint-disable-next-line no-console
        console.log(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log('warn', message, context, error);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.log('error', message, context, error);
  }

  /**
   * Create a child logger with preset context
   */
  child(defaultContext: LogContext): ChildLogger {
    return new ChildLogger(this, defaultContext);
  }
}

class ChildLogger {
  constructor(
    private parent: Logger,
    private defaultContext: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.defaultContext, ...context };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.parent.warn(message, this.mergeContext(context), error);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.parent.error(message, this.mergeContext(context), error);
  }
}

// Singleton management
let loggerInstance: Logger | null = null;
let loggerOptions: LoggerOptions = {};

/**
 * Configure the logger before first access.
 * Call this early in application startup to customize logging behavior.
 */
export function configureLogger(options: LoggerOptions): void {
  loggerOptions = options;
  loggerInstance = null; // Reset so next getLogger() uses new options
}

/**
 * Get the logger instance (creates on first access).
 * Prefer this in DI-friendly code.
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(loggerOptions);
  }
  return loggerInstance;
}

/**
 * Reset the logger singleton (for testing)
 */
export function resetLogger(): void {
  loggerInstance = null;
  loggerOptions = {};
}

// Default logger instance for convenience (uses getLogger internally)
export const logger = new Proxy({} as Logger, {
  get(_target, prop) {
    const instance = getLogger();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Express error handler middleware
 */
export function createErrorHandler() {
  return (
    err: Error & { status?: number; statusCode?: number },
    req: { method: string; path: string; ip?: string },
    res: { status: (code: number) => { json: (body: unknown) => void }; headersSent: boolean },
    _next: (err?: Error) => void
  ) => {
    const status = err.status || err.statusCode || 500;
    const isServerError = status >= 500;

    // Log the error
    logger.error(`Request failed: ${req.method} ${req.path}`, {
      status,
      method: req.method,
      path: req.path,
      ip: req.ip,
    }, err);

    // Don't expose internal errors to clients
    const clientMessage = isServerError
      ? 'An internal error occurred'
      : err.message;

    if (!res.headersSent) {
      res.status(status).json({
        error: clientMessage,
        status,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      });
    }

    // Don't call next() - we've handled the error
  };
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T>(
  fn: (req: T, res: unknown, next: unknown) => Promise<void>
) {
  return (req: T, res: unknown, next: (err?: Error) => void) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Application error classes
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}
