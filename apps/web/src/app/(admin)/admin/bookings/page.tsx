'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Search,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch, getAccessToken } from '@/lib/api-client';
import { AdminBookingTimelineEvent } from '@project-nirvana/shared';

interface BookingItem {
  id: string;
  priceSnapshot: number;
  status: string;
  startAt: string;
  endAt: string;
  createdAt: string;
  consumer: { id: string; email: string };
  provider: {
    id: string;
    email: string;
    providerProfile?: { displayName: string; slug: string } | null;
  };
  service: { id: string; title: string; mode: string; durationMin: number };
  payments: Array<{ id: string; status: string; amount: number; gateway: string }>;
  dispute?: { id: string; status: string } | null;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PENDING_PAYMENT', label: 'Pending Payment' },
  { value: 'CANCELLED_BY_CONSUMER', label: 'Cancelled (Seeker)' },
  { value: 'CANCELLED_BY_PROVIDER', label: 'Cancelled (Practitioner)' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Timeline modal state
  const [selectedBookingForTimeline, setSelectedBookingForTimeline] = useState<BookingItem | null>(
    null,
  );
  const [timelineEvents, setTimelineEvents] = useState<AdminBookingTimelineEvent[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

  // Cancel & Refund modal state
  const [cancelTarget, setCancelTarget] = useState<BookingItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundAmountInr, setRefundAmountInr] = useState('');
  const [penalizeProvider, setPenalizeProvider] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Force Complete modal state
  const [completeTarget, setCompleteTarget] = useState<BookingItem | null>(null);
  const [completeReason, setCompleteReason] = useState('');
  const [releaseEscrow, setReleaseEscrow] = useState(true);
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '15');
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter) params.append('status', statusFilter);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      const data = await apiFetch<{
        bookings: BookingItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/admin/bookings?${params.toString()}`);

      setBookings(data.bookings || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      // Offline fallback mock data for testing/preview
      setBookings([
        {
          id: 'bk-preview-101',
          priceSnapshot: 350000,
          status: 'CONFIRMED',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 90000000).toISOString(),
          createdAt: new Date().toISOString(),
          consumer: { id: 'c-1', email: 'seeker.aarav@example.com' },
          provider: {
            id: 'p-1',
            email: 'dr.ananya@sanctuary.test',
            providerProfile: { displayName: 'Dr. Ananya Sharma', slug: 'dr-ananya-sharma' },
          },
          service: {
            id: 's-1',
            title: 'Ayurvedic Pulse Diagnosis & Consultation',
            mode: 'VIDEO',
            durationMin: 60,
          },
          payments: [{ id: 'pay-1', status: 'CAPTURED', amount: 350000, gateway: 'RAZORPAY' }],
        },
        {
          id: 'bk-preview-102',
          priceSnapshot: 500000,
          status: 'DISPUTED',
          startAt: new Date(Date.now() - 172800000).toISOString(),
          endAt: new Date(Date.now() - 169200000).toISOString(),
          createdAt: new Date(Date.now() - 259200000).toISOString(),
          consumer: { id: 'c-2', email: 'priya.deshmukh@example.com' },
          provider: {
            id: 'p-2',
            email: 'acharya.vikram@sanctuary.test',
            providerProfile: { displayName: 'Acharya Vikramaditya', slug: 'acharya-vikramaditya' },
          },
          service: {
            id: 's-2',
            title: 'Pranic Chakra Alignment & Breathwork',
            mode: 'VIDEO',
            durationMin: 75,
          },
          payments: [{ id: 'pay-2', status: 'CAPTURED', amount: 500000, gateway: 'STRIPE' }],
          dispute: { id: 'disp-1', status: 'OPEN' },
        },
      ]);
      setTotal(2);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, fromDate, toDate]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // CSV Export
  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      params.append('exportCsv', 'true');
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter) params.append('status', statusFilter);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const token =
        getAccessToken() ||
        (typeof window !== 'undefined' ? localStorage.getItem('nirvana_access_token') : null);
      const res = await fetch(`${baseUrl}/admin/bookings?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookings-export-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Unable to export CSV at this time. Please check your admin permissions.');
    }
  };

  // Open Timeline
  const handleOpenTimeline = async (booking: BookingItem) => {
    setSelectedBookingForTimeline(booking);
    setIsLoadingTimeline(true);
    try {
      const data = await apiFetch<{
        booking: Record<string, unknown>;
        timeline: AdminBookingTimelineEvent[];
      }>(`/admin/bookings/${booking.id}/timeline`);
      setTimelineEvents(data.timeline || []);
    } catch {
      // Mock timeline for offline preview
      setTimelineEvents([
        {
          step: 'BOOKING_INITIATED',
          timestamp: booking.createdAt,
          description: `Reserved slot for ${booking.service.title}. Price: ₹${(booking.priceSnapshot / 100).toFixed(2)}`,
          actor: booking.consumer.email,
        },
        {
          step: 'PAYMENT_CAPTURED',
          timestamp: booking.createdAt,
          description: `Escrow payment authorized via ${booking.payments[0]?.gateway || 'RAZORPAY'}.`,
        },
        {
          step: 'BOOKING_CONFIRMED',
          timestamp: booking.createdAt,
          description: 'Session confirmed and scheduled on calendar.',
        },
      ]);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  // Submit Cancel & Refund
  const handleCancelAndRefund = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim() || cancelReason.trim().length < 5) {
      setCancelError('Audit compliance requires a reason of at least 5 characters.');
      return;
    }

    try {
      setIsSubmittingCancel(true);
      setCancelError(null);

      const refundPaise = refundAmountInr
        ? Math.round(parseFloat(refundAmountInr) * 100)
        : cancelTarget.priceSnapshot;

      await apiFetch(`/admin/bookings/${cancelTarget.id}/cancel-refund`, {
        method: 'POST',
        body: JSON.stringify({
          reason: cancelReason.trim(),
          refundAmountPaise: refundPaise,
          penalizeProvider,
        }),
      });

      setCancelTarget(null);
      setCancelReason('');
      setRefundAmountInr('');
      setPenalizeProvider(false);
      fetchBookings();
    } catch (err: unknown) {
      setCancelError((err as Error)?.message || 'Failed to cancel and refund booking.');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Submit Force Complete
  const handleForceComplete = async () => {
    if (!completeTarget) return;
    if (!completeReason.trim() || completeReason.trim().length < 5) {
      setCompleteError('Audit compliance requires a reason of at least 5 characters.');
      return;
    }

    try {
      setIsSubmittingComplete(true);
      setCompleteError(null);

      await apiFetch(`/admin/bookings/${completeTarget.id}/force-complete`, {
        method: 'POST',
        body: JSON.stringify({
          reason: completeReason.trim(),
          releaseEscrow,
        }),
      });

      setCompleteTarget(null);
      setCompleteReason('');
      fetchBookings();
    } catch (err: unknown) {
      setCompleteError((err as Error)?.message || 'Failed to force complete booking.');
    } finally {
      setIsSubmittingComplete(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Confirmed
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Completed
          </Badge>
        );
      case 'DISPUTED':
        return (
          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30">Disputed</Badge>
        );
      case 'CANCELLED_BY_CONSUMER':
      case 'CANCELLED_BY_PROVIDER':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Cancelled
          </Badge>
        );
      case 'REFUNDED':
        return (
          <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">
            Refunded
          </Badge>
        );
      default:
        return <Badge className="bg-stone-800 text-stone-300">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-light text-stone-100 tracking-tight">
            Bookings Operations
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Audit-logged lifecycle oversight, timeline analysis, manual refunds, and force
            completion.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchBookings}
            className="border-stone-800 text-stone-300 hover:bg-stone-900"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={handleExportCsv}
            className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
        <CardContent className="p-4 space-y-4 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-stone-500" />
            <Input
              placeholder="Search by ID, seeker email, practitioner, or service..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-stone-950/60 border-stone-800 text-stone-200 placeholder:text-stone-500 focus:border-amber-500/60"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-stone-500" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-stone-950/60 border border-stone-800 rounded-md px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-stone-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="bg-stone-950/60 border-stone-800 text-stone-200 text-xs w-36"
              title="From date"
            />
            <span className="text-stone-600 text-xs">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="bg-stone-950/60 border-stone-800 text-stone-200 text-xs w-36"
              title="To date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bookings Table */}
      <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-stone-300">
            <thead className="bg-stone-950/80 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
              <tr>
                <th className="py-3 px-4 font-medium">Booking ID</th>
                <th className="py-3 px-4 font-medium">Seeker / Consumer</th>
                <th className="py-3 px-4 font-medium">Practitioner</th>
                <th className="py-3 px-4 font-medium">Service & Slot</th>
                <th className="py-3 px-4 font-medium">Price (INR)</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Loading bookings ledger...
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500">
                    No bookings found matching current query filters.
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-stone-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-amber-400/90">
                      {booking.id.slice(0, 12)}...
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-stone-200">{booking.consumer.email}</div>
                      <div className="text-xs text-stone-500 font-mono">
                        ID: {booking.consumer.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-stone-200">
                        {booking.provider.providerProfile?.displayName || 'Practitioner'}
                      </div>
                      <div className="text-xs text-stone-500">{booking.provider.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div
                        className="text-stone-200 truncate max-w-[200px]"
                        title={booking.service.title}
                      >
                        {booking.service.title}
                      </div>
                      <div className="text-xs text-stone-500 flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 text-stone-400" />
                        {new Date(booking.startAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-stone-200">
                      ₹
                      {(booking.priceSnapshot / 100).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(booking.status)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenTimeline(booking)}
                          className="h-8 text-stone-300 hover:text-amber-400 hover:bg-stone-800"
                          title="View Lifecycle Timeline"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Timeline
                        </Button>

                        {booking.status === 'CONFIRMED' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCancelTarget(booking);
                                setRefundAmountInr((booking.priceSnapshot / 100).toFixed(2));
                                setCancelReason('');
                                setCancelError(null);
                              }}
                              className="h-8 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                              title="Cancel & Refund"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCompleteTarget(booking);
                                setCompleteReason('');
                                setCompleteError(null);
                              }}
                              className="h-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                              title="Force Complete"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Complete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
          <div>
            Showing {bookings.length} of {total} total bookings
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2 border-stone-800 text-stone-300 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </Button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2 border-stone-800 text-stone-300 disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </Card>

      {/* TIMELINE MODAL */}
      {selectedBookingForTimeline && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-stone-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-serif text-stone-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-500" />
                  Booking Lifecycle Timeline
                </h3>
                <p className="text-xs text-stone-400 font-mono mt-0.5">
                  ID: {selectedBookingForTimeline.id}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedBookingForTimeline(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {isLoadingTimeline ? (
                <div className="py-12 text-center text-stone-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                  Loading lifecycle history...
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="text-center text-stone-500 py-8">
                  No chronological events recorded yet for this session.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-800">
                  {timelineEvents.map((evt, idx) => (
                    <div key={idx} className="relative group">
                      <div className="absolute -left-[1.85rem] top-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-stone-900 group-hover:scale-125 transition-transform" />
                      <div className="bg-stone-950/70 border border-stone-800/80 rounded-lg p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-amber-400 tracking-wide font-mono">
                            {evt.step}
                          </span>
                          <span className="text-stone-500">
                            {new Date(evt.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-stone-300 mt-1">{evt.description}</p>
                        {evt.actor && (
                          <div className="text-xs text-stone-500 mt-2 flex items-center gap-1 font-mono">
                            <span>Actor:</span>
                            <span className="text-stone-400">{evt.actor}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-stone-800 bg-stone-950/40 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setSelectedBookingForTimeline(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL & REFUND MODAL */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-stone-100">Manual Cancel & Refund</h3>
                  <p className="text-xs text-stone-400 font-mono mt-0.5">
                    Booking: {cancelTarget.id}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCancelTarget(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="text-xs text-stone-400 bg-stone-950/60 p-3 rounded border border-stone-800 space-y-1">
              <div>
                <strong className="text-stone-300">Seeker:</strong> {cancelTarget.consumer.email}
              </div>
              <div>
                <strong className="text-stone-300">Practitioner:</strong>{' '}
                {cancelTarget.provider.providerProfile?.displayName || 'Practitioner'}
              </div>
              <div>
                <strong className="text-stone-300">Captured Amount:</strong> ₹
                {(cancelTarget.priceSnapshot / 100).toFixed(2)}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Refund Amount (INR)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={refundAmountInr}
                  onChange={(e) => setRefundAmountInr(e.target.value)}
                  placeholder={(cancelTarget.priceSnapshot / 100).toFixed(2)}
                  className="bg-stone-950 border-stone-800 text-stone-200"
                />
                <span className="text-[11px] text-stone-500">
                  Defaults to full booking amount (₹{(cancelTarget.priceSnapshot / 100).toFixed(2)}
                  ).
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mandatory Audit Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="State the verified cause for manual cancellation (min 5 characters)..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-md p-2.5 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="penalizeCheck"
                  checked={penalizeProvider}
                  onChange={(e) => setPenalizeProvider(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-0"
                />
                <label htmlFor="penalizeCheck" className="text-xs text-stone-300 cursor-pointer">
                  Apply reliability penalty strike against practitioner for no-show / late fault
                </label>
              </div>

              {cancelError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setCancelTarget(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Dismiss
              </Button>
              <Button
                onClick={handleCancelAndRefund}
                disabled={isSubmittingCancel}
                className="bg-rose-600 hover:bg-rose-500 text-white font-medium"
              >
                {isSubmittingCancel ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing Refund...
                  </>
                ) : (
                  'Confirm Cancel & Refund'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FORCE COMPLETE MODAL */}
      {completeTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-stone-100">Force Complete Booking</h3>
                  <p className="text-xs text-stone-400 font-mono mt-0.5">
                    Booking: {completeTarget.id}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCompleteTarget(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mandatory Audit Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={completeReason}
                  onChange={(e) => setCompleteReason(e.target.value)}
                  placeholder="Explain why this session is being marked complete by admin (min 5 characters)..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-md p-2.5 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="releaseEscrowCheck"
                  checked={releaseEscrow}
                  onChange={(e) => setReleaseEscrow(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-emerald-500 focus:ring-0"
                />
                <label
                  htmlFor="releaseEscrowCheck"
                  className="text-xs text-stone-300 cursor-pointer"
                >
                  Release platform escrow to practitioner payout balance
                </label>
              </div>

              {completeError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{completeError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setCompleteTarget(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Dismiss
              </Button>
              <Button
                onClick={handleForceComplete}
                disabled={isSubmittingComplete}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                {isSubmittingComplete ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Completing...
                  </>
                ) : (
                  'Authorize Force Completion'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
