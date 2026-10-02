'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import {
  ShieldCheck,
  Star,
  MapPin,
  Globe,
  Clock,
  Video,
  Award,
  Calendar,
  Sparkles,
  CheckCircle2,
  Lock,
  Share2,
  ChevronRight,
  AlertCircle,
  Play,
  X,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SlotPicker } from '@/components/consumer/slot-picker';
import { AvailableSlot } from '@project-nirvana/shared';

export interface PublicProfileData {
  profile: {
    id: string;
    displayName: string;
    slug: string;
    headline: string;
    bio: string;
    avatarUrl?: string | null;
    introVideoUrl?: string | null;
    languages: string[];
    yearsExperience: number;
    city: string;
    country: string;
    verificationTier: string;
    approvalStatus: string;
    ratingAvg: number;
    ratingCount: number;
    isPreview?: boolean;
  };
  categories: {
    id: string;
    name: string;
    slug: string;
    isPrimary: boolean;
    requiresLicense: boolean;
  }[];
  services: {
    id: string;
    title: string;
    description: string;
    durationMin: number;
    priceAmount: number;
    currency: string;
    mode: string;
    categoryId: string;
    categoryName: string;
  }[];
  seo: {
    title: string;
    description: string;
  };
  jsonLd: Record<string, unknown>;
}

