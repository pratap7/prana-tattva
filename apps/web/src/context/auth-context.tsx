'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LoginInput, SignupInput, AuthResponse, UserRole } from '@project-nirvana/shared';
import { apiFetch, setAccessToken } from '@/lib/api-client';

export interface UserSession {
  id: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: string;
  timeZone?: string;
  locale?: string;
  name?: string;
  providerProfile?: {
    id: string;
    displayName: string;
    slug: string;
  } | null;
}

interface AuthContextType {
  user: UserSession | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  requestPhoneOtp: (
    phone: string,
  ) => Promise<{ success: boolean; message: string; expiresInSeconds: number }>;
  verifyPhoneOtp: (phone: string, code: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_COOKIE_NAME = 'nirvana_session';

function setClientSessionCookie(user: UserSession | null) {
  if (typeof document === 'undefined') return;
  if (!user) {
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } else {
    const payload = encodeURIComponent(
      JSON.stringify({
        id: user.id,
        role: user.role,
        email: user.email,
      }),
    );
    // 30 days cookie
    document.cookie = `${SESSION_COOKIE_NAME}=${payload}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  const handleAuthSuccess = useCallback((authData: AuthResponse) => {
    setToken(authData.accessToken);
    setAccessToken(authData.accessToken);

    const sessionUser: UserSession = {
      id: authData.user.id,
      email: authData.user.email,
      phone: authData.user.phone,
      role: authData.user.role as UserRole,
      status: authData.user.status,
      timeZone: authData.user.timeZone,
      locale: authData.user.locale,
      name: authData.user.providerProfile?.displayName || authData.user.email.split('@')[0],
      providerProfile: authData.user.providerProfile,
    };

    setUser(sessionUser);
    setClientSessionCookie(sessionUser);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const authData = await apiFetch<AuthResponse>('/auth/refresh', {
        method: 'POST',
        skipAuth: true,
      });
      handleAuthSuccess(authData);
    } catch {
      setToken(null);
      setAccessToken(null);
      setUser(null);
      setClientSessionCookie(null);
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthSuccess]);

  // Initial silent auth refresh on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (input: LoginInput) => {
    setIsLoading(true);
    try {
      const data = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      handleAuthSuccess(data);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (input: SignupInput) => {
    setIsLoading(true);
    try {
      const data = await apiFetch<AuthResponse>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      handleAuthSuccess(data);
    } finally {
      setIsLoading(false);
    }
  };

  const requestPhoneOtp = async (phone: string) => {
    return apiFetch<{ success: boolean; message: string; expiresInSeconds: number }>(
      '/auth/phone/otp/request',
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
      },
    );
  };

  const verifyPhoneOtp = async (phone: string, code: string) => {
    setIsLoading(true);
    try {
      const data = await apiFetch<AuthResponse>('/auth/phone/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
      handleAuthSuccess(data);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiFetch<{ success: boolean }>('/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Even if network error occurs, clear local session
    } finally {
      setToken(null);
      setAccessToken(null);
      setUser(null);
      setClientSessionCookie(null);
      setIsLoading(false);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        requestPhoneOtp,
        verifyPhoneOtp,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
