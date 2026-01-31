import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateEnvironment,
  isProduction,
  isDevelopment,
  isTest,
  getPort,
  getHost,
  DEFAULT_PORT,
  DEFAULT_HOST,
} from '../env';

describe('Environment Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.NODE_ENV;
    delete process.env.SESSION_SECRET;
    delete process.env.DISABLE_CSRF;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.PORT;
    delete process.env.HOST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('validateEnvironment', () => {
    describe('in development mode', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      it('should return valid with no configuration', () => {
        const result = validateEnvironment();

        expect(result.valid).toBe(true);
        expect(result.env).not.toBeNull();
        expect(result.errors).toHaveLength(0);
      });

      it('should warn when no LLM API key is configured', () => {
        const result = validateEnvironment();

        expect(result.warnings).toContainEqual(
          expect.stringContaining('No LLM API key configured')
        );
      });

      it('should warn when no DATABASE_URL is configured', () => {
        const result = validateEnvironment();

        expect(result.warnings).toContainEqual(
          expect.stringContaining('No DATABASE_URL configured')
        );
      });

      it('should warn when using default SESSION_SECRET', () => {
        process.env.SESSION_SECRET = 'noesis-development-secret-change-in-production';

        const result = validateEnvironment();

        expect(result.warnings).toContainEqual(
          expect.stringContaining('Using default SESSION_SECRET')
        );
      });

      it('should not warn when custom SESSION_SECRET is set', () => {
        process.env.SESSION_SECRET = 'my-custom-development-secret-here';

        const result = validateEnvironment();

        expect(result.warnings).not.toContainEqual(
          expect.stringContaining('Using default SESSION_SECRET')
        );
      });
    });

    describe('in production mode', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      it('should error when SESSION_SECRET is not set', () => {
        const result = validateEnvironment();

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('SESSION_SECRET must be set'));
      });

      it('should error when SESSION_SECRET is the default value', () => {
        process.env.SESSION_SECRET = 'noesis-development-secret-change-in-production';

        const result = validateEnvironment();

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('SESSION_SECRET must be set'));
      });

      it('should error when DISABLE_CSRF is true', () => {
        process.env.SESSION_SECRET = 'secure-production-secret-32chars';
        process.env.DISABLE_CSRF = 'true';

        const result = validateEnvironment();

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.stringContaining('CSRF protection cannot be disabled')
        );
      });

      it('should warn when ALLOWED_ORIGINS is not set', () => {
        process.env.SESSION_SECRET = 'secure-production-secret-32chars';

        const result = validateEnvironment();

        expect(result.warnings).toContainEqual(expect.stringContaining('ALLOWED_ORIGINS not set'));
      });

      it('should be valid with proper production configuration', () => {
        process.env.SESSION_SECRET = 'secure-production-secret-32chars';
        process.env.ALLOWED_ORIGINS = 'https://example.com';
        process.env.DATABASE_URL = 'postgresql://localhost:5432/noesis';
        process.env.OPENAI_API_KEY = 'sk-test-key';

        const result = validateEnvironment();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('validation rules', () => {
      it('should reject invalid NODE_ENV', () => {
        (process.env as any).NODE_ENV = 'invalid';

        const result = validateEnvironment();

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('NODE_ENV'))).toBe(true);
      });

      it('should accept valid port numbers', () => {
        process.env.NODE_ENV = 'development';
        process.env.PORT = '3000';

        const result = validateEnvironment();

        expect(result.valid).toBe(true);
        expect(result.env?.PORT).toBe(3000);
      });

      it('should reject invalid port numbers', () => {
        process.env.NODE_ENV = 'development';
        process.env.PORT = '99999';

        const result = validateEnvironment();

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('PORT'))).toBe(true);
      });

      it('should reject invalid DATABASE_URL format', () => {
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_URL = 'not-a-url';

        const result = validateEnvironment();

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
      });

      it('should validate SESSION_SECRET minimum length', () => {
        process.env.NODE_ENV = 'development';
        process.env.SESSION_SECRET = 'short';

        const result = validateEnvironment();

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('SESSION_SECRET'))).toBe(true);
      });
    });
  });

  describe('isProduction', () => {
    it('should return true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);
    });

    it('should return false when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      expect(isProduction()).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      expect(isProduction()).toBe(false);
    });
  });

  describe('isDevelopment', () => {
    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isDevelopment()).toBe(false);
    });

    it('should return true when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      expect(isDevelopment()).toBe(true);
    });

    it('should return true when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      expect(isDevelopment()).toBe(true);
    });
  });

  describe('isTest', () => {
    it('should return true when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      expect(isTest()).toBe(true);
    });

    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isTest()).toBe(false);
    });
  });

  describe('getPort', () => {
    it('should return DEFAULT_PORT when PORT is not set', () => {
      delete process.env.PORT;
      expect(getPort()).toBe(DEFAULT_PORT);
    });

    it('should return parsed PORT when valid', () => {
      process.env.PORT = '8080';
      expect(getPort()).toBe(8080);
    });

    it('should return DEFAULT_PORT for invalid PORT', () => {
      process.env.PORT = 'invalid';
      expect(getPort()).toBe(DEFAULT_PORT);
    });

    it('should return DEFAULT_PORT for out-of-range PORT', () => {
      process.env.PORT = '99999';
      expect(getPort()).toBe(DEFAULT_PORT);
    });

    it('should return DEFAULT_PORT for zero PORT', () => {
      process.env.PORT = '0';
      expect(getPort()).toBe(DEFAULT_PORT);
    });

    it('should return DEFAULT_PORT for negative PORT', () => {
      process.env.PORT = '-1';
      expect(getPort()).toBe(DEFAULT_PORT);
    });
  });

  describe('getHost', () => {
    it('should return DEFAULT_HOST when HOST is not set', () => {
      delete process.env.HOST;
      expect(getHost()).toBe(DEFAULT_HOST);
    });

    it('should return HOST when set', () => {
      process.env.HOST = '0.0.0.0';
      expect(getHost()).toBe('0.0.0.0');
    });
  });
});
