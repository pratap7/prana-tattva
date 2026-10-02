'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  DollarSign,
  Award,
  Clock,
  UserCheck,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface OnboardingStatus {
  profile: {
    id: string;
    displayName: string;
    slug: string;
    approvalStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
    verificationTier: string;
    rejectionReason?: string | null;
    onboardingStep: number;
    payoutAccountId?: string | null;
    kycStatus?: string | null;
  };
}

export default function ProviderDashboardPage() {
  const { user, isLoading } = useAuth();
  const [onboardingData, setOnboardingData] = useState<OnboardingStatus | null>(null);
  const [isFetchingStatus, setIsFetchingStatus] = useState(true);

  useEffect(() => {
    async function loadStatus() {
      try {
        const data = await apiFetch<OnboardingStatus>('/provider/onboarding');
        setOnboardingData(data);
      } catch {
        // Fallback or unauthenticated
      } finally {
        setIsFetchingStatus(false);
      }
    }

    if (user) {
      loadStatus();
    } else {
      setIsFetchingStatus(false);
    }
  }, [user]);

  if (isLoading || isFetchingStatus) {
    return (
      <div className="container mx-auto py-16 px-4 text-center">
        <div className="h-8 w-48 bg-muted rounded mx-auto animate-pulse" />
      </div>
    );
  }

  const profile = onboardingData?.profile;
  const approvalStatus = profile?.approvalStatus || 'DRAFT';
  const slug = profile?.slug || user?.providerProfile?.slug;

  return (
    <div className="container mx-auto py-10 px-4 sm:px-8 max-w-6xl space-y-8">
      {/* Onboarding & Verification Status Banners */}
      {approvalStatus === 'DRAFT' && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Practitioner Onboarding Incomplete
              </h2>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
                Finish setting up your basic information, credentials, intro video, and escrow
                payouts to submit your profile for sanctuary verification.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 rounded-xl gap-1.5 text-xs"
          >
            <Link href="/provider/onboarding">
              Continue Onboarding Wizard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {approvalStatus === 'PENDING' && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-primary">
                Application Under Sanctuary Review
              </h2>
              <p className="text-xs text-muted-foreground">
                Your dossier has been submitted to the Project Nirvana Vetting Board. We review
                certificates and ID documents within 24-48 business hours.
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="shrink-0 rounded-xl gap-1.5 text-xs"
          >
            <Link href="/provider/onboarding">
              View Submitted Application <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {approvalStatus === 'REJECTED' && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-destructive">
                Action Required on Application
              </h2>
              <p className="text-xs text-destructive/90">
                Feedback from Board:{' '}
                {profile?.rejectionReason || 'Please review and update your credentials.'}
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            variant="destructive"
            className="shrink-0 rounded-xl gap-1.5 text-xs"
          >
            <Link href="/provider/onboarding">
              Revise & Resubmit <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {approvalStatus === 'APPROVED' && slug && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Sanctuary Profile Verified & Live
              </h2>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90">
                Your profile is indexed on Project Nirvana. Seekers can discover your offerings and
                book live video sessions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs">
              <Link href="/provider/onboarding">
                <Settings className="h-3.5 w-3.5" />
                Edit Profile
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 text-xs"
            >
              <Link href={`/providers/${slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                View Public Sanctuary
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-emerald-500/10 via-background to-primary/10 p-8 sm:p-10">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="success">Practitioner Portal</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
              {profile?.displayName || user?.providerProfile?.displayName || user?.name}
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
        <Card className="hover:border-primary/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Bookings & Calendar
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-serif">
              <Link
                href="/provider/bookings"
                className="hover:text-primary transition-colors flex items-center gap-1"
              >
                View Roster <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Manage client sessions & attendance
            </p>
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
            <div className="text-sm font-semibold">{profile?.verificationTier || 'Unverified'}</div>
            <p className="text-xs text-muted-foreground mt-1">Status: {approvalStatus}</p>
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

      {/* Quick Action Navigation Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-serif font-medium text-foreground">Practitioner Toolkit</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:border-primary/50 transition-all group">
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                  <DollarSign className="h-5 w-5" />
                </span>
                <Badge variant="outline" className="text-xs">
                  Live
                </Badge>
              </div>
              <CardTitle className="text-base font-medium pt-2">Offerings & Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Set up 1:1 sessions, pricing (₹50 - ₹100,000), duration options (15 - 180 min), and
                cancellation policies.
              </p>
              <Button asChild size="sm" className="w-full rounded-xl gap-1.5 text-xs">
                <Link href="/provider/services">
                  Manage Services <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-all group">
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 group-hover:scale-105 transition-transform">
                  <Calendar className="h-5 w-5" />
                </span>
                <Badge variant="outline" className="text-xs">
                  Timezone Aware
                </Badge>
              </div>
              <CardTitle className="text-base font-medium pt-2">Working Hours & Slots</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Define your recurring weekly hours, buffer between sessions, minimum booking notice,
                and calendar blackout dates.
              </p>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full rounded-xl gap-1.5 text-xs"
              >
                <Link href="/provider/availability">
                  Configure Schedule <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-all group">
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 group-hover:scale-105 transition-transform">
                  <Settings className="h-5 w-5" />
                </span>
                <Badge variant="outline" className="text-xs">
                  {approvalStatus}
                </Badge>
              </div>
              <CardTitle className="text-base font-medium pt-2">Dossier & Credentials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Update your professional credentials, biography, categories, intro video, and escrow
                payout accounts.
              </p>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full rounded-xl gap-1.5 text-xs"
              >
                <Link href="/provider/onboarding">
                  Edit Profile <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
