'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  MapPin,
  XCircle,
  Sparkles,
  CalendarCheck,
  RotateCcw,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';

interface ConsumerBooking {
  id: string;
  consumerId: string;
  providerId: string;
  serviceId: string;
  status:
    | 'PENDING_PAYMENT'
    | 'CONFIRMED'
    | 'RESCHEDULED'
    | 'CANCELLED'
    | 'COMPLETED'
    | 'CONSUMER_NO_SHOW'
    | 'PROVIDER_NO_SHOW';
  startAt: string;
  endAt: string;
  priceSnapshot: number; // in paise
  slotLockExpiresAt: string | null;
  cancellationPolicy: 'FLEXIBLE' | 'MODERATE' | 'STRICT';
  notes?: string | null;
  refundAmount?: number | null;
  rescheduledCount?: number;
  service?: {
    id: string;
    title: string;
    durationMin: number;
    mode: 'ONLINE' | 'IN_PERSON';
    category?: {
      name: string;
    };
  };
  provider?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    headline?: string | null;
    city?: string | null;
    country?: string | null;
    slug?: string | null;
    verificationTier?: string;
  };
  session?: {
    id: string;
    videoRoomUrl?: string | null;
    status: string;
  } | null;
}

export default function ConsumerBookingsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [bookings, setBookings] = useState<ConsumerBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [rescheduleBooking, setRescheduleBooking] = useState<ConsumerBooking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);

  const [cancelTargetBooking, setCancelTargetBooking] = useState<ConsumerBooking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const fetchBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiFetch<ConsumerBooking[]>(`/bookings/my?filter=${activeTab}`);
      setBookings(data);
    } catch {
      // Fallback demo data if testing unauthenticated
      setBookings(getMockBookings(activeTab));
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Handle Reschedule submit
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleBooking || !rescheduleDate) return;
    setIsSubmittingReschedule(true);
    try {
      const utcDate = new Date(rescheduleDate).toISOString();
      await apiFetch(`/bookings/${rescheduleBooking.id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          newStartAt: utcDate,
          reason: rescheduleReason || 'Seeker schedule shift',
        }),
      });
      alert('Your session has been successfully rescheduled.');
      setRescheduleBooking(null);
      await fetchBookings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reschedule';
      alert(`Reschedule Error: ${msg}`);
    } finally {
      setIsSubmittingReschedule(false);
    }
  };

  // Handle Cancel submit
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTargetBooking || cancelReason.trim().length < 3) return;
    setIsSubmittingCancel(true);
    try {
      const res = await apiFetch<{ refundAmountPaise: number }>(
        `/bookings/${cancelTargetBooking.id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: cancelReason,
          }),
        },
      );
      const refundRupees = (res.refundAmountPaise / 100).toLocaleString('en-IN');
      alert(
        `Booking cancelled. Refund of ₹${refundRupees} has been initiated to your original payment method.`,
      );
      setCancelTargetBooking(null);
      setCancelReason('');
      await fetchBookings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel booking';
      alert(`Cancellation Error: ${msg}`);
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Compute estimated refund for modal preview
  const estimatedRefund = useMemo(() => {
    if (!cancelTargetBooking) return { amount: 0, percent: 0, note: '' };
    const now = Date.now();
    const sessionTime = new Date(cancelTargetBooking.startAt).getTime();
    const hoursNotice = Math.max(0, (sessionTime - now) / 3600000);
    const policy = cancelTargetBooking.cancellationPolicy;
    const price = cancelTargetBooking.priceSnapshot / 100;

    if (policy === 'FLEXIBLE') {
      if (hoursNotice >= 24)
        return { amount: price, percent: 100, note: 'Full refund (cancelled >24h prior)' };
      return { amount: 0, percent: 0, note: 'Non-refundable within 24 hours of session' };
    }
    if (policy === 'MODERATE') {
      if (hoursNotice >= 48)
        return { amount: price, percent: 100, note: 'Full refund (cancelled >48h prior)' };
      if (hoursNotice >= 24)
        return { amount: price * 0.5, percent: 50, note: '50% refund (cancelled 24-48h prior)' };
      return { amount: 0, percent: 0, note: 'Non-refundable within 24 hours of session' };
    }
    // STRICT
    if (hoursNotice >= 168)
      return { amount: price, percent: 100, note: 'Full refund (cancelled >7 days prior)' };
    if (hoursNotice >= 48)
      return { amount: price * 0.5, percent: 50, note: '50% refund (cancelled 2-7 days prior)' };
    return { amount: 0, percent: 0, note: 'Non-refundable within 48 hours of session' };
  }, [cancelTargetBooking]);

  const getStatusBadge = (status: ConsumerBooking['status']) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success">Confirmed</Badge>;
      case 'PENDING_PAYMENT':
        return (
          <Badge variant="default" className="bg-amber-500/10 text-amber-700 border-amber-500/20">
            Lock Held • Complete Checkout
          </Badge>
        );
      case 'RESCHEDULED':
        return (
          <Badge variant="outline" className="border-primary/40 text-primary">
            Rescheduled
          </Badge>
        );
      case 'COMPLETED':
        return <Badge variant="secondary">Completed</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'PROVIDER_NO_SHOW':
        return <Badge variant="destructive">Practitioner Missed • 100% Refunded</Badge>;
      case 'CONSUMER_NO_SHOW':
        return <Badge variant="destructive">Missed Session</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-10 px-4 sm:px-8 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">Sanctuary Schedule</Badge>
            <span className="text-xs text-muted-foreground">Seeker Bookings</span>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">My Healing Journeys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your sacred wellness appointments, enter video sanctuaries, and review session
            notes.
          </p>
        </div>

        <Button
          asChild
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
        >
          <Link href="/explore">
            <Sparkles className="h-4 w-4" />
            Book a Session
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/70 space-x-8">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === 'upcoming'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Upcoming Appointments
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === 'past'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Past Sessions & Records
        </button>
      </div>

      {/* Booking List */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Gathering your session records...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-12 text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <CalendarCheck className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif text-xl font-medium text-foreground">
              No {activeTab} bookings
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {activeTab === 'upcoming'
                ? 'You do not have any upcoming appointments scheduled right now. Explore verified healers in our sanctuary.'
                : 'No historical appointments found in your record.'}
            </p>
          </div>
          {activeTab === 'upcoming' && (
            <Button asChild variant="outline" size="sm">
              <Link href="/explore">Discover Verified Practitioners</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {bookings.map((booking) => {
            const startDate = new Date(booking.startAt);
            const endDate = new Date(booking.endAt);
            const dateStr = startDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const timeStr = `${startDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })} - ${endDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short',
            })}`;
            const priceRupees = (booking.priceSnapshot / 100).toLocaleString('en-IN');

            return (
              <Card
                key={booking.id}
                className="overflow-hidden border-border/60 hover:border-primary/40 transition-all"
              >
                <CardHeader className="bg-muted/15 pb-4 border-b border-border/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-serif font-semibold shrink-0 overflow-hidden">
                        {booking.provider?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={booking.provider.avatarUrl}
                            alt={booking.provider.displayName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          booking.provider?.displayName?.charAt(0) || 'P'
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground text-sm">
                            {booking.provider?.displayName}
                          </h3>
                          <Badge variant="outline" className="text-[10px]">
                            {booking.service?.category?.name || 'Sanctuary'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {booking.provider?.headline}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">{getStatusBadge(booking.status)}</div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Service info */}
                  <div className="md:col-span-2 space-y-3">
                    <h4 className="font-serif text-lg font-medium text-foreground">
                      {booking.service?.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <CalendarIcon className="h-4 w-4 text-primary" />
                        <span>{dateStr}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-primary" />
                        <span>{timeStr}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {booking.service?.mode === 'ONLINE' ? (
                          <>
                            <Video className="h-4 w-4 text-primary" />
                            <span>Daily.co Video Room</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4 text-primary" />
                            <span>
                              In-Person ({booking.provider?.city}, {booking.provider?.country})
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {booking.notes && (
                      <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border border-border/40">
                        <span className="font-medium text-foreground">Intention: </span>
                        {booking.notes}
                      </p>
                    )}

                    {booking.refundAmount ? (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                        ✓ Refund of ₹{(booking.refundAmount / 100).toLocaleString('en-IN')}{' '}
                        processed back to your original payment method.
                      </p>
                    ) : null}
                  </div>

                  {/* Pricing & Policy summary */}
                  <div className="border-t md:border-t-0 md:border-l border-border/40 pt-4 md:pt-0 md:pl-6 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Escrow Amount</span>
                      <div className="font-serif text-2xl font-bold text-foreground">
                        ₹{priceRupees}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Policy: <span className="font-semibold">{booking.cancellationPolicy}</span>
                      </div>
                      {booking.rescheduledCount ? (
                        <div className="text-[11px] text-muted-foreground">
                          Rescheduled: {booking.rescheduledCount} time(s)
                        </div>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 pt-2">
                      {booking.status === 'PENDING_PAYMENT' && (
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                          asChild
                        >
                          <Link href={`/bookings/${booking.id}`}>Complete Payment & Lock Slot</Link>
                        </Button>
                      )}

                      {booking.status === 'CONFIRMED' && (
                        <>
                          {booking.service?.mode === 'ONLINE' && booking.session?.videoRoomUrl && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                              asChild
                            >
                              <a
                                href={booking.session.videoRoomUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Video className="h-3.5 w-3.5" />
                                Enter Video Sanctuary
                              </a>
                            </Button>
                          )}

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs gap-1"
                              onClick={() => {
                                setRescheduleBooking(booking);
                                setRescheduleDate(
                                  new Date(booking.startAt).toISOString().slice(0, 16),
                                );
                              }}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reschedule
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              onClick={() => {
                                setCancelTargetBooking(booking);
                              }}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}

                      <Button size="sm" variant="ghost" className="text-xs" asChild>
                        <Link href={`/bookings/${booking.id}`}>View Receipt & Details</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {rescheduleBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-md w-full shadow-2xl border-primary/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-xl">Reschedule Session</CardTitle>
                <Badge variant="outline">{rescheduleBooking.cancellationPolicy} Policy</Badge>
              </div>
              <CardDescription className="text-xs">
                Reschedule your appointment with {rescheduleBooking.provider?.displayName}. Payment
                in escrow is fully preserved.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleRescheduleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-date" className="text-xs font-semibold">
                    New Appointment Time
                  </Label>
                  <Input
                    id="new-date"
                    type="datetime-local"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    required
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Must adhere to practitioner notice window (minimum 2 hours notice).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reschedule-reason" className="text-xs font-semibold">
                    Reason for Rescheduling
                  </Label>
                  <Input
                    id="reschedule-reason"
                    placeholder="e.g. Schedule conflict, personal shift..."
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground border border-border/40">
                  <span className="font-medium text-foreground">Policy Notice: </span>
                  Rescheduling preserves your payment and atomically transfers your booking slot
                  upon validation.
                </div>
              </CardContent>

              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRescheduleBooking(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingReschedule || !rescheduleDate}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  {isSubmittingReschedule ? 'Rescheduling...' : 'Confirm Reschedule'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* CANCEL MODAL WITH LIVE REFUND COMPUTATION */}
      {cancelTargetBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-md w-full shadow-2xl border-rose-500/30">
            <CardHeader className="bg-rose-500/5 pb-4 border-b border-rose-500/20">
              <CardTitle className="font-serif text-xl text-rose-700 dark:text-rose-400">
                Cancel Appointment
              </CardTitle>
              <CardDescription className="text-xs">
                Review your refund entitlement under the {cancelTargetBooking.cancellationPolicy}{' '}
                policy.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCancelSubmit}>
              <CardContent className="space-y-4 pt-5">
                {/* Refund Computation Preview */}
                <div className="rounded-xl bg-muted/40 p-4 border border-border/60 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Original Payment:</span>
                    <span className="font-semibold">
                      ₹{(cancelTargetBooking.priceSnapshot / 100).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Computed Refund Rate:</span>
                    <Badge variant={estimatedRefund.percent > 0 ? 'success' : 'destructive'}>
                      {estimatedRefund.percent}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center text-base pt-2 border-t border-border/40 font-bold">
                    <span>Refund to be Returned:</span>
                    <span className="font-serif text-lg text-emerald-600">
                      ₹{estimatedRefund.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">{estimatedRefund.note}</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cancel-reason" className="text-xs font-semibold">
                    Cancellation Reason <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="cancel-reason"
                    placeholder="Please explain why you need to cancel (min 3 characters)..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    required
                    minLength={3}
                    className="text-sm"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelTargetBooking(null)}
                >
                  Keep Reservation
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingCancel || cancelReason.trim().length < 3}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  {isSubmittingCancel ? 'Cancelling...' : 'Authorize Cancellation'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

// Mock fallback for demo and unauthenticated testing
function getMockBookings(filter: 'upcoming' | 'past'): ConsumerBooking[] {
  if (filter === 'upcoming') {
    return [
      {
        id: 'book-mock-1',
        consumerId: 'cons-1',
        providerId: 'prov-1',
        serviceId: 'serv-1',
        status: 'CONFIRMED',
        startAt: new Date(Date.now() + 2 * 86400000 + 3600000 * 4).toISOString(),
        endAt: new Date(Date.now() + 2 * 86400000 + 3600000 * 5).toISOString(),
        priceSnapshot: 200000,
        slotLockExpiresAt: null,
        cancellationPolicy: 'MODERATE',
        notes: 'Help with anxiety relief and throat chakra mantra meditation.',
        rescheduledCount: 0,
        service: {
          id: 'serv-1',
          title: 'Sacred Sound & Vedic Meditation Journey',
          durationMin: 60,
          mode: 'ONLINE',
          category: { name: 'Meditation' },
        },
        provider: {
          id: 'prov-1',
          displayName: 'Guruji Vedavyas',
          headline: 'Traditional Vedic Meditation & Sound Practitioner',
          city: 'Rishikesh',
          country: 'India',
          avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
        },
        session: {
          id: 'sess-1',
          videoRoomUrl: 'https://nirvana.daily.co/vedic-meditation-room',
          status: 'SCHEDULED',
        },
      },
    ];
  }
  return [
    {
      id: 'book-mock-past-1',
      consumerId: 'cons-1',
      providerId: 'prov-2',
      serviceId: 'serv-2',
      status: 'COMPLETED',
      startAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      endAt: new Date(Date.now() - 5 * 86400000 + 3600000).toISOString(),
      priceSnapshot: 350000,
      slotLockExpiresAt: null,
      cancellationPolicy: 'FLEXIBLE',
      notes: 'Initial psychosomatic consultation.',
      rescheduledCount: 1,
      service: {
        id: 'serv-2',
        title: 'Pranic Energy Clearing & Biofield Reset',
        durationMin: 60,
        mode: 'ONLINE',
        category: { name: 'Energy Healing' },
      },
      provider: {
        id: 'prov-2',
        displayName: 'Dr. Ananya Sharma',
        headline: 'Licensed Clinical Psychologist & Holistic Healer',
        city: 'Bengaluru',
        country: 'India',
      },
    },
  ];
}
