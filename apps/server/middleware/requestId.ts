/**
 * Request ID Middleware
 * Adds unique request IDs for tracing and debugging
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// Extend Express Request type to include requestId
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Request ID middleware
 * Assigns a unique ID to each request for tracing
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers[REQUEST_ID_HEADER] as string) || generateRequestId();

  // Attach to request object
  req.requestId = requestId;

  // Add to response headers
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}

/**
 * Get the current request ID from a request
 */
export function getRequestId(req: Request): string {
  return req.requestId || 'unknown';
}
