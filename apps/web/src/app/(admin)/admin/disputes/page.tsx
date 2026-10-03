'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Filter,
  Download,
  AlertTriangle,
  Lock,
  Unlock,
  MessageSquare,
  FileText,
  User,
  RefreshCw,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Video,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch, getAccessToken } from '@/lib/api-client';

interface DisputeItem {
  id: string;
  bookingId: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED_REFUND' | 'RESOLVED_RELEASE' | 'DISMISSED';
  reason: string;
  createdAt: string;
  updatedAt: string;
  raisedBy: { id: string; email: string; role: string };
  booking: {
    id: string;
    priceSnapshot: number;
    consumer: { id: string; email: string; phone?: string | null };
    provider: {
      id: string;
      email: string;
      providerProfile?: {
        displayName: string;
        slug: string;
        ratingAvg?: number;
        ratingCount?: number;
        reliabilityStrikes?: number;
      } | null;
    };
    service: { id: string; title: string; durationMin: number; mode: string };
    payments: Array<{ id: string; status: string; amount: number; gateway: string }>;
    session?: { id: string; videoRoomName?: string; startedAt?: string; endedAt?: string } | null;
  };
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderRole: string;
  senderEmail?: string;
  text: string;
  createdAt: string;
  attachmentUrl?: string;
  attachmentType?: string;
  isFlagged?: boolean;
}

