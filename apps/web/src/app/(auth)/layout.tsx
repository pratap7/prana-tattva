import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-8 overflow-hidden bg-radial from-primary/5 via-background to-background">
      {/* Decorative calm background elements */}
      <div className="absolute top-1/4 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 -right-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-lg mx-auto py-8">{children}</div>
    </div>
  );
}
