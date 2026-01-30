/**
 * Input Sanitization Middleware
 * Provides utilities for sanitizing user input
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Sanitize a string by removing potentially dangerous characters
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove null bytes
    .replace(/\0/g, '')
    // Trim whitespace
    .trim()
    // Limit length to prevent DoS
    .slice(0, 10000);
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(input: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return input.replace(/[&<>"'/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Dangerous keys that could lead to prototype pollution
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Check if a key is safe (not a prototype pollution vector)
 */
export function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.includes(key);
}

/**
 * Sanitize object recursively with prototype pollution protection
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  // Create a null-prototype object to prevent prototype pollution
  const result: Record<string, unknown> = Object.create(null);

  for (const [key, value] of Object.entries(obj)) {
    // SECURITY: Skip dangerous keys to prevent prototype pollution
    if (!isSafeKey(key)) {
      continue;
    }

    // Sanitize key
    const sanitizedKey = sanitizeString(key);

    // Double-check sanitized key is also safe
    if (!isSafeKey(sanitizedKey)) {
      continue;
    }

    if (typeof value === 'string') {
      result[sanitizedKey] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      result[sanitizedKey] = value.map((item) =>
        typeof item === 'string'
          ? sanitizeString(item)
          : typeof item === 'object' && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[sanitizedKey] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[sanitizedKey] = value;
    }
  }

  return result as T;
}

/**
 * Middleware to sanitize request body
 */
export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

/**
 * Middleware to sanitize query parameters
 */
export function sanitizeQuery(req: Request, _res: Response, next: NextFunction): void {
  if (req.query && typeof req.query === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        sanitized[sanitizeString(key)] = sanitizeString(value);
      } else if (Array.isArray(value)) {
        sanitized[sanitizeString(key)] = value.map((v) =>
          typeof v === 'string' ? sanitizeString(v) : v
        );
      } else {
        sanitized[sanitizeString(key)] = value;
      }
    }
    req.query = sanitized as typeof req.query;
  }
  next();
}

/**
 * Combined sanitization middleware
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  sanitizeBody(req, res, () => {
    sanitizeQuery(req, res, next);
  });
}

/**
 * Validate and sanitize a username
 */
export function sanitizeUsername(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 50);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Remove sensitive fields from objects before logging
 */
export function redactSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[] = ['password', 'token', 'apiKey', 'secret', 'authorization']
): T {
  const result: Record<string, unknown> = { ...obj };

  for (const field of sensitiveFields) {
    if (field in result) {
      result[field] = '[REDACTED]';
    }
  }

  return result as T;
}
