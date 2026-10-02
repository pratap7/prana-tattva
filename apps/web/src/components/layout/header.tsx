'use client';

import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

export function Header() {
  const { user, isAuthenticated, logout, isLoading } = useAuth();

  const getDashboardHref = () => {
    if (!user) return '/dashboard';
    if (user.role === 'ADMIN') return '/admin/dashboard';
    if (user.role === 'PROVIDER') return '/provider/dashboard';
    return '/dashboard';
  };

  const getRoleLabel = () => {
    if (!user) return '';
    if (user.role === 'ADMIN') return 'Admin';
    if (user.role === 'PROVIDER') return 'Practitioner';
    return 'Seeker';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-md transition-colors">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center space-x-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-serif text-xl tracking-tight font-medium text-foreground">
            Nirvana
          </span>
        </Link>

        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-muted-foreground">
          <Link href="/explore" className="transition-colors hover:text-foreground">
            Explore Sanctuary
          </Link>
          <Link href="/providers" className="transition-colors hover:text-foreground">
            Verified Guides
          </Link>
          <Link href="/how-it-works" className="transition-colors hover:text-foreground">
            How It Works
          </Link>
        </nav>

        <div className="flex items-center space-x-3">
          <ThemeToggle />

          {!isLoading && isAuthenticated && user ? (
            <div className="flex items-center space-x-3">
              <Link href={getDashboardHref()} className="flex items-center space-x-2 text-sm">
                <Badge
                  variant={
                    user.role === 'ADMIN'
                      ? 'destructive'
                      : user.role === 'PROVIDER'
                        ? 'success'
                        : 'default'
                  }
                  className="font-normal"
                >
                  {getRoleLabel()}
                </Badge>
                <span className="hidden sm:inline font-medium text-foreground max-w-[120px] truncate">
                  {user.name}
                </span>
              </Link>
              <Button variant="outline" size="sm" asChild>
                <Link href={getDashboardHref()}>
                  <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                  Dashboard
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                title="Log out"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Join Sanctuary</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
