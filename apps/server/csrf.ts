/**
 * CSRF Protection Middleware
 * Uses the synchronizer token pattern with signed tokens
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction, Express } from 'express';
import { logger } from './logger';

// Extend Express session to include CSRF secret
declare module 'express-session' {
  interface SessionData {
    csrfSecret?: string;
  }
}

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'XSRF-TOKEN';
const TOKEN_LENGTH = 32;

/**
 * Generate a random secret for signing CSRF tokens
 */
function generateSecret(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Generate a CSRF token signed with the session secret
 */
function generateToken(secret: string): string {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto
    .createHmac('sha256', secret)
    .update(salt)
    .digest('hex');
  return `${salt}.${hash}`;
}

/**
 * Verify a CSRF token against the session secret
 */
function verifyToken(token: string, secret: string): boolean {
  const [salt, hash] = token.split('.');
  if (!salt || !hash) {
    return false;
  }

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(salt)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Check if a request method is safe (doesn't modify state)
 */
function isSafeMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/**
 * CSRF protection middleware
 */
export function csrfProtection(options: {
  excludePaths?: string[];
  enabled?: boolean;
} = {}) {
  const { excludePaths = [], enabled = true } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if CSRF protection is disabled
    if (!enabled) {
      return next();
    }

    // Skip for excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Ensure session exists
    if (!req.session) {
      return next();
    }

    // Generate or retrieve CSRF secret
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = generateSecret();
    }

    const secret = req.session.csrfSecret;

    // Generate new token and set in cookie for client access
    const token = generateToken(secret);
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // Client needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    // Add token to response locals for server-side rendering
    res.locals.csrfToken = token;

    // Verify token for state-changing requests
    if (!isSafeMethod(req.method)) {
      const clientToken = req.headers[CSRF_HEADER] as string ||
                          req.body?._csrf ||
                          req.query?._csrf as string;

      if (!clientToken) {
        return res.status(403).json({
          error: 'CSRF token missing',
          message: 'Request must include a valid CSRF token'
        });
      }

      if (!verifyToken(clientToken, secret)) {
        return res.status(403).json({
          error: 'CSRF token invalid',
          message: 'The CSRF token is invalid or has expired'
        });
      }
    }

    next();
  };
}

/**
 * Endpoint to get a fresh CSRF token
 */
export function setupCsrfRoutes(app: Express): void {
  app.get('/api/csrf-token', (req, res) => {
    if (!req.session) {
      return res.status(500).json({ error: 'Session not available' });
    }

    if (!req.session.csrfSecret) {
      req.session.csrfSecret = generateSecret();
    }

    const token = generateToken(req.session.csrfSecret);
    res.json({ token });
  });
}

/**
 * Check if CSRF protection should be enabled based on environment
 */
export function shouldEnableCsrf(): boolean {
  // In development, CSRF can be disabled for easier testing
  if (process.env.DISABLE_CSRF === 'true') {
    if (process.env.NODE_ENV === 'production') {
      // This should never happen as env.ts blocks it, but log as error for defense in depth
      logger.error("CRITICAL: CSRF protection disabled in PRODUCTION - this is a security vulnerability!", { module: "csrf" });
    } else {
      logger.warn("CSRF protection is disabled via DISABLE_CSRF environment variable", { module: "csrf" });
    }
    return false;
  }

  return true;
}
