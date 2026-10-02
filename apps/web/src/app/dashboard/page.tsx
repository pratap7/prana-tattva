'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Heart, ShieldCheck, Compass, ArrowRight } from 'lucide-react';

export default function ConsumerDashboardPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="container mx-auto py-16 px-4 text-center">
        <div className="h-8 w-48 bg-muted rounded mx-auto animate-pulse" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4 sm:px-8 max-w-6xl space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-secondary/15 p-8 sm:p-10">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="default">Seeker Sanctuary</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Verified Account
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
            Welcome back, {user?.name || 'Seeker'}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Your personal space to explore sacred healing modalities, connect with verified
            practitioners, and attend your live video sessions.
          </p>
        </div>
      </div>

      {/* Quick stats / cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Upcoming Sessions
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">0 Scheduled</div>
            <p className="text-xs text-muted-foreground mt-1">Book your next healing session</p>
            <Button size="sm" variant="outline" className="mt-4 w-full" asChild>
              <Link href="/services">
                Explore Healers
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Favorite Healers
            </CardTitle>
            <Heart className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">0 Saved</div>
            <p className="text-xs text-muted-foreground mt-1">Save practitioners to your circle</p>
            <Button size="sm" variant="outline" className="mt-4 w-full" asChild>
              <Link href="/providers">
                View Directory
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Account Status
            </CardTitle>
            <Compass className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold">{user?.email}</div>
            <p className="text-xs text-muted-foreground mt-1">Role: {user?.role}</p>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="success">Active</Badge>
              <Badge variant="secondary">{user?.timeZone || 'Asia/Kolkata'}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
