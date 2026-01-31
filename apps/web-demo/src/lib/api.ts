/**
 * API Client
 * Centralized API client with error handling, CSRF, and retry logic
 */

// API configuration
const API_BASE = '/api';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'XSRF-TOKEN';
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * API Error class with additional context
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }
}

/**
 * Request options
 */
interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  timeout?: number;
  retry?: number;
  retryDelay?: number;
}

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
  const url = new URL(path, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an API request with automatic error handling and retry
 */
async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, timeout = 30000, retry = 0, retryDelay = 1000, ...fetchOptions } = options;

  const requestId = generateRequestId();
  const url = buildUrl(`${API_BASE}${path}`, params);

  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');
  headers.set(REQUEST_ID_HEADER, requestId);

  // Add CSRF token for non-GET requests
  if (method !== 'GET') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set(CSRF_HEADER, csrfToken);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const fetchOptionsWithBody: RequestInit = {
    ...fetchOptions,
    method,
    headers,
    credentials: 'include',
    signal: controller.signal,
  };

  if (body !== undefined && method !== 'GET') {
    fetchOptionsWithBody.body = JSON.stringify(body);
  }

  let lastError: Error | null = null;
  let attempts = 0;

  while (attempts <= retry) {
    try {
      const response = await fetch(url, fetchOptionsWithBody);
      clearTimeout(timeoutId);

      // Handle different response types
      const contentType = response.headers.get('content-type');
      let data: unknown;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMessage =
          typeof data === 'object' && data !== null && 'error' in data
            ? (data as { error: string }).error
            : typeof data === 'object' && data !== null && 'message' in data
              ? (data as { message: string }).message
              : `Request failed with status ${response.status}`;

        throw new ApiError(
          errorMessage,
          response.status,
          typeof data === 'object' && data !== null && 'code' in data
            ? (data as { code: string }).code
            : undefined,
          response.headers.get(REQUEST_ID_HEADER) || requestId
        );
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        // Don't retry client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      attempts++;

      if (attempts <= retry) {
        await sleep(retryDelay * attempts);
      }
    }
  }

  throw lastError || new Error('Request failed');
}

/**
 * API client with typed methods
 */
export const api = {
  /**
   * GET request
   */
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('GET', path, options);
  },

  /**
   * POST request
   */
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('POST', path, { ...options, body });
  },

  /**
   * PUT request
   */
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PUT', path, { ...options, body });
  },

  /**
   * DELETE request
   */
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, options);
  },

  /**
   * PATCH request
   */
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PATCH', path, { ...options, body });
  },
};

// Typed API endpoints
export const authApi = {
  login(username: string, password: string) {
    return api.post<{ user: { id: number; username: string } }>('/auth/login', {
      username,
      password,
    });
  },

  register(username: string, password: string) {
    return api.post<{ user: { id: number; username: string } }>('/auth/register', {
      username,
      password,
    });
  },

  logout() {
    return api.post<{ message: string }>('/auth/logout');
  },

  getUser() {
    return api.get<{ user: { id: number; username: string } | null }>('/auth/user');
  },

  checkUsername(username: string) {
    return api.get<{ available: boolean }>('/auth/check-username', {
      params: { username },
    });
  },
};

export const analyticsApi = {
  getSummary() {
    return api.get<{
      userId: number;
      totalEvents: number;
      eventCounts: {
        attention: number;
        mastery: number;
        recommendations: number;
        engagements: number;
      };
      averageAttention: number;
      recentEvents: unknown[];
      llmProvider: string;
    }>('/analytics/summary');
  },

  getAttentionEvents() {
    return api.get<unknown[]>('/analytics/attention');
  },

  getMasteryEvents() {
    return api.get<unknown[]>('/analytics/mastery');
  },
};

export const orchestrationApi = {
  getNextStep(
    learnerState: {
      attention?: { score?: number };
      mastery?: unknown[];
      timestamp: number;
    },
    context?: string
  ) {
    return api.post<{
      suggestion: string;
      explanation?: string;
      resourceLinks?: string[];
      type?: string;
    }>('/orchestration/next-step', {
      learnerState,
      context,
    });
  },

  getEngagement(attentionScore?: number, context?: string, previousInterventions?: string[]) {
    return api.post<{
      message: string;
      type: string;
      source?: string;
    }>('/orchestration/engagement', {
      attentionScore,
      context,
      previousInterventions,
    });
  },
};

export const learningApi = {
  createEvent(type: string, data: Record<string, unknown>) {
    return api.post<{ id: number }>('/learning/events', {
      type,
      data,
    });
  },
};

export const llmApi = {
  getStatus() {
    return api.get<{
      activeProvider: string;
      configuredProviders: string[];
      hasLLMProvider: boolean;
    }>('/llm/status');
  },
};

export default api;