const DISPUTE_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'RESOLVED_REFUND', label: 'Resolved (Refund)' },
  { value: 'RESOLVED_RELEASE', label: 'Resolved (Released)' },
  { value: 'DISMISSED', label: 'Dismissed' },
];

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Evidence modal state
  const [evidenceTarget, setEvidenceTarget] = useState<DisputeItem | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  // Chat Log Access state
  const [isAccessingChat, setIsAccessingChat] = useState(false);
  const [chatReasonPrompt, setChatReasonPrompt] = useState(false);
  const [chatAccessReason, setChatAccessReason] = useState('');
  const [chatAccessError, setChatAccessError] = useState<string | null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<ChatMessage[] | null>(null);
  const [chatNotice, setChatNotice] = useState<string | null>(null);

  // Resolution modal state
  const [resolveTarget, setResolveTarget] = useState<DisputeItem | null>(null);
  const [resolutionAction, setResolutionAction] = useState<
    'REFUND_FULL' | 'REFUND_PARTIAL' | 'PENALIZE_PROVIDER' | 'DISMISS' | 'RELEASE_ESCROW'
  >('REFUND_FULL');
  const [refundAmountInr, setRefundAmountInr] = useState('');
  const [strikePenalty, setStrikePenalty] = useState(false);
  const [resolutionReason, setResolutionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const fetchDisputes = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '15');
      if (statusFilter) params.append('status', statusFilter);

      const data = await apiFetch<{
        disputes: DisputeItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/admin/disputes?${params.toString()}`);

      setDisputes(data.disputes || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      // Mock disputes for offline/preview
      setDisputes([
        {
          id: 'disp-alpha-1',
          bookingId: 'bk-preview-102',
          status: 'OPEN',
          reason:
            'Practitioner did not attend the scheduled consultation. Waited 20 minutes in video room.',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
          raisedBy: { id: 'c-2', email: 'priya.deshmukh@example.com', role: 'CONSUMER' },
          booking: {
            id: 'bk-preview-102',
            priceSnapshot: 500000,
            consumer: { id: 'c-2', email: 'priya.deshmukh@example.com', phone: '+919876500001' },
            provider: {
              id: 'p-2',
              email: 'acharya.vikram@sanctuary.test',
              providerProfile: {
                displayName: 'Acharya Vikramaditya',
                slug: 'acharya-vikramaditya',
                ratingAvg: 4.8,
                ratingCount: 19,
                reliabilityStrikes: 0,
              },
            },
            service: {
              id: 's-2',
              title: 'Pranic Chakra Alignment & Breathwork',
              durationMin: 75,
              mode: 'VIDEO',
            },
            payments: [{ id: 'pay-2', status: 'CAPTURED', amount: 500000, gateway: 'STRIPE' }],
            session: {
              id: 'ses-2',
              videoRoomName: 'sanctuary-chakra-bk-preview-102',
              startedAt: undefined,
              endedAt: undefined,
            },
          },
        },
      ]);
      setTotal(1);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      params.append('exportCsv', 'true');
      if (statusFilter) params.append('status', statusFilter);

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const token =
        getAccessToken() ||
        (typeof window !== 'undefined' ? localStorage.getItem('nirvana_access_token') : null);
      const res = await fetch(`${baseUrl}/admin/disputes?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `disputes-export-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Unable to export CSV at this time.');
    }
  };

  // Inspect Dual-Party Evidence
  const handleOpenEvidence = async (dispute: DisputeItem) => {
    setEvidenceTarget(dispute);
    setDecryptedMessages(null);
    setChatNotice(null);
    setChatReasonPrompt(false);
    setChatAccessReason('');
    setIsLoadingEvidence(true);

    try {
      const data = await apiFetch<DisputeItem>(`/admin/disputes/${dispute.id}/evidence`);
      setEvidenceTarget(data);
    } catch {
      // Keep dispute item as fallback
    } finally {
      setIsLoadingEvidence(false);
    }
  };

  // Chat Log Access Submission
  const handleUnlockChatLogs = async () => {
    if (!evidenceTarget) return;
    if (!chatAccessReason.trim() || chatAccessReason.trim().length < 10) {
      setChatAccessError(
        'Audit compliance requires a specific justification of at least 10 characters.',
      );
      return;
    }

    try {
      setIsAccessingChat(true);
      setChatAccessError(null);

      const res = await apiFetch<{
        messages: ChatMessage[];
        notice?: string;
      }>(`/admin/disputes/${evidenceTarget.id}/chat-logs`, {
        method: 'POST',
        body: JSON.stringify({ reason: chatAccessReason.trim() }),
      });

      setDecryptedMessages(res.messages || []);
      setChatNotice(res.notice || null);
      setChatReasonPrompt(false);
    } catch (err: unknown) {
      setChatAccessError((err as Error)?.message || 'Access denied or failed to decrypt messages.');
    } finally {
      setIsAccessingChat(false);
    }
  };

  // Open Resolution Dialog
  const handleOpenResolution = (dispute: DisputeItem) => {
    setResolveTarget(dispute);
    setResolutionAction('REFUND_FULL');
    setRefundAmountInr((dispute.booking.priceSnapshot / 100).toFixed(2));
    setStrikePenalty(false);
    setResolutionReason('');
    setAdminNotes('');
    setResolutionError(null);
  };

  // Submit Dispute Resolution
  const handleSubmitResolution = async () => {
    if (!resolveTarget) return;
    if (!resolutionReason.trim() || resolutionReason.trim().length < 10) {
      setResolutionError(
        'Resolution rationale must be at least 10 characters for audit compliance.',
      );
      return;
    }

    try {
      setIsSubmittingResolution(true);
      setResolutionError(null);

      const refundPaise =
        resolutionAction === 'REFUND_FULL' || resolutionAction === 'REFUND_PARTIAL'
          ? refundAmountInr
            ? Math.round(parseFloat(refundAmountInr) * 100)
            : resolveTarget.booking.priceSnapshot
          : undefined;

      await apiFetch(`/admin/disputes/${resolveTarget.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          action: resolutionAction,
          refundAmountPaise: refundPaise,
          strikePenalty,
          reason: resolutionReason.trim(),
          adminNotes: adminNotes.trim() || undefined,
        }),
      });

      setResolveTarget(null);
      if (evidenceTarget?.id === resolveTarget.id) {
        setEvidenceTarget(null);
      }
      fetchDisputes();
    } catch (err: unknown) {
      setResolutionError((err as Error)?.message || 'Failed to submit dispute resolution.');
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  const getStatusBadge = (status: DisputeItem['status']) => {
    switch (status) {
      case 'OPEN':
        return (
          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30">Open</Badge>
        );
      case 'UNDER_REVIEW':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Under Review
          </Badge>
        );
      case 'RESOLVED_REFUND':
        return (
          <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">
            Refunded
          </Badge>
        );
      case 'RESOLVED_RELEASE':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Escrow Released
          </Badge>
        );
      case 'DISMISSED':
        return (
          <Badge className="bg-stone-800 text-stone-400 border border-stone-700">Dismissed</Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-light text-stone-100 tracking-tight">
            Disputes & Trust Arbitration
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Dual-party evidence arbitration, audit-gated chat review, and financial dispute
            resolution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchDisputes}
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
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-stone-500" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-stone-950/60 border border-stone-800 rounded-md px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
            >
              {DISPUTE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-stone-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-stone-400">
            Total Disputes: <strong className="text-stone-200">{total}</strong>
          </div>
        </CardContent>
      </Card>

      {/* Disputes Table */}
      <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-stone-300">
            <thead className="bg-stone-950/80 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
              <tr>
                <th className="py-3 px-4 font-medium">Dispute ID</th>
                <th className="py-3 px-4 font-medium">Raised By</th>
                <th className="py-3 px-4 font-medium">Booking & Service</th>
                <th className="py-3 px-4 font-medium">Practitioner</th>
                <th className="py-3 px-4 font-medium">Amount (INR)</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Loading disputes queue...
                  </td>
                </tr>
              ) : disputes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500">
                    No disputes found matching current status filter.
                  </td>
                </tr>
              ) : (
                disputes.map((d) => (
                  <tr key={d.id} className="hover:bg-stone-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-amber-400/90">
                      {d.id.slice(0, 12)}...
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-stone-200">{d.raisedBy.email}</div>
                      <div className="text-xs text-stone-500">{d.raisedBy.role}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div
                        className="text-stone-200 font-medium truncate max-w-[200px]"
                        title={d.booking.service.title}
                      >
                        {d.booking.service.title}
                      </div>
                      <div className="text-xs text-stone-500 font-mono">
                        Booking: {d.booking.id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-stone-200 font-medium">
                        {d.booking.provider.providerProfile?.displayName || 'Practitioner'}
                      </div>
                      <div className="text-xs text-stone-500">{d.booking.provider.email}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-stone-200">
                      ₹
                      {(d.booking.priceSnapshot / 100).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(d.status)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEvidence(d)}
                          className="h-8 text-stone-300 hover:text-amber-400 hover:bg-stone-800"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Evidence
                        </Button>
                        {(d.status === 'OPEN' || d.status === 'UNDER_REVIEW') && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenResolution(d)}
                            className="h-8 bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
          <div>
            Showing {disputes.length} of {total} disputes
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

      {/* DUAL-PARTY EVIDENCE MODAL */}
      {evidenceTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-stone-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-serif text-stone-100 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  Dual-Party Dispute Evidence & Logs
                </h3>
                <p className="text-xs text-stone-400 font-mono mt-0.5">
                  Dispute: {evidenceTarget.id} &bull; Booking: {evidenceTarget.booking.id}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEvidenceTarget(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {isLoadingEvidence ? (
                <div className="py-12 text-center text-stone-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                  Loading dual-party evidence dossier...
                </div>
              ) : null}
              {/* Grievance Statement */}
              <div className="bg-stone-950/80 border border-rose-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-rose-400">
                    Seeker&apos;s Grievance Claim
                  </span>
                  <span className="text-xs text-stone-500">
                    Logged: {new Date(evidenceTarget.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-stone-200 leading-relaxed italic">
                  &ldquo;{evidenceTarget.reason}&rdquo;
                </p>
              </div>

              {/* Grid: Seeker vs Practitioner Profiles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Seeker Info */}
                <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-4 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-stone-400 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-stone-400" />
                    Seeker Details
                  </div>
                  <div className="text-sm font-medium text-stone-200">
                    {evidenceTarget.booking.consumer.email}
                  </div>
                  <div className="text-xs text-stone-500 font-mono">
                    ID: {evidenceTarget.booking.consumer.id}
                  </div>
                  {evidenceTarget.booking.consumer.phone && (
                    <div className="text-xs text-stone-400">
                      Phone: {evidenceTarget.booking.consumer.phone}
                    </div>
                  )}
                </div>

                {/* Practitioner Info */}
                <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-4 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-stone-400 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-amber-500" />
                    Practitioner Profile
                  </div>
                  <div className="text-sm font-medium text-stone-200">
                    {evidenceTarget.booking.provider.providerProfile?.displayName || 'Practitioner'}
                  </div>
                  <div className="text-xs text-stone-500">
                    {evidenceTarget.booking.provider.email}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-stone-400 pt-1">
                    <span>
                      Rating: ★{' '}
                      {evidenceTarget.booking.provider.providerProfile?.ratingAvg?.toFixed(1) ||
                        'N/A'}{' '}
                      ({evidenceTarget.booking.provider.providerProfile?.ratingCount || 0})
                    </span>
                    <span>
                      Strikes:{' '}
                      <strong className="text-rose-400">
                        {evidenceTarget.booking.provider.providerProfile?.reliabilityStrikes || 0}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Telehealth Room Telemetry */}
              <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-stone-400 font-medium flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-blue-400" />
                  Telehealth Session Telemetry
                </div>
                {evidenceTarget.booking.session ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-stone-500 block">Room Name:</span>
                      <span className="text-stone-200 font-mono">
                        {evidenceTarget.booking.session.videoRoomName || 'Room Provisioned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Session Started:</span>
                      <span className="text-stone-200">
                        {evidenceTarget.booking.session.startedAt
                          ? new Date(evidenceTarget.booking.session.startedAt).toLocaleString()
                          : 'Not Initiated'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Session Concluded:</span>
                      <span className="text-stone-200">
                        {evidenceTarget.booking.session.endedAt
                          ? new Date(evidenceTarget.booking.session.endedAt).toLocaleString()
                          : 'Not Concluded'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-stone-500 italic">
                    No Daily video session record found for this booking ID.
                  </div>
                )}
              </div>

              {/* Chat Log Access Section (Audit-Logged) */}
              <div className="border border-stone-800 rounded-lg p-4 bg-stone-950/90 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-stone-200 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-amber-500" />
                      Confidential Consultation Chat Logs
                    </h4>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Protected by end-to-end audit compliance. Decryption requires a logged
                      justification reason.
                    </p>
                  </div>

                  {!decryptedMessages && !chatReasonPrompt && (
                    <Button
                      size="sm"
                      onClick={() => setChatReasonPrompt(true)}
                      className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium text-xs"
                    >
                      <Lock className="w-3.5 h-3.5 mr-1" />
                      Request Chat Access
                    </Button>
                  )}
                </div>

                {chatReasonPrompt && (
                  <div className="bg-stone-900 border border-amber-500/40 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4" />
                      Audit Access Request
                    </div>
                    <p className="text-xs text-stone-300">
                      Your identity, IP address, timestamp, and justification will be recorded in
                      the immutable platform audit ledger before message decryption.
                    </p>
                    <textarea
                      rows={2}
                      value={chatAccessReason}
                      onChange={(e) => setChatAccessReason(e.target.value)}
                      placeholder="State formal justification for accessing seeker/provider messages (min 10 characters)..."
                      className="w-full bg-stone-950 border border-stone-800 rounded p-2 text-xs text-stone-200 focus:outline-none focus:border-amber-500/60"
                    />

                    {chatAccessError && (
                      <div className="text-xs text-rose-400">{chatAccessError}</div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setChatReasonPrompt(false);
                          setChatAccessReason('');
                        }}
                        className="text-stone-400 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleUnlockChatLogs}
                        disabled={isAccessingChat}
                        className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium text-xs"
                      >
                        {isAccessingChat ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            Decrypting...
                          </>
                        ) : (
                          'Authorize & View Decrypted Transcript'
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Display Decrypted Messages */}
                {decryptedMessages && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Decrypted transcript unlocked and audit recorded.</span>
                    </div>

                    {chatNotice && (
                      <div className="text-xs text-stone-400 italic bg-stone-900 p-2 rounded">
                        {chatNotice}
                      </div>
                    )}

                    <div className="max-h-60 overflow-y-auto space-y-2 border border-stone-800/80 rounded p-3 bg-stone-900/60">
                      {decryptedMessages.length === 0 ? (
                        <div className="text-xs text-stone-500 text-center py-4">
                          No messages sent in this conversation thread.
                        </div>
                      ) : (
                        decryptedMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`p-2.5 rounded-lg text-xs max-w-[80%] ${
                              msg.senderRole === 'CONSUMER'
                                ? 'bg-stone-800/70 ml-auto border border-stone-700/60'
                                : 'bg-stone-950 border border-stone-800'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1">
                              <span className="font-semibold text-amber-400/90 font-mono">
                                {msg.senderRole}
                              </span>
                              <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-stone-200">{msg.text}</p>
                            {msg.isFlagged && (
                              <span className="inline-block mt-1 text-[10px] text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800">
                                Anti-Leakage Flagged
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-stone-800 bg-stone-950/40 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setEvidenceTarget(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Close
              </Button>
              {(evidenceTarget.status === 'OPEN' || evidenceTarget.status === 'UNDER_REVIEW') && (
                <Button
                  onClick={() => handleOpenResolution(evidenceTarget)}
                  className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
                >
                  Proceed to Resolution
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RESOLUTION MODAL */}
      {resolveTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-serif text-stone-100">Resolve Dispute Claim</h3>
                <p className="text-xs text-stone-400 font-mono mt-0.5">
                  Dispute: {resolveTarget.id}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResolveTarget(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Select Action */}
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1.5">
                  Resolution Action
                </label>
                <select
                  value={resolutionAction}
                  onChange={(e) =>
                    setResolutionAction(
                      e.target.value as
                        | 'REFUND_FULL'
                        | 'REFUND_PARTIAL'
                        | 'PENALIZE_PROVIDER'
                        | 'DISMISS'
                        | 'RELEASE_ESCROW',
                    )
                  }
                  className="w-full bg-stone-950 border border-stone-800 rounded-md p-2.5 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="REFUND_FULL">
                    Full Refund to Seeker (₹{(resolveTarget.booking.priceSnapshot / 100).toFixed(2)}
                    )
                  </option>
                  <option value="REFUND_PARTIAL">Partial Refund to Seeker</option>
                  <option value="RELEASE_ESCROW">Release Escrow to Practitioner (No Fault)</option>
                  <option value="PENALIZE_PROVIDER">Penalize Practitioner & Refund Seeker</option>
                  <option value="DISMISS">Dismiss Claim (Uphold Booking)</option>
                </select>
              </div>

              {/* Partial Refund Amount */}
              {resolutionAction === 'REFUND_PARTIAL' && (
                <div>
                  <label className="block text-xs font-medium text-stone-300 mb-1">
                    Refund Amount (INR)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={refundAmountInr}
                    onChange={(e) => setRefundAmountInr(e.target.value)}
                    placeholder="Enter partial refund amount..."
                    className="bg-stone-950 border-stone-800 text-stone-200"
                  />
                </div>
              )}

              {/* Penalty Strike Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="strikeCheck"
                  checked={strikePenalty || resolutionAction === 'PENALIZE_PROVIDER'}
                  onChange={(e) => setStrikePenalty(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-rose-500 focus:ring-0"
                />
                <label htmlFor="strikeCheck" className="text-xs text-stone-300 cursor-pointer">
                  Impose a Reliability Strike on practitioner&apos;s record (affects ranking and
                  badges)
                </label>
              </div>

              {/* Mandatory Reason */}
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mandatory Audit Rationale <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  placeholder="Detail the conclusive justification for this dispute determination (min 10 characters)..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-md p-2.5 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              {/* Internal Notes */}
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Internal Trust & Safety Notes (Optional)
                </label>
                <Input
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Confidential case file notes for admin reference..."
                  className="bg-stone-950 border-stone-800 text-stone-200"
                />
              </div>

              {resolutionError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{resolutionError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button
                variant="outline"
                onClick={() => setResolveTarget(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitResolution}
                disabled={isSubmittingResolution}
                className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
              >
                {isSubmittingResolution ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Executing Determination...
                  </>
                ) : (
                  'Confirm & Enforce Resolution'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
