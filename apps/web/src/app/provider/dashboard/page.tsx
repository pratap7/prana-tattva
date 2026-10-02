'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, DollarSign, Award, Clock, UserCheck } from 'lucide-react';

export default function ProviderDashboardPage() {
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
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-emerald-500/10 via-background to-primary/10 p-8 sm:p-10">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="success">Practitioner Portal</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
              {user?.providerProfile?.displayName || user?.name}
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
            Practitioner Sanctuary
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Manage your service offerings, set availability slots, review client bookings, and
            monitor your escrow payouts securely.
          </p>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pending Bookings
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">0</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting confirmation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Escrow Balance
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">₹0.00</div>
            <p className="text-xs text-muted-foreground mt-1">Released post-session</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Verification Tier
            </CardTitle>
            <Award className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Credential Verified</div>
            <p className="text-xs text-muted-foreground mt-1">Full platform trust</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Hours Delivered
            </CardTitle>
            <Clock className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">0 hrs</div>
            <p className="text-xs text-muted-foreground mt-1">Live healing sessions</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
