'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowLeft, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WaitingLobbyProps {
  partnerName: string;
  serviceTitle: string;
  sessionStartAt: string;
  onLeave: () => void;
  onBackToPreJoin: () => void;
}

export function WaitingLobby({
  partnerName,
  serviceTitle,
  sessionStartAt,
  onLeave,
  onBackToPreJoin,
}: WaitingLobbyProps) {
  const [breathingText, setBreathingText] = useState('Breathe In...');

  // 8-second pranayama rhythm (4s in, 4s out)
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathingText((prev) => (prev === 'Breathe In...' ? 'Breathe Out...' : 'Breathe In...'));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const formattedStart = new Date(sessionStartAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-12 flex flex-col items-center text-center space-y-8 animate-in fade-in duration-700">
      {/* Top Tag */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-serif text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Sanctuary Waiting Room
      </div>

      {/* Main Title & Status */}
      <div className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground">
          {serviceTitle}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
          Waiting for your practitioner{' '}
          <span className="text-foreground font-semibold">{partnerName}</span> to enter the
          sanctuary.
        </p>
      </div>

      {/* Ambient Breathing Animation */}
      <div className="relative my-4 flex items-center justify-center">
        {/* Outer glowing pulsing ring */}
        <div
          className="absolute h-64 w-64 rounded-full bg-primary/10 animate-ping opacity-30"
          style={{ animationDuration: '4s' }}
        />
        {/* Middle pulsing aura */}
        <div className="h-48 w-48 rounded-full bg-gradient-to-tr from-primary/20 via-emerald-500/10 to-teal-500/20 backdrop-blur-md border border-primary/30 flex items-center justify-center shadow-2xl transition-all duration-1000">
          <div className="h-32 w-32 rounded-full bg-background/90 border border-primary/40 flex flex-col items-center justify-center p-4 text-center">
            <span className="text-xs uppercase font-serif tracking-widest text-primary/80">
              Pranayama
            </span>
            <span className="text-sm font-medium text-foreground transition-opacity duration-500 mt-1">
              {breathingText}
            </span>
          </div>
        </div>
      </div>

      {/* Status Notice */}
      <div className="p-4 rounded-2xl bg-card border border-border/70 max-w-md w-full shadow-sm text-xs text-muted-foreground space-y-2">
        <div className="flex items-center justify-center gap-2 font-medium text-foreground">
          <Clock className="h-4 w-4 text-primary" />
          Scheduled Start: {formattedStart}
        </div>
        <p>
          You do not need to refresh. Your video consultation will connect automatically as soon as
          your practitioner enters.
        </p>
      </div>

      {/* Secondary Controls */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBackToPreJoin} className="text-xs gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> Device Settings
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onLeave}
          className="text-xs text-destructive hover:bg-destructive/10"
        >
          Leave Room
        </Button>
      </div>
    </div>
  );
}
