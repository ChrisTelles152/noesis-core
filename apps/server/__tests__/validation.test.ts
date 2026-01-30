/**
 * Validation Middleware Tests
 *
 * Tests for the Zod-based request validation middleware.
 */

import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../middleware/validation';

// Helper to create mock Express objects
function createMockReq(data: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...data,
  } as Request;
}

function createMockRes(): Response & { statusCode: number; jsonData: unknown } {
  const res = {
    statusCode: 200,
    jsonData: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.jsonData = data;
      return this;
    },
  };
  return res as Response & { statusCode: number; jsonData: unknown };
}

describe('validateBody', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
    email: z.string().email().optional(),
  });

  it('should pass valid body through', async () => {
    const req = createMockReq({ body: { name: 'John', age: 25 } });
    const res = createMockRes();
    const next = vi.fn();

    await validateBody(testSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'John', age: 25 });
  });

  it('should transform coercible values', async () => {
    const schemaWithCoercion = z.object({
      count: z.coerce.number(),
    });

    const req = createMockReq({ body: { count: '42' } });
    const res = createMockRes();
    const next = vi.fn();

    await validateBody(schemaWithCoercion)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.count).toBe(42);
  });

  it('should return 400 for invalid body', async () => {
    const req = createMockReq({ body: { name: '', age: -5 } });
    const res = createMockRes();
    const next = vi.fn();

    await validateBody(testSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonData).toHaveProperty('error', 'Validation failed');
    expect(res.jsonData).toHaveProperty('details');
  });

  it('should return detailed validation errors', async () => {
    const req = createMockReq({ body: { name: 'John', age: 'not a number' } });
    const res = createMockRes();
    const next = vi.fn();

    await validateBody(testSchema)(req, res, next);

    expect(res.statusCode).toBe(400);
    const details = (res.jsonData as { details: Array<{ path: string; message: string }> }).details;
    expect(details.some(d => d.path === 'age')).toBe(true);
  });

  it('should handle missing required fields', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    const next = vi.fn();

    await validateBody(testSchema)(req, res, next);

    expect(res.statusCode).toBe(400);
    const details = (res.jsonData as { details: Array<{ path: string }> }).details;
    expect(details.some(d => d.path === 'name')).toBe(true);
    expect(details.some(d => d.path === 'age')).toBe(true);
  });

  it('should handle nested object validation', async () => {
    const nestedSchema = z.object({
      user: z.object({
        profile: z.object({
          bio: z.string(),
        }),
      }),
    });

    const req = createMockReq({
      body: { user: { profile: { bio: 123 } } },
    });
    const res = createMockRes();
    const next = vi.fn();

    await validateBody(nestedSchema)(req, res, next);

    expect(res.statusCode).toBe(400);
    const details = (res.jsonData as { details: Array<{ path: string }> }).details;
    expect(details.some(d => d.path === 'user.profile.bio')).toBe(true);
  });
});

describe('validateQuery', () => {
  const querySchema = z.object({
    search: z.string().optional(),
    page: z.coerce.number().positive().default(1),
  });

  it('should pass valid query through', async () => {
    const req = createMockReq({ query: { search: 'test', page: '2' } });
    const res = createMockRes();
    const next = vi.fn();

    await validateQuery(querySchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query).toEqual({ search: 'test', page: 2 });
  });

  it('should apply default values', async () => {
    const req = createMockReq({ query: {} });
    const res = createMockRes();
    const next = vi.fn();

    await validateQuery(querySchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query).toEqual({ page: 1 });
  });

  it('should return 400 for invalid query', async () => {
    const req = createMockReq({ query: { page: 'invalid' } });
    const res = createMockRes();
    const next = vi.fn();

    await validateQuery(querySchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonData).toHaveProperty('error', 'Invalid query parameters');
  });
});

describe('validateParams', () => {
  const paramsSchema = z.object({
    id: z.coerce.number().positive(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
  });

  it('should pass valid params through', async () => {
    const req = createMockReq({ params: { id: '123', slug: 'my-post' } });
    const res = createMockRes();
    const next = vi.fn();

    await validateParams(paramsSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.params).toEqual({ id: 123, slug: 'my-post' });
  });

  it('should return 400 for invalid params', async () => {
    const req = createMockReq({ params: { id: 'abc', slug: 'Invalid Slug!' } });
    const res = createMockRes();
    const next = vi.fn();

    await validateParams(paramsSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonData).toHaveProperty('error', 'Invalid route parameters');
  });
});

describe('commonSchemas', () => {
  describe('pagination', () => {
    it('should validate valid pagination params', () => {
      const result = commonSchemas.pagination.parse({ page: '2', limit: '50' });
      expect(result).toEqual({ page: 2, limit: 50 });
    });

    it('should apply defaults', () => {
      const result = commonSchemas.pagination.parse({});
      expect(result).toEqual({ page: 1, limit: 20 });
    });

    it('should reject invalid values', () => {
      expect(() => commonSchemas.pagination.parse({ page: '0' })).toThrow();
      expect(() => commonSchemas.pagination.parse({ limit: '150' })).toThrow();
    });
  });

  describe('idParam', () => {
    it('should validate valid id', () => {
      const result = commonSchemas.idParam.parse({ id: '123' });
      expect(result).toEqual({ id: 123 });
    });

    it('should reject invalid id', () => {
      expect(() => commonSchemas.idParam.parse({ id: '-1' })).toThrow();
      expect(() => commonSchemas.idParam.parse({ id: 'abc' })).toThrow();
    });
  });

  describe('dateRange', () => {
    it('should validate valid date range', () => {
      const result = commonSchemas.dateRange.parse({
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
      });
      expect(result.startDate).toBe('2024-01-01T00:00:00Z');
      expect(result.endDate).toBe('2024-12-31T23:59:59Z');
    });

    it('should allow optional dates', () => {
      const result = commonSchemas.dateRange.parse({});
      expect(result.startDate).toBeUndefined();
      expect(result.endDate).toBeUndefined();
    });

    it('should reject invalid date format', () => {
      expect(() => commonSchemas.dateRange.parse({ startDate: 'not-a-date' })).toThrow();
    });
  });
});
