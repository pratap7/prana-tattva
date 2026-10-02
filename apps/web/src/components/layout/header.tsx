import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export function Header() {
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
          <Link href="/services" className="transition-colors hover:text-foreground">
            Explore Modalities
          </Link>
          <Link href="/providers" className="transition-colors hover:text-foreground">
            Verified Practitioners
          </Link>
          <Link href="/how-it-works" className="transition-colors hover:text-foreground">
            How It Works
          </Link>
        </nav>

        <div className="flex items-center space-x-3">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/services">Book a Session</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
