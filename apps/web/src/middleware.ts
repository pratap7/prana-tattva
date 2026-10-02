import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface UserSessionCookie {
  id: string;
  role: 'CONSUMER' | 'PROVIDER' | 'ADMIN';
  email: string;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Retrieve user session cookie
  const sessionCookie = request.cookies.get('nirvana_session');
  let session: UserSessionCookie | null = null;

  if (sessionCookie?.value) {
    try {
      session = JSON.parse(decodeURIComponent(sessionCookie.value));
    } catch {
      session = null;
    }
  }

  const isAuthenticated = !!session;
  const userRole = session?.role;

  // 1. Auth pages (login, signup, forgot-password, reset-password)
  const isAuthPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password');

  if (isAuthPage && isAuthenticated) {
    if (userRole === 'ADMIN') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    if (userRole === 'PROVIDER') {
      return NextResponse.redirect(new URL('/provider/dashboard', request.url));
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 2. Protected admin routes
  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnUrl', pathname + search);
      return NextResponse.redirect(loginUrl);
    }

    if (userRole !== 'ADMIN') {
      // Forbidden: redirect to home or user dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // 3. Protected provider routes
  if (pathname.startsWith('/provider')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnUrl', pathname + search);
      return NextResponse.redirect(loginUrl);
    }

    if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
      // Forbidden: Consumers cannot access provider dashboard/routes
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // 4. Protected general member routes (dashboard, bookings, sessions)
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/bookings') ||
    pathname.startsWith('/sessions')
  ) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnUrl', pathname + search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/dashboard/:path*',
    '/provider/:path*',
    '/admin/:path*',
    '/bookings/:path*',
    '/sessions/:path*',
  ],
};
