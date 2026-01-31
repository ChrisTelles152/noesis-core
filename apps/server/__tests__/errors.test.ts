import { describe, it, expect } from 'vitest';
import {
  ErrorCodes,
  createError,
  getStatusForCode,
  type ErrorCode,
  type _APIError,
} from '../errors';

describe('Error Codes', () => {
  describe('ErrorCodes constant', () => {
    it('should have all authentication error codes', () => {
      expect(ErrorCodes.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
      expect(ErrorCodes.AUTH_INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS');
      expect(ErrorCodes.AUTH_SESSION_EXPIRED).toBe('AUTH_SESSION_EXPIRED');
      expect(ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should have all validation error codes', () => {
      expect(ErrorCodes.VALIDATION_INVALID_INPUT).toBe('VALIDATION_INVALID_INPUT');
      expect(ErrorCodes.VALIDATION_MISSING_FIELD).toBe('VALIDATION_MISSING_FIELD');
      expect(ErrorCodes.VALIDATION_INVALID_FORMAT).toBe('VALIDATION_INVALID_FORMAT');
      expect(ErrorCodes.VALIDATION_PASSWORD_WEAK).toBe('VALIDATION_PASSWORD_WEAK');
      expect(ErrorCodes.VALIDATION_USERNAME_INVALID).toBe('VALIDATION_USERNAME_INVALID');
    });

    it('should have all resource error codes', () => {
      expect(ErrorCodes.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
      expect(ErrorCodes.RESOURCE_ALREADY_EXISTS).toBe('RESOURCE_ALREADY_EXISTS');
      expect(ErrorCodes.RESOURCE_CONFLICT).toBe('RESOURCE_CONFLICT');
    });

    it('should have all LLM error codes', () => {
      expect(ErrorCodes.LLM_PROVIDER_ERROR).toBe('LLM_PROVIDER_ERROR');
      expect(ErrorCodes.LLM_INVALID_RESPONSE).toBe('LLM_INVALID_RESPONSE');
      expect(ErrorCodes.LLM_UNAVAILABLE).toBe('LLM_UNAVAILABLE');
    });

    it('should have all rate limiting error codes', () => {
      expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ErrorCodes.RATE_LIMIT_LLM_EXCEEDED).toBe('RATE_LIMIT_LLM_EXCEEDED');
    });

    it('should have all internal error codes', () => {
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.INTERNAL_DATABASE_ERROR).toBe('INTERNAL_DATABASE_ERROR');
      expect(ErrorCodes.INTERNAL_CONFIG_ERROR).toBe('INTERNAL_CONFIG_ERROR');
    });
  });

  describe('createError', () => {
    it('should create an error with message and code', () => {
      const error = createError('Not found', ErrorCodes.RESOURCE_NOT_FOUND);

      expect(error).toEqual({
        error: 'Not found',
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should create an error with details', () => {
      const error = createError(
        'Invalid input',
        ErrorCodes.VALIDATION_INVALID_INPUT,
        { field: 'email', reason: 'Invalid format' }
      );

      expect(error).toEqual({
        error: 'Invalid input',
        code: 'VALIDATION_INVALID_INPUT',
        details: { field: 'email', reason: 'Invalid format' },
      });
    });

    it('should not include details key when undefined', () => {
      const error = createError('Error', ErrorCodes.INTERNAL_ERROR, undefined);

      expect(error).not.toHaveProperty('details');
    });

    it('should include empty details object when provided', () => {
      const error = createError('Error', ErrorCodes.INTERNAL_ERROR, {});

      expect(error).toHaveProperty('details');
      expect(error.details).toEqual({});
    });
  });

  describe('getStatusForCode', () => {
    describe('authentication errors', () => {
      it('should return 401 for AUTH_REQUIRED', () => {
        expect(getStatusForCode(ErrorCodes.AUTH_REQUIRED)).toBe(401);
      });

      it('should return 401 for AUTH_INVALID_CREDENTIALS', () => {
        expect(getStatusForCode(ErrorCodes.AUTH_INVALID_CREDENTIALS)).toBe(401);
      });

      it('should return 401 for AUTH_SESSION_EXPIRED', () => {
        expect(getStatusForCode(ErrorCodes.AUTH_SESSION_EXPIRED)).toBe(401);
      });

      it('should return 403 for AUTH_INSUFFICIENT_PERMISSIONS', () => {
        expect(getStatusForCode(ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS)).toBe(403);
      });
    });

    describe('validation errors', () => {
      it('should return 400 for all validation errors', () => {
        expect(getStatusForCode(ErrorCodes.VALIDATION_INVALID_INPUT)).toBe(400);
        expect(getStatusForCode(ErrorCodes.VALIDATION_MISSING_FIELD)).toBe(400);
        expect(getStatusForCode(ErrorCodes.VALIDATION_INVALID_FORMAT)).toBe(400);
        expect(getStatusForCode(ErrorCodes.VALIDATION_PASSWORD_WEAK)).toBe(400);
        expect(getStatusForCode(ErrorCodes.VALIDATION_USERNAME_INVALID)).toBe(400);
      });
    });

    describe('resource errors', () => {
      it('should return 404 for RESOURCE_NOT_FOUND', () => {
        expect(getStatusForCode(ErrorCodes.RESOURCE_NOT_FOUND)).toBe(404);
      });

      it('should return 409 for RESOURCE_ALREADY_EXISTS', () => {
        expect(getStatusForCode(ErrorCodes.RESOURCE_ALREADY_EXISTS)).toBe(409);
      });

      it('should return 409 for RESOURCE_CONFLICT', () => {
        expect(getStatusForCode(ErrorCodes.RESOURCE_CONFLICT)).toBe(409);
      });
    });

    describe('rate limiting errors', () => {
      it('should return 429 for rate limit errors', () => {
        expect(getStatusForCode(ErrorCodes.RATE_LIMIT_EXCEEDED)).toBe(429);
        expect(getStatusForCode(ErrorCodes.RATE_LIMIT_LLM_EXCEEDED)).toBe(429);
      });
    });

    describe('LLM errors', () => {
      it('should return 503 for LLM_UNAVAILABLE', () => {
        expect(getStatusForCode(ErrorCodes.LLM_UNAVAILABLE)).toBe(503);
      });

      it('should return 502 for other LLM errors', () => {
        expect(getStatusForCode(ErrorCodes.LLM_PROVIDER_ERROR)).toBe(502);
        expect(getStatusForCode(ErrorCodes.LLM_INVALID_RESPONSE)).toBe(502);
      });
    });

    describe('internal errors', () => {
      it('should return 500 for internal errors', () => {
        expect(getStatusForCode(ErrorCodes.INTERNAL_ERROR)).toBe(500);
        expect(getStatusForCode(ErrorCodes.INTERNAL_DATABASE_ERROR)).toBe(500);
        expect(getStatusForCode(ErrorCodes.INTERNAL_CONFIG_ERROR)).toBe(500);
      });
    });

    it('should return 500 for unknown error codes', () => {
      expect(getStatusForCode('UNKNOWN_ERROR' as ErrorCode)).toBe(500);
    });
  });
});
