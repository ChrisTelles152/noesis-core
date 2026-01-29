/**
 * Standardized Error Codes for Noesis API
 *
 * Error codes follow the pattern: CATEGORY_SPECIFIC_ERROR
 * Categories:
 * - AUTH: Authentication and authorization errors
 * - VALIDATION: Input validation errors
 * - RESOURCE: Resource not found or conflict errors
 * - LLM: LLM provider errors
 * - INTERNAL: Internal server errors
 * - RATE: Rate limiting errors
 */

export const ErrorCodes = {
  // Authentication errors (401, 403)
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',

  // Validation errors (400)
  VALIDATION_INVALID_INPUT: 'VALIDATION_INVALID_INPUT',
  VALIDATION_MISSING_FIELD: 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_PASSWORD_WEAK: 'VALIDATION_PASSWORD_WEAK',
  VALIDATION_USERNAME_INVALID: 'VALIDATION_USERNAME_INVALID',

  // Resource errors (404, 409)
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',

  // LLM errors (502, 503)
  LLM_PROVIDER_ERROR: 'LLM_PROVIDER_ERROR',
  LLM_INVALID_RESPONSE: 'LLM_INVALID_RESPONSE',
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',

  // Rate limiting errors (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_LLM_EXCEEDED: 'RATE_LIMIT_LLM_EXCEEDED',

  // Internal errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INTERNAL_DATABASE_ERROR: 'INTERNAL_DATABASE_ERROR',
  INTERNAL_CONFIG_ERROR: 'INTERNAL_CONFIG_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Structured API error response
 */
export interface APIError {
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
}

/**
 * Create a standardized error response
 */
export function createError(
  message: string,
  code: ErrorCode,
  details?: Record<string, unknown>
): APIError {
  return {
    error: message,
    code,
    ...(details && { details }),
  };
}

/**
 * HTTP status code mapping for error codes
 */
export function getStatusForCode(code: ErrorCode): number {
  if (code.startsWith('AUTH_')) {
    return code === 'AUTH_INSUFFICIENT_PERMISSIONS' ? 403 : 401;
  }
  if (code.startsWith('VALIDATION_')) return 400;
  if (code.startsWith('RESOURCE_NOT_FOUND')) return 404;
  if (code.startsWith('RESOURCE_')) return 409;
  if (code.startsWith('RATE_')) return 429;
  if (code.startsWith('LLM_UNAVAILABLE')) return 503;
  if (code.startsWith('LLM_')) return 502;
  return 500;
}
