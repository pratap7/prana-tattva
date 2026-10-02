'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  User,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  TrendingUp,
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

interface ProviderBookingItem {
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
  consumer?: {
    id: string;
    email: string;
  };
  session?: {
    id: string;
    videoRoomUrl?: string | null;
    status: string;
    consumerJoinedAt?: string | null;
    providerJoinedAt?: string | null;
  } | null;
}

export default function ProviderBookingsCalendarPage() {
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [bookings, setBookings] = useState<ProviderBookingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cancellation modal state
  const [cancelModalBooking, setCancelModalBooking] = useState<ProviderBookingItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  // Attendance recording state
  const [recordingAttendanceId, setRecordingAttendanceId] = useState<string | null>(null);

  // Stats
  const [reliabilityStrikes, setReliabilityStrikes] = useState<number>(0);

  const fetchProviderBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiFetch<ProviderBookingItem[]>(
        `/bookings/provider/sessions?filter=${filter}`,
      );
      setBookings(data);
    } catch {
      // Fallback demo data for preview
      setBookings(getMockProviderBookings(filter));
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchProviderBookings();
  }, [fetchProviderBookings]);

  // Mark Attendance action
  const handleMarkAttendance = async (bookingId: string) => {
    setRecordingAttendanceId(bookingId);
    try {
      await apiFetch(`/bookings/${bookingId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          party: 'PROVIDER',
        }),
      });
      alert('Your attendance has been marked successfully.');
      await fetchProviderBookings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Attendance update failed';
      alert(`Attendance Error: ${msg}`);
    } finally {
      setRecordingAttendanceId(null);
    }
  };

  // Provider Cancel session (with strike warning)
  const handleProviderCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalBooking || cancelReason.trim().length < 3) return;
    setIsSubmittingCancel(true);
    try {
      await apiFetch(`/bookings/${cancelModalBooking.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: cancelReason,
        }),
      });
      setReliabilityStrikes((prev) => prev + 1);
      alert(
        'Session cancelled. The client was issued a 100% full refund and 1 strike was recorded on your profile.',
      );
      setCancelModalBooking(null);
      setCancelReason('');
      await fetchProviderBookings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel session';
      alert(`Cancellation Error: ${msg}`);
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const getStatusBadge = (status: ProviderBookingItem['status']) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success">Confirmed & Escrowed</Badge>;
      case 'COMPLETED':
        return <Badge variant="secondary">Completed</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'PROVIDER_NO_SHOW':
        return <Badge variant="destructive">Provider No-Show (Strike)</Badge>;
      case 'CONSUMER_NO_SHOW':
        return <Badge variant="destructive">Client No-Show</Badge>;
      case 'RESCHEDULED':
        return (
          <Badge variant="outline" className="border-primary text-primary">
            Rescheduled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-10 px-4 sm:px-8 max-w-6xl space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">Practitioner Studio</Badge>
            <span className="text-xs text-muted-foreground">Session Roster & Calendar</span>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">
            Appointments & Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your booked seeker consultations, start video sanctuary rooms, and record
            attendance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/provider/availability">Edit Availability Rules</Link>
          </Button>
          <Button size="sm" asChild className="bg-primary text-primary-foreground font-semibold">
            <Link href="/provider/services">Manage Offerings</Link>
          </Button>
        </div>
      </div>

      {/* Practitioner Reliability & Trust Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-muted/15 border-border/60">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">Reliability Score</span>
              <div className="font-serif text-xl font-bold text-foreground">
                {reliabilityStrikes === 0 ? '100% Exemplary' : `${reliabilityStrikes} Strike(s)`}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {reliabilityStrikes === 0
                  ? 'Zero provider cancellations'
                  : 'Keep cancellations to zero to protect tier'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/15 border-border/60">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Total Sessions Booked
              </span>
              <div className="font-serif text-xl font-bold text-foreground">{bookings.length}</div>
              <p className="text-[11px] text-muted-foreground">Across all service modalities</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/15 border-border/60">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">Escrow Guarantee</span>
              <div className="font-serif text-xl font-bold text-foreground">Protected</div>
              <p className="text-[11px] text-muted-foreground">
                Released via Razorpay Route upon completion
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strike Warning Alert (if any strikes exist) */}
      {reliabilityStrikes > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <span className="font-bold">Reliability Strike Recorded: </span>
            You have {reliabilityStrikes} cancellation strike(s). Project Nirvana maintains strict
            practitioner reliability guarantees. Repeated unexcused cancellations impact your
            verified status.
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex border-b border-border/70 space-x-8">
        <button
          onClick={() => setFilter('upcoming')}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            filter === 'upcoming'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Upcoming Appointments
        </button>
        <button
          onClick={() => setFilter('past')}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            filter === 'past'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Completed & Past Records
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            filter === 'all'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          All History
        </button>
      </div>

      {/* Bookings Roster */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">
            Synchronizing your practitioner appointments...
          </p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-12 text-center space-y-3">
          <CalendarIcon className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="font-serif text-lg font-medium">No sessions in this view</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Your calendar is open for seekers. Ensure your availability rules are configured for
            optimal bookings.
          </p>
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
            const feeRupees = (booking.priceSnapshot / 100).toLocaleString('en-IN');

            const hasProviderJoined = !!booking.session?.providerJoinedAt;
            const hasConsumerJoined = !!booking.session?.consumerJoinedAt;

            return (
              <Card
                key={booking.id}
                className="overflow-hidden border-border/60 hover:border-primary/40 transition-all"
              >
                <CardHeader className="bg-muted/15 pb-4 border-b border-border/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-semibold shrink-0">
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground text-sm">
                            Client: {booking.consumer?.email || 'Registered Seeker'}
                          </h3>
                          <Badge variant="outline" className="text-[10px]">
                            {booking.service?.category?.name || 'Sanctuary'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Booking ID: {booking.id.substring(0, 8)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">{getStatusBadge(booking.status)}</div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Column: Session and Client Notes */}
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
                            <span>In-Person Studio</span>
                          </>
                        )}
                      </div>
                    </div>

                    {booking.notes && (
                      <div className="rounded-lg bg-muted/20 p-3 text-xs text-muted-foreground border border-border/40">
                        <span className="font-semibold text-foreground">Seeker Intention: </span>
                        {booking.notes}
                      </div>
                    )}

                    {/* Attendance status track */}
                    <div className="flex items-center gap-3 text-xs pt-1">
                      <span className="text-muted-foreground">Live Attendance:</span>
                      <span
                        className={`inline-flex items-center gap-1 ${hasProviderJoined ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}
                      >
                        {hasProviderJoined ? '✓ You Checked In' : '○ Not Checked In'}
                      </span>
                      <span className="text-border">•</span>
                      <span
                        className={`inline-flex items-center gap-1 ${hasConsumerJoined ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}
                      >
                        {hasConsumerJoined ? '✓ Client Checked In' : '○ Waiting for Client'}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Escrow & Actions */}
                  <div className="border-t md:border-t-0 md:border-l border-border/40 pt-4 md:pt-0 md:pl-6 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Payout in Escrow</span>
                      <div className="font-serif text-2xl font-bold text-foreground">
                        ₹{feeRupees}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Policy: <span className="font-semibold">{booking.cancellationPolicy}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      {booking.status === 'CONFIRMED' && (
                        <>
                          {booking.service?.mode === 'ONLINE' && booking.session?.videoRoomUrl && (
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                              asChild
                            >
                              <a
                                href={booking.session.videoRoomUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Video className="h-3.5 w-3.5" />
                                Open Video Sanctuary
                              </a>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1"
                            disabled={recordingAttendanceId === booking.id || hasProviderJoined}
                            onClick={() => handleMarkAttendance(booking.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            {hasProviderJoined ? 'Attendance Recorded' : 'Mark My Attendance'}
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                            onClick={() => setCancelModalBooking(booking)}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Cancel Session
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* PROVIDER CANCELLATION WARNING MODAL */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-md w-full shadow-2xl border-rose-500/40">
            <CardHeader className="bg-rose-500/10 pb-4 border-b border-rose-500/20">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle className="font-serif text-xl">Provider Cancellation Warning</CardTitle>
              </div>
              <CardDescription className="text-xs text-rose-800 dark:text-rose-300">
                Cancelling as a practitioner triggers mandatory penalties.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleProviderCancelSubmit}>
              <CardContent className="space-y-4 pt-4">
                <div className="rounded-xl bg-rose-500/10 p-4 border border-rose-500/30 text-xs space-y-2 text-rose-900 dark:text-rose-200">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                    Important Practitioner Reliability Notice:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                    <li>
                      The client will be automatically refunded <strong>100%</strong> of their
                      payment immediately.
                    </li>
                    <li>
                      <strong>1 Reliability Strike</strong> will be permanently recorded on your
                      practitioner profile.
                    </li>
                    <li>
                      Accumulating multiple strikes leads to immediate suspension of your verified
                      status.
                    </li>
                  </ul>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="provider-cancel-reason" className="text-xs font-semibold">
                    Reason for Provider Cancellation <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="provider-cancel-reason"
                    placeholder="Describe the unforeseen emergency or medical circumstance (min 3 chars)..."
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
                  onClick={() => setCancelModalBooking(null)}
                >
                  Keep Session
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingCancel || cancelReason.trim().length < 3}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  {isSubmittingCancel ? 'Processing Strike...' : 'Accept Strike & Cancel'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

// Fallback demo data
function getMockProviderBookings(filter: 'upcoming' | 'past' | 'all'): ProviderBookingItem[] {
  if (filter === 'past') {
    return [
      {
        id: 'book-prov-past-1',
        consumerId: 'cons-past',
        providerId: 'prov-me',
        serviceId: 'serv-1',
        status: 'COMPLETED',
        startAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        endAt: new Date(Date.now() - 3 * 86400000 + 3600000).toISOString(),
        priceSnapshot: 200000,
        cancellationPolicy: 'MODERATE',
        notes: 'Chakra alignment consultation.',
        consumer: { id: 'cons-past', email: 'seeker.priya@example.com' },
        service: {
          id: 'serv-1',
          title: 'Sacred Sound & Vedic Meditation Journey',
          durationMin: 60,
          mode: 'ONLINE',
          category: { name: 'Meditation' },
        },
      },
    ];
  }

  return [
    {
      id: 'book-prov-1',
      consumerId: 'cons-101',
      providerId: 'prov-me',
      serviceId: 'serv-1',
      status: 'CONFIRMED',
      startAt: new Date(Date.now() + 86400000 * 2).toISOString(),
      endAt: new Date(Date.now() + 86400000 * 2 + 3600000).toISOString(),
      priceSnapshot: 200000,
      cancellationPolicy: 'MODERATE',
      notes: 'Focus on pranayama techniques and breath awareness.',
      consumer: { id: 'cons-101', email: 'seeker.dev@example.com' },
      service: {
        id: 'serv-1',
        title: 'Sacred Sound & Vedic Meditation Journey',
        durationMin: 60,
        mode: 'ONLINE',
        category: { name: 'Meditation' },
      },
      session: {
        id: 'sess-prov-1',
        videoRoomUrl: 'https://nirvana.daily.co/vedic-meditation-room',
        status: 'SCHEDULED',
      },
    },
  ];
}
