import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };

    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;

    // Clear module cache to get fresh logger instance
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('log levels', () => {
    it('should log info messages by default', async () => {
      const { logger } = await import('../logger');

      logger.info('Test info message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[INFO]');
      expect(consoleSpy.log.mock.calls[0][0]).toContain('Test info message');
    });

    it('should log warn messages', async () => {
      const { logger } = await import('../logger');

      logger.warn('Test warning');

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn.mock.calls[0][0]).toContain('[WARN]');
    });

    it('should log error messages', async () => {
      const { logger } = await import('../logger');

      logger.error('Test error');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should not log debug by default', async () => {
      const { logger } = await import('../logger');

      logger.debug('Debug message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should log debug when LOG_LEVEL=debug', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { logger } = await import('../logger');

      logger.debug('Debug message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[DEBUG]');
    });

    it('should respect LOG_LEVEL=warn', async () => {
      process.env.LOG_LEVEL = 'warn';
      const { logger } = await import('../logger');

      logger.info('Info message');
      logger.warn('Warn message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    });

    it('should respect LOG_LEVEL=error', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await import('../logger');

      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('context', () => {
    it('should include context in log output', async () => {
      const { logger } = await import('../logger');

      logger.info('Test message', { module: 'auth', userId: 123 });

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('module');
      expect(output).toContain('auth');
    });
  });

  describe('error objects', () => {
    it('should include error details', async () => {
      const { logger } = await import('../logger');
      const error = new Error('Test error');

      logger.error('Something failed', {}, error);

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('Test error');
    });

    it('should include error name', async () => {
      const { logger } = await import('../logger');
      const error = new TypeError('Type mismatch');

      logger.error('Type error', {}, error);

      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('TypeError');
    });
  });

  describe('production format', () => {
    it('should output JSON in production', async () => {
      process.env.NODE_ENV = 'production';
      const { logger } = await import('../logger');

      logger.info('Production message', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('level', 'info');
      expect(parsed).toHaveProperty('message', 'Production message');
      expect(parsed.context).toHaveProperty('key', 'value');
    });
  });

  describe('child logger', () => {
    it('should create child with default context', async () => {
      const { logger } = await import('../logger');

      const childLogger = logger.child({ module: 'websocket', connectionId: 'abc123' });
      childLogger.info('Child message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('websocket');
      expect(output).toContain('abc123');
    });

    it('should merge child context with call context', async () => {
      const { logger } = await import('../logger');

      const childLogger = logger.child({ module: 'auth' });
      childLogger.info('Message', { userId: 456 });

      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('auth');
      expect(output).toContain('456');
    });
  });

  describe('error handler', () => {
    it('should create error handler middleware', async () => {
      const { createErrorHandler } = await import('../logger');

      const errorHandler = createErrorHandler();
      expect(typeof errorHandler).toBe('function');
    });

    it('should log and respond to errors', async () => {
      const { createErrorHandler } = await import('../logger');

      const errorHandler = createErrorHandler();
      const error = new Error('Test error') as Error & { status?: number };
      error.status = 400;

      const req = { method: 'GET', path: '/api/test', ip: '127.0.0.1' };
      const res = {
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      errorHandler(error, req as any, res as any, next);

      expect(consoleSpy.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });

    it('should not send response if headers already sent', async () => {
      const { createErrorHandler } = await import('../logger');

      const errorHandler = createErrorHandler();
      const error = new Error('Test error');

      const req = { method: 'GET', path: '/api/test' };
      const res = {
        headersSent: true,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      errorHandler(error, req as any, res as any, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should hide internal error details from client', async () => {
      const { createErrorHandler } = await import('../logger');

      const errorHandler = createErrorHandler();
      const error = new Error('Database connection failed') as Error & { status?: number };
      // No status = 500 internal error

      const req = { method: 'GET', path: '/api/test' };
      const res = {
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error).toBe('An internal error occurred');
      expect(jsonCall.error).not.toContain('Database');
    });
  });

  describe('app error classes', () => {
    it('should create AppError with status code', async () => {
      const { AppError } = await import('../logger');

      const error = new AppError('Not found', 404);

      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should create ValidationError with 400 status', async () => {
      const { ValidationError } = await import('../logger');

      const error = new ValidationError('Invalid email');

      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
    });

    it('should create AuthenticationError with 401 status', async () => {
      const { AuthenticationError } = await import('../logger');

      const error = new AuthenticationError();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Authentication required');
      expect(error.name).toBe('AuthenticationError');
    });

    it('should create AuthorizationError with 403 status', async () => {
      const { AuthorizationError } = await import('../logger');

      const error = new AuthorizationError();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
      expect(error.name).toBe('AuthorizationError');
    });

    it('should create NotFoundError with 404 status', async () => {
      const { NotFoundError } = await import('../logger');

      const error = new NotFoundError('User not found');

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should create RateLimitError with 429 status', async () => {
      const { RateLimitError } = await import('../logger');

      const error = new RateLimitError();

      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.name).toBe('RateLimitError');
    });
  });
});
