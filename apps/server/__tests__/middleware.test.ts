import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware, getRequestId } from '../middleware/requestId';
import {
  sanitizeString,
  escapeHtml,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  sanitizeInput,
  sanitizeUsername,
  isValidEmail,
  redactSensitiveFields,
} from '../middleware/sanitize';

// Mock request/response/next for middleware testing
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    query: {},
    ...overrides,
  } as Request;
}

function createMockResponse(): Response {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('Request ID Middleware', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
  });

  it('should generate a new request ID if none provided', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    requestIdMiddleware(req, res, mockNext);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should use existing request ID from header', () => {
    const existingId = 'existing-request-id-12345';
    const req = createMockRequest({
      headers: { 'x-request-id': existingId },
    });
    const res = createMockResponse();

    requestIdMiddleware(req, res, mockNext);

    expect(req.requestId).toBe(existingId);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', existingId);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return "unknown" when no request ID is set', () => {
    const req = createMockRequest();
    expect(getRequestId(req)).toBe('unknown');
  });

  it('should return the request ID when set', () => {
    const req = createMockRequest();
    req.requestId = 'test-id-123';
    expect(getRequestId(req)).toBe('test-id-123');
  });
});

describe('Sanitization Functions', () => {
  describe('sanitizeString', () => {
    it('should remove null bytes', () => {
      expect(sanitizeString('hello\0world')).toBe('helloworld');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should limit length to 10000 characters', () => {
      const longString = 'a'.repeat(15000);
      expect(sanitizeString(longString)).toHaveLength(10000);
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeString(123 as unknown as string)).toBe('');
      expect(sanitizeString(null as unknown as string)).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      );
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("it's")).toBe("it&#x27;s");
    });

    it('should handle strings without special characters', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values', () => {
      const input = { name: '  John\0  ', age: 30 };
      const result = sanitizeObject(input);
      expect(result.name).toBe('John');
      expect(result.age).toBe(30);
    });

    it('should sanitize nested objects', () => {
      const input = {
        user: {
          name: '  Jane\0  ',
          profile: {
            bio: '  Hello\0World  ',
          },
        },
      };
      const result = sanitizeObject(input);
      expect(result.user.name).toBe('Jane');
      expect(result.user.profile.bio).toBe('HelloWorld');
    });

    it('should sanitize arrays', () => {
      const input = {
        tags: ['  tag1\0  ', 'tag2', '  tag3  '],
      };
      const result = sanitizeObject(input);
      expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle null and undefined values', () => {
      const input = { a: null, b: undefined, c: 'test' };
      const result = sanitizeObject(input);
      expect(result.a).toBeNull();
      expect(result.b).toBeUndefined();
      expect(result.c).toBe('test');
    });
  });

  describe('sanitizeUsername', () => {
    it('should lowercase the username', () => {
      expect(sanitizeUsername('JohnDoe')).toBe('johndoe');
    });

    it('should remove invalid characters', () => {
      expect(sanitizeUsername('john@doe.com')).toBe('johndoecom');
      expect(sanitizeUsername('user!name#123')).toBe('username123');
    });

    it('should allow underscores and hyphens', () => {
      expect(sanitizeUsername('john_doe-123')).toBe('john_doe-123');
    });

    it('should truncate to 50 characters', () => {
      const longUsername = 'a'.repeat(100);
      expect(sanitizeUsername(longUsername)).toHaveLength(50);
    });
  });

  describe('isValidEmail', () => {
    it('should accept valid email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('missing@domain')).toBe(false);
      expect(isValidEmail('@nodomain.com')).toBe(false);
      expect(isValidEmail('spaces in@email.com')).toBe(false);
    });

    it('should reject emails longer than 254 characters', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });
  });

  describe('redactSensitiveFields', () => {
    it('should redact password fields', () => {
      const input = { username: 'john', password: 'secret123' };
      const result = redactSensitiveFields(input);
      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
    });

    it('should redact multiple sensitive fields', () => {
      const input = {
        username: 'john',
        password: 'secret',
        apiKey: 'key123',
        token: 'tok123',
        data: 'visible',
      };
      const result = redactSensitiveFields(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.data).toBe('visible');
    });

    it('should use custom sensitive fields list', () => {
      const input = { username: 'john', customSecret: 'value' };
      const result = redactSensitiveFields(input, ['customSecret']);
      expect(result.username).toBe('john');
      expect(result.customSecret).toBe('[REDACTED]');
    });
  });
});

describe('Sanitization Middleware', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
  });

  describe('sanitizeBody', () => {
    it('should sanitize request body', () => {
      const req = createMockRequest({
        body: { name: '  John\0  ', email: 'test@example.com' },
      });
      const res = createMockResponse();

      sanitizeBody(req, res, mockNext);

      expect(req.body.name).toBe('John');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle empty body', () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      sanitizeBody(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle null body', () => {
      const req = createMockRequest({ body: null });
      const res = createMockResponse();

      sanitizeBody(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('sanitizeQuery', () => {
    it('should sanitize query parameters', () => {
      const req = createMockRequest({
        query: { search: '  hello\0world  ' },
      });
      const res = createMockResponse();

      sanitizeQuery(req, res, mockNext);

      expect(req.query.search).toBe('helloworld');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle array query parameters', () => {
      const req = createMockRequest({
        query: { tags: ['  tag1\0  ', '  tag2  '] },
      });
      const res = createMockResponse();

      sanitizeQuery(req, res, mockNext);

      expect(req.query.tags).toEqual(['tag1', 'tag2']);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize both body and query', () => {
      const req = createMockRequest({
        body: { name: '  Body\0  ' },
        query: { q: '  Query\0  ' },
      });
      const res = createMockResponse();

      sanitizeInput(req, res, mockNext);

      expect(req.body.name).toBe('Body');
      expect(req.query.q).toBe('Query');
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
