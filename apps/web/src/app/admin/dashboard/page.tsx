'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Users, Layers, Activity } from 'lucide-react';

export default function AdminDashboardPage() {
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
      <div className="relative overflow-hidden rounded-3xl border border-destructive/20 bg-gradient-to-r from-destructive/10 via-background to-secondary/20 p-8 sm:p-10">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Platform Administration</Badge>
            <span className="text-xs text-muted-foreground">Admin: {user?.email}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
            Project Nirvana Ops Control
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Manage platform users, verify practitioner credentials, configure commission
            percentages, inspect audit logs, and oversee disputes.
          </p>
        </div>
      </div>

      {/* Admin stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pending Healers
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">1</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting credential review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Commission Take
            </CardTitle>
            <Layers className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">15%</div>
            <p className="text-xs text-muted-foreground mt-1">Default platform rate (1500 bps)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              System Health
            </CardTitle>
            <Activity className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold text-emerald-600">All Systems Nominal</div>
            <p className="text-xs text-muted-foreground mt-1">Postgres, Redis, Mailpit up</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Audit Log Records
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">Active</div>
            <p className="text-xs text-muted-foreground mt-1">Tamper-evident log trail</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Banner */}
      <Card className="border border-primary/20 bg-gradient-to-r from-primary/5 via-background to-emerald-500/5 p-6 rounded-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Practitioner Verification Queue
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Review submitted practitioner dossiers, inspect uploaded certificates, verify
              licenses, and approve public sanctuary profiles.
            </p>
          </div>
          <div className="shrink-0">
            <a
              href="/admin/verification"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all"
            >
              Open Verification Queue &rarr;
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
