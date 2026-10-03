'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  CalendarDays,
  AlertTriangle,
  CreditCard,
  Sliders,
  Settings,
  ShieldAlert,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AdminNavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  permission?: string;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  {
    name: 'Verification Queue',
    href: '/admin/verification',
    icon: ShieldCheck,
    permission: 'SUPPORT',
  },
  { name: 'Users & Providers', href: '/admin/users', icon: Users, permission: 'SUPPORT' },
  { name: 'Bookings', href: '/admin/bookings', icon: CalendarDays, permission: 'SUPPORT' },
  {
    name: 'Disputes & Claims',
    href: '/admin/disputes',
    icon: AlertTriangle,
    permission: 'TRUST_SAFETY',
  },
  { name: 'Payments & Payouts', href: '/admin/payments', icon: CreditCard, permission: 'FINANCE' },
  { name: 'Content & Taxonomy', href: '/admin/content', icon: Sliders, permission: 'SUPPORT' },
  { name: 'Platform Settings', href: '/admin/settings', icon: Settings, permission: 'SUPER_ADMIN' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // "View As" read-only preview mode state in localStorage
  const [viewAsInfo, setViewAsInfo] = useState<{
    targetName: string;
    targetEmail: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nirvana_view_as');
      if (stored) {
        try {
          setViewAsInfo(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const handleExitViewAs = () => {
    localStorage.removeItem('nirvana_view_as');
    setViewAsInfo(null);
  };

  // Auth gate: redirect if unauthenticated or not ADMIN
  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.push('/login?redirect=/admin/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-serif text-sm text-muted-foreground">Authenticating Ops Access...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This ops console requires verified Administrator credentials. Your account (
            {user?.email || 'Guest'}) does not hold administrative clearance.
          </p>
          <Button variant="default" onClick={() => router.push('/login?redirect=/admin/dashboard')}>
            Sign In with Admin Account
          </Button>
        </div>
      </div>
    );
  }

  const permissions = user.adminPermissions || ['SUPER_ADMIN'];

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      {/* Impersonation-Free "View As" Persistent Banner */}
      {viewAsInfo && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2.5 text-xs font-medium flex items-center justify-between shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 shrink-0" />
            <span>
              <strong>Impersonation-Free Read-Only Mode:</strong> Inspecting view as{' '}
              <span className="underline">{viewAsInfo.targetName}</span> ({viewAsInfo.targetEmail} -{' '}
              {viewAsInfo.role}). No write actions will be taken.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExitViewAs}
            className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white border-amber-700"
          >
            Exit Read-Only View
          </Button>
        </div>
      )}

      {/* Top Ops Navigation Bar */}
      <header className="sticky top-0 z-40 bg-card border-b border-border/80 shadow-xs">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-primary to-emerald-600 flex items-center justify-center text-white font-serif font-bold text-lg shadow-sm">
              ॐ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-base text-foreground tracking-tight">
                  Project Nirvana
                </span>
                <Badge
                  variant="destructive"
                  className="text-[10px] uppercase font-mono px-1.5 py-0"
                >
                  Ops Console
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground hidden sm:block">
                Trust, Safety & Financial Stewardship
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5">
              {permissions.map((p) => (
                <Badge
                  key={p}
                  variant="outline"
                  className="text-[10px] bg-muted/50 border-primary/20 text-primary font-mono"
                >
                  {p}
                </Badge>
              ))}
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-foreground">{user.email}</p>
              <p className="text-[10px] text-muted-foreground">Admin Session Active</p>
            </div>

            <Button variant="outline" size="sm" asChild className="text-xs gap-1 h-8">
              <Link href="/">
                <span>Sanctuary</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Secondary Horizontal Navigation Bar for Fast Switching */}
        <div className="border-t border-border/40 bg-card/50 overflow-x-auto scrollbar-none">
          <div className="container mx-auto px-4 sm:px-6 flex items-center gap-1 py-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 max-w-7xl">{children}</main>

      {/* Ops Footer */}
      <footer className="border-t border-border/40 bg-card/30 py-4 text-center text-[11px] text-muted-foreground">
        <span>
          Project Nirvana Operations • All actions are audit-logged in accordance with Trust &
          Platform Governance protocols.
        </span>
      </footer>
    </div>
  );
}