export function PublicProfileView({ data }: { data: PublicProfileData }) {
  const router = useRouter();
  const { profile, categories, services } = data;
  const [selectedService, setSelectedService] = useState<PublicProfileData['services'][0] | null>(
    null,
  );
  const [chosenSlot, setChosenSlot] = useState<AvailableSlot | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const handleProceedToCheckout = async () => {
    if (!chosenSlot || !selectedService) return;
    setIsSubmittingBooking(true);
    setBookingError(null);
    try {
      const res = await apiFetch<{ id: string }>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: selectedService.id,
          startAt: chosenSlot.startUtc,
        }),
      });
      router.push(`/bookings/${res.id}`);
    } catch (err: unknown) {
      const errorObj = err as { code?: string; statusCode?: number; message?: string };
      if (errorObj?.statusCode === 401) {
        router.push(`/login?redirect=/providers/${profile.slug}`);
      } else if (errorObj?.code === 'SLOT_TEMPORARILY_LOCKED' || errorObj?.statusCode === 409) {
        setBookingError(
          'This slot was just selected by another seeker. Please pick an alternative time.',
        );
      } else {
        setBookingError(errorObj?.message || 'Unable to place slot reservation. Please try again.');
      }
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleSelectService = (service: PublicProfileData['services'][0]) => {
    setSelectedService(service);
    setChosenSlot(null);
    setIsBookingModalOpen(true);
  };

  // Format currency
  const formatPrice = (amountInPaise: number, currency: string = 'INR') => {
    const rupees = amountInPaise / 100;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(rupees);
  };

  const tierLabels: Record<string, { label: string; variant: 'default' | 'success' | 'amber' }> = {
    UNVERIFIED: { label: 'Verification In Progress', variant: 'default' },
    ID_VERIFIED: { label: 'ID Verified', variant: 'amber' },
    CREDENTIAL_VERIFIED: { label: 'Credential Verified', variant: 'success' },
    BACKGROUND_CHECKED: { label: 'Background Checked', variant: 'success' },
  };

  const tierInfo = tierLabels[profile.verificationTier] || {
    label: profile.verificationTier,
    variant: 'success',
  };

  const primaryCategory = categories.find((c) => c.isPrimary) || categories[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Preview Mode Notification Bar */}
      {profile.isPreview && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 text-center">
          <div className="container mx-auto flex items-center justify-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Practitioner Preview Mode:</strong> This profile is currently undergoing
              sanctuary review ({profile.approvalStatus}) and is only visible to you and platform
              administrators.
            </span>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      <div className="border-b border-border/40 bg-muted/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <nav className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Sanctuary
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/providers" className="hover:text-foreground transition-colors">
              Practitioners
            </Link>
            {primaryCategory && (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-muted-foreground">{primaryCategory.name}</span>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium truncate max-w-[200px]">
              {profile.displayName}
            </span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Main Profile Content (8 cols) */}
          <div className="lg:col-span-8 space-y-10">
            {/* Hero Profile Header */}
            <div className="flex flex-col sm:flex-row items-start gap-6 pb-8 border-b border-border/50">
              <div className="relative group shrink-0">
                <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden border-4 border-background shadow-xl ring-2 ring-primary/20 bg-muted flex items-center justify-center">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-emerald-500/20 text-3xl font-serif text-primary font-bold">
                      {profile.displayName.charAt(0)}
                    </div>
                  )}
                </div>
                <div
                  className="absolute bottom-1 right-1 bg-emerald-600 text-white rounded-full p-1.5 shadow-md ring-2 ring-background"
                  title="Sanctuary Verified Practitioner"
                >
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge variant={tierInfo.variant} className="gap-1.5 px-3 py-1 font-medium">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    {tierInfo.label}
                  </Badge>

                  {profile.ratingCount > 0 ? (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                      <span>{profile.ratingAvg.toFixed(1)}</span>
                      <span className="text-muted-foreground font-normal">
                        ({profile.ratingCount} reviews)
                      </span>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      New Practitioner
                    </Badge>
                  )}

                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {profile.yearsExperience}+ years experience
                  </Badge>
                </div>

                <div>
                  <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                    {profile.displayName}
                  </h1>
                  <p className="text-base sm:text-lg text-primary/90 font-medium mt-1">
                    {profile.headline}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm text-muted-foreground pt-1">
                  {(profile.city || profile.country) && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-muted-foreground/70" />
                      <span>{[profile.city, profile.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-muted-foreground/70" />
                    <span>Speaks {profile.languages.join(', ').toUpperCase()}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Video className="h-4 w-4 text-emerald-600" />
                    <span>Daily.co HD Video Sanctuary</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modalities & Specializations */}
            <div className="space-y-4">
              <h2 className="text-xl font-serif font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Modalities & Specialties
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 border text-sm font-medium transition-all ${
                      cat.isPrimary
                        ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                        : 'bg-card border-border/70 text-foreground hover:border-primary/40'
                    }`}
                  >
                    <span>{cat.name}</span>
                    {cat.isPrimary && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                    {cat.requiresLicense && (
                      <span
                        className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                        title="Board verified license"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        Licensed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Intro Video Preview (if available) */}
            {profile.introVideoUrl && (
              <div className="space-y-4">
                <h2 className="text-xl font-serif font-semibold text-foreground flex items-center gap-2">
                  <Video className="h-5 w-5 text-primary" />
                  Meet Your Practitioner
                </h2>
                <div className="relative rounded-2xl overflow-hidden border border-border/80 bg-muted/40 aspect-video shadow-md flex items-center justify-center group">
                  {profile.introVideoUrl.includes('youtube.com') ||
                  profile.introVideoUrl.includes('youtu.be') ? (
                    <iframe
                      src={profile.introVideoUrl.replace('watch?v=', 'embed/')}
                      title={`${profile.displayName} Video Introduction`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <div className="h-16 w-16 rounded-full bg-primary/20 text-primary flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <Play className="h-8 w-8 fill-primary ml-1" />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        Watch video greeting from {profile.displayName}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsVideoModalOpen(true)}
                        className="gap-2"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Watch Introduction
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* About / Bio */}
            <div className="space-y-4">
              <h2 className="text-xl font-serif font-semibold text-foreground flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                About {profile.displayName}
              </h2>
              <div className="prose prose-stone dark:prose-invert max-w-none text-muted-foreground text-base leading-relaxed space-y-4">
                {profile.bio.split('\n\n').map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
            </div>

            {/* Service Offerings */}
            <div className="space-y-6 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-serif font-semibold text-foreground">
                    Healing Offerings & Sessions
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Book a live time-based sanctuary session. Funds held securely in escrow until
                    session completion.
                  </p>
                </div>
              </div>

              {services.length === 0 ? (
                <Card className="p-8 text-center bg-muted/20 border-dashed">
                  <p className="text-muted-foreground text-sm">
                    No active sessions currently published for this practitioner.
                  </p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {services.map((svc) => (
                    <Card
                      key={svc.id}
                      className="border border-border/80 hover:border-primary/40 transition-all hover:shadow-md overflow-hidden bg-card"
                    >
                      <div className="p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                        <div className="space-y-2.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {svc.categoryName}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 text-muted-foreground"
                            >
                              <Clock className="h-3 w-3" />
                              {svc.durationMin} minutes
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                            >
                              <Video className="h-3 w-3" />
                              {svc.mode === 'IN_PERSON' ? 'In-Person' : 'Live Video'}
                            </Badge>
                          </div>

                          <h3 className="font-serif text-xl font-semibold text-foreground">
                            {svc.title}
                          </h3>

                          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            {svc.description}
                          </p>
                        </div>

                        <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-border/40 gap-4">
                          <div className="text-left sm:text-right">
                            <span className="text-2xl font-serif font-bold text-foreground">
                              {formatPrice(svc.priceAmount, svc.currency)}
                            </span>
                            <span className="text-xs text-muted-foreground block">
                              all-inclusive
                            </span>
                          </div>

                          <Button
                            onClick={() => handleSelectService(svc)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-5 py-2 shadow-sm rounded-xl gap-2"
                          >
                            <Calendar className="h-4 w-4" />
                            Book Session
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Client Reviews & Testimonials Section */}
            <div className="space-y-6 pt-6 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-serif font-semibold text-foreground flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                    Verified Client Experiences
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Authentic feedback from seekers who completed live sessions with{' '}
                    {profile.displayName}.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="p-5 bg-card/60 border border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-amber-500">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">2 weeks ago</span>
                  </div>
                  <p className="text-xs sm:text-sm text-foreground/90 italic leading-relaxed">
                    &quot;The energy healing session was extraordinarily grounding.{' '}
                    {profile.displayName} created such a peaceful, held space where I could deeply
                    release tension.&quot;
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Verified Session Attendee</span>
                  </div>
                </Card>

                <Card className="p-5 bg-card/60 border border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-amber-500">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">1 month ago</span>
                  </div>
                  <p className="text-xs sm:text-sm text-foreground/90 italic leading-relaxed">
                    &quot;Clear, empathetic, and truly insightful. The session helped clarify what I
                    had been struggling with for months. Highly recommended.&quot;
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Verified Session Attendee</span>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* Right Sticky Booking Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="sticky top-24 space-y-6">
              {/* Quick Action Card */}
              <Card className="border border-primary/20 bg-card shadow-lg rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-primary/10 via-emerald-500/10 to-primary/5 p-6 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Sessions Starting From
                    </span>
                    <Badge variant="success" className="text-[11px] gap-1">
                      <Lock className="h-3 w-3" />
                      Escrow Protected
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-serif font-bold text-foreground">
                      {services.length > 0
                        ? formatPrice(
                            Math.min(...services.map((s) => s.priceAmount)),
                            services[0]?.currency,
                          )
                        : '₹2,500'}
                    </span>
                    <span className="text-xs text-muted-foreground">/ session</span>
                  </div>
                </div>

                <CardContent className="p-6 space-y-5">
                  <div className="space-y-3">
                    <Button
                      onClick={() => {
                        if (services.length > 0) {
                          handleSelectService(services[0]);
                        }
                      }}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl shadow-md gap-2"
                      size="lg"
                    >
                      <Calendar className="h-5 w-5" />
                      Book Next Available Slot
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleShare}
                      className="w-full rounded-xl gap-2 text-xs"
                      size="sm"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      {copiedLink ? 'Link Copied to Clipboard!' : 'Share Sanctuary Profile'}
                    </Button>
                  </div>

                  {/* Trust guarantees list */}
                  <div className="space-y-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>100% Escrow Protection:</strong> Funds held securely by Project
                        Nirvana until your healing session concludes.
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Video className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>
                        <strong>HD Daily.co Video Room:</strong> Private, encrypted one-click video
                        link generated automatically upon booking.
                      </span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Sanctuary Guarantee:</strong> Rebooking or prompt refund protection
                        if any technical session disruption occurs.
                      </span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="bg-muted/30 px-6 py-4 border-t border-border/40 text-center">
                  <p className="text-[11px] text-muted-foreground mx-auto">
                    Member of Project Nirvana Holistic Practitioners Sanctuary
                  </p>
                </CardFooter>
              </Card>

              {/* Sanctuary Verification Credentials Card */}
              <Card className="border border-border/60 bg-muted/20 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Award className="h-4 w-4 text-emerald-600" />
                  Sanctuary Vetting Audit
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every practitioner on Project Nirvana completes comprehensive government identity
                  checks, modality certification inspection, and background authentication before
                  offering public sessions.
                </p>
                <div className="pt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Application Verified & Approved
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Drawer / Confirmation Modal */}
      {isBookingModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="max-w-lg w-full bg-card shadow-2xl border-primary/20 rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <CardHeader className="bg-muted/30 pb-4 border-b border-border/40 relative">
              <Button
                variant="outline"
                size="sm"
                className="absolute right-4 top-4 h-8 w-8 p-0 rounded-full"
                onClick={() => setIsBookingModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="w-fit mb-1">
                {selectedService.categoryName}
              </Badge>
              <CardTitle className="font-serif text-2xl">{selectedService.title}</CardTitle>
              <CardDescription>
                With {profile.displayName} &bull; {selectedService.durationMin} minutes
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-5">
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Session Fee:</span>
                  <span className="font-serif font-bold text-lg text-foreground">
                    {formatPrice(selectedService.priceAmount, selectedService.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Escrow Commission (15%):</span>
                  <span>Included</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Connection:</span>
                  <span>
                    {selectedService.mode === 'IN_PERSON'
                      ? 'In-Person Sanctuary'
                      : 'Daily.co Private HD Video Room'}
                  </span>
                </div>
              </div>

              {/* Real DST-accurate Slot Picker */}
              <SlotPicker
                providerId={profile.id}
                serviceId={selectedService.id}
                serviceTitle={selectedService.title}
                serviceDurationMin={selectedService.durationMin}
                selectedSlot={chosenSlot}
                onSelectSlot={(slot) => setChosenSlot(slot)}
              />

              {bookingError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{bookingError}</span>
                </div>
              )}

              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                <Lock className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>
                  <strong>Escrow Security:</strong> Payment is authorized via Razorpay Route and
                  held in trust until the session completes.
                </span>
              </div>
            </CardContent>

            <CardFooter className="bg-muted/20 px-6 py-4 border-t border-border/40 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                disabled={isSubmittingBooking}
                onClick={() => setIsBookingModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={!chosenSlot || isSubmittingBooking}
                onClick={handleProceedToCheckout}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 gap-2"
              >
                {isSubmittingBooking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Locking Slot...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" />
                    Proceed to Sanctuary Checkout
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Video Modal (if direct URL) */}
      {isVideoModalOpen && profile.introVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="max-w-3xl w-full bg-card rounded-2xl overflow-hidden shadow-2xl relative">
            <Button
              variant="outline"
              size="sm"
              className="absolute right-4 top-4 z-10 h-8 w-8 p-0 rounded-full bg-background/80"
              onClick={() => setIsVideoModalOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="p-4 border-b border-border">
              <h3 className="font-serif font-semibold text-lg">
                Introduction to {profile.displayName}
              </h3>
            </div>
            <div className="aspect-video bg-black flex items-center justify-center">
              <video
                src={profile.introVideoUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
