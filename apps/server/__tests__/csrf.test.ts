import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { csrfProtection, shouldEnableCsrf } from '../csrf';

// Mock request/response/next for middleware testing
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/test',
    headers: {},
    body: {},
    query: {},
    session: {
      csrfSecret: undefined,
    },
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & {
  _json?: unknown;
  _status?: number;
  _cookies: Record<string, unknown>;
} {
  const res = {
    _json: undefined as unknown,
    _status: 200,
    _cookies: {} as Record<string, unknown>,
    status: vi.fn(function (this: typeof res, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (this: typeof res, data: unknown) {
      this._json = data;
      return this;
    }),
    cookie: vi.fn(function (this: typeof res, name: string, value: unknown, options: unknown) {
      this._cookies[name] = { value, options };
      return this;
    }),
    locals: {} as Record<string, unknown>,
  } as Response & { _json?: unknown; _status?: number; _cookies: Record<string, unknown> };
  return res;
}

describe('CSRF Protection Middleware', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('csrfProtection', () => {
    it('should skip protection when disabled', () => {
      const middleware = csrfProtection({ enabled: false });
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should skip protection for excluded paths', () => {
      const middleware = csrfProtection({ excludePaths: ['/api/auth'] });
      const req = createMockRequest({ method: 'POST', path: '/api/auth/login' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow GET requests without token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res._cookies['XSRF-TOKEN']).toBeDefined();
    });

    it('should allow HEAD requests without token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'HEAD' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow OPTIONS requests without token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'OPTIONS' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject POST requests without token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
      expect(res._json).toEqual({
        error: 'CSRF token missing',
        message: 'Request must include a valid CSRF token',
      });
    });

    it('should reject PUT requests without token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'PUT' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
    });

    it('should reject DELETE requests without token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'DELETE' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
    });

    it('should reject POST requests with invalid token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-csrf-token': 'invalid.token' },
        session: { csrfSecret: 'validsecret' },
      });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
      expect(res._json).toEqual({
        error: 'CSRF token invalid',
        message: 'The CSRF token is invalid or has expired',
      });
    });

    it('should reject POST requests with malformed token', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-csrf-token': 'notokenformat' },
        session: { csrfSecret: 'validsecret' },
      });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
    });

    it('should accept valid token from header', () => {
      const middleware = csrfProtection();

      // First, make a GET request to get a valid token
      const getReq = createMockRequest({ method: 'GET' });
      const getRes = createMockResponse();
      middleware(getReq, getRes, vi.fn());

      // Extract the token from the cookie
      const token = (getRes._cookies['XSRF-TOKEN'] as { value: string }).value;
      const secret = getReq.session!.csrfSecret;

      // Now make a POST request with the valid token
      const postReq = createMockRequest({
        method: 'POST',
        headers: { 'x-csrf-token': token },
        session: { csrfSecret: secret },
      });
      const postRes = createMockResponse();

      middleware(postReq, postRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept token from body._csrf', () => {
      const middleware = csrfProtection();

      // First, get a valid token
      const getReq = createMockRequest({ method: 'GET' });
      const getRes = createMockResponse();
      middleware(getReq, getRes, vi.fn());

      const token = (getRes._cookies['XSRF-TOKEN'] as { value: string }).value;
      const secret = getReq.session!.csrfSecret;

      // POST with token in body
      const postReq = createMockRequest({
        method: 'POST',
        body: { _csrf: token },
        session: { csrfSecret: secret },
      });
      const postRes = createMockResponse();

      middleware(postReq, postRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept token from query._csrf', () => {
      const middleware = csrfProtection();

      // First, get a valid token
      const getReq = createMockRequest({ method: 'GET' });
      const getRes = createMockResponse();
      middleware(getReq, getRes, vi.fn());

      const token = (getRes._cookies['XSRF-TOKEN'] as { value: string }).value;
      const secret = getReq.session!.csrfSecret;

      // POST with token in query
      const postReq = createMockRequest({
        method: 'POST',
        query: { _csrf: token },
        session: { csrfSecret: secret },
      });
      const postRes = createMockResponse();

      middleware(postReq, postRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should generate a new secret if none exists', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({
        method: 'GET',
        session: { csrfSecret: undefined },
      });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(req.session!.csrfSecret).toBeDefined();
      expect(req.session!.csrfSecret).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should set CSRF token in response cookie', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(res._cookies['XSRF-TOKEN']).toBeDefined();
      const cookie = res._cookies['XSRF-TOKEN'] as {
        value: string;
        options: Record<string, unknown>;
      };
      expect(cookie.options.httpOnly).toBe(false); // Client needs to read it
      expect(cookie.options.sameSite).toBe('strict');
    });

    it('should set csrfToken in res.locals', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(res.locals.csrfToken).toBeDefined();
      expect(typeof res.locals.csrfToken).toBe('string');
    });

    it('should skip if no session exists', () => {
      const middleware = csrfProtection();
      const req = createMockRequest({ method: 'POST' });
      (req as unknown as { session: undefined }).session = undefined;
      const res = createMockResponse();

      middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('shouldEnableCsrf', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true by default', () => {
      delete process.env.DISABLE_CSRF;
      expect(shouldEnableCsrf()).toBe(true);
    });

    it('should return false when DISABLE_CSRF is true', () => {
      process.env.DISABLE_CSRF = 'true';

      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(shouldEnableCsrf()).toBe(false);

      warnSpy.mockRestore();
    });

    it('should return true when DISABLE_CSRF is false', () => {
      process.env.DISABLE_CSRF = 'false';
      expect(shouldEnableCsrf()).toBe(true);
    });
  });

  describe('Token Security', () => {
    it('should generate different tokens for different salts', () => {
      const middleware = csrfProtection();

      const req1 = createMockRequest({ method: 'GET' });
      const res1 = createMockResponse();
      middleware(req1, res1, vi.fn());

      const req2 = createMockRequest({
        method: 'GET',
        session: { csrfSecret: req1.session!.csrfSecret },
      });
      const res2 = createMockResponse();
      middleware(req2, res2, vi.fn());

      const token1 = (res1._cookies['XSRF-TOKEN'] as { value: string }).value;
      const token2 = (res2._cookies['XSRF-TOKEN'] as { value: string }).value;

      // Tokens should be different due to different salts
      expect(token1).not.toBe(token2);
    });

    it('should reject token from different session', () => {
      const middleware = csrfProtection();

      // Get token from one session
      const getReq = createMockRequest({ method: 'GET' });
      const getRes = createMockResponse();
      middleware(getReq, getRes, vi.fn());

      const token = (getRes._cookies['XSRF-TOKEN'] as { value: string }).value;

      // Try to use it with a different session secret
      const postReq = createMockRequest({
        method: 'POST',
        headers: { 'x-csrf-token': token },
        session: { csrfSecret: 'differentsecret' },
      });
      const postRes = createMockResponse();

      middleware(postReq, postRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(postRes._status).toBe(403);
    });
  });
});
