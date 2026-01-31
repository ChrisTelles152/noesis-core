/**
 * CSRF Token Hook
 * Manages CSRF tokens for secure API requests
 */

import { useState, useCallback, useEffect } from 'react';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Get CSRF token from cookie
 */
function getCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Hook to manage CSRF tokens
 */
export function useCsrf() {
  const [token, setToken] = useState<string | null>(() => getCsrfTokenFromCookie());

  // Refresh token from server
  const refreshToken = useCallback(async () => {
    try {
      const response = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setToken(data.token);
        return data.token;
      }
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error);
    }
    return null;
  }, []);

  // Get current token (from cookie or state)
  const getToken = useCallback(() => {
    return getCsrfTokenFromCookie() || token;
  }, [token]);

  // Create headers with CSRF token
  const getCsrfHeaders = useCallback((): Record<string, string> => {
    const currentToken = getToken();
    return currentToken ? { [CSRF_HEADER]: currentToken } : {};
  }, [getToken]);

  // Fetch wrapper that includes CSRF token
  const csrfFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const currentToken = getToken();

      const headers = new Headers(options.headers);
      if (currentToken) {
        headers.set(CSRF_HEADER, currentToken);
      }

      return fetch(url, {
        ...options,
        credentials: 'include',
        headers,
      });
    },
    [getToken]
  );

  // Effect to update token when cookie changes
  useEffect(() => {
    const checkCookie = () => {
      const cookieToken = getCsrfTokenFromCookie();
      if (cookieToken && cookieToken !== token) {
        setToken(cookieToken);
      }
    };

    // Check periodically for cookie updates
    const interval = setInterval(checkCookie, 5000);
    return () => clearInterval(interval);
  }, [token]);

  return {
    token,
    getToken,
    refreshToken,
    getCsrfHeaders,
    csrfFetch,
  };
}

/**
 * Higher-order function to add CSRF token to fetch options
 */
export function withCsrfToken(options: RequestInit = {}): RequestInit {
  const token = getCsrfTokenFromCookie();

  if (!token) {
    return options;
  }

  const headers = new Headers(options.headers);
  headers.set(CSRF_HEADER, token);

  return {
    ...options,
    credentials: 'include',
    headers,
  };
}

/**
 * Convenience function for making CSRF-protected requests
 */
export async function csrfRequest(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, withCsrfToken(options));
}
