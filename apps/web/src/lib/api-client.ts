import { ApiErrorResponse } from '@project-nirvana/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let currentAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(
    message: string,
    code: string = 'API_ERROR',
    statusCode: number = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Attempts to silently refresh the access token using the httpOnly refresh_token cookie
 */
async function silentRefreshToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!res.ok) {
        setAccessToken(null);
        return null;
      }

      const data = await res.json();
      if (data?.accessToken) {
        setAccessToken(data.accessToken);
        return data.accessToken;
      }
      return null;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  retryOn401?: boolean;
}

/**
 * Core API client with automatic token attachment and 401 refresh retry
 */
export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const { skipAuth = false, retryOn401 = true, headers: customHeaders, ...restOptions } = options;

  const headers = new Headers(customHeaders);
  if (!headers.has('Content-Type') && !(restOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth && currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }

  const response = await fetch(url, {
    ...restOptions,
    headers,
    credentials: 'include',
  });

  // Handle 401 Unauthorized by attempting a token refresh
  if (
    response.status === 401 &&
    retryOn401 &&
    !path.includes('/auth/login') &&
    !path.includes('/auth/refresh')
  ) {
    const newToken = await silentRefreshToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      const retryResponse = await fetch(url, {
        ...restOptions,
        headers,
        credentials: 'include',
      });

      if (!retryResponse.ok) {
        const errorData: ApiErrorResponse = await retryResponse.json().catch(() => ({
          code: 'HTTP_ERROR',
          message: retryResponse.statusText,
        }));
        throw new ApiError(
          errorData.message,
          errorData.code,
          retryResponse.status,
          errorData.details,
        );
      }

      if (retryResponse.status === 204) {
        return undefined as unknown as T;
      }
      return retryResponse.json();
    }
  }

  if (!response.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json();
    } catch {
      errorData = {
        code: 'HTTP_ERROR',
        message: response.statusText || 'An unexpected error occurred',
      };
    }
    throw new ApiError(errorData.message, errorData.code, response.status, errorData.details);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json();
}
