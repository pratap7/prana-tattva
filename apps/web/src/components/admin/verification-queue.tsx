'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Search,
  RefreshCw,
  FileText,
  Video,
  CreditCard,
  ChevronRight,
  Eye,
  Send,
  MessageSquare,
  Award,
  Sparkles,
  Loader2,
  X,
  User,
  Mail,
  Check,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiError } from '@/lib/api-client';

interface ApplicationItem {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    phone?: string | null;
    createdAt: string;
  };
  displayName: string;
  slug: string;
  headline: string;
  bio: string;
  avatarUrl?: string | null;
  introVideoUrl?: string | null;
  yearsExperience: number;
  city: string;
  country: string;
  approvalStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  verificationTier: string;
  rejectionReason?: string | null;
  payoutAccountId?: string | null;
  kycStatus?: string | null;
  categories: {
    id: string;
    name: string;
    slug: string;
    isPrimary: boolean;
    requiresLicense: boolean;
  }[];
  credentialsCount: number;
  verifiedCredentialsCount: number;
  servicesCount: number;
  updatedAt: string;
  createdAt: string;
}

interface CredentialDossierItem {
  id: string;
  providerId: string;
  type: string;
  title: string;
  issuer: string;
  documentUrl: string;
  downloadUrl: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  notes?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface FullDossier {
  profile: ApplicationItem;
  categories: {
    id: string;
    name: string;
    requiresLicense: boolean;
    isPrimary: boolean;
  }[];
  credentials: CredentialDossierItem[];
  services: {
    id: string;
    title: string;
    description: string;
    durationMin: number;
    priceAmount: number;
    currency: string;
    mode: string;
    categoryName: string;
  }[];
}

export function VerificationQueue() {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'DRAFT' | 'APPROVED' | 'REJECTED'>(
    'PENDING',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Selected dossier for deep inspection
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<FullDossier | null>(null);
  const [isLoadingDossier, setIsLoadingDossier] = useState(false);

  // Action Modals State
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approveTier, setApproveTier] = useState<string>('CREDENTIAL_VERIFIED');
  const [approveNotes, setApproveNotes] = useState('');
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  const [isRequestInfoModalOpen, setIsRequestInfoModalOpen] = useState(false);
  const [requestInfoMessage, setRequestInfoMessage] = useState('');
  const [isSubmittingRequestInfo, setIsSubmittingRequestInfo] = useState(false);

  const [reviewingCredId, setReviewingCredId] = useState<string | null>(null);

  const fetchQueue = useCallback(async (status: string, showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await apiFetch<ApplicationItem[]>(`/admin/verification/queue?status=${status}`);
      setApplications(data || []);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load verification applications');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue(activeTab);
  }, [activeTab, fetchQueue]);

  const openDossier = async (appId: string) => {
    setSelectedAppId(appId);
    setIsLoadingDossier(true);
    setDossier(null);
    try {
      const data = await apiFetch<FullDossier>(`/admin/verification/queue/${appId}`);
      setDossier(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load practitioner dossier');
      }
    } finally {
      setIsLoadingDossier(false);
    }
  };

  const closeDossier = () => {
    setSelectedAppId(null);
    setDossier(null);
  };

  // Review individual credential
  const handleReviewCredential = async (
    credId: string,
    status: 'VERIFIED' | 'REJECTED',
    notes?: string,
  ) => {
    if (!selectedAppId) return;
    setReviewingCredId(credId);
    try {
      await apiFetch(`/admin/verification/${selectedAppId}/credential/${credId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, notes }),
      });

      // Update in local state
      if (dossier) {
        setDossier({
          ...dossier,
          credentials: dossier.credentials.map((c) =>
            c.id === credId ? { ...c, status, notes: notes || null } : c,
          ),
        });
      }
      setActionSuccess(`Credential marked as ${status}`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to review credential document');
      }
    } finally {
      setReviewingCredId(null);
    }
  };

  // Handle Approve
  const handleApprove = async () => {
    if (!selectedAppId) return;
    setIsSubmittingApprove(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/admin/verification/${selectedAppId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          verificationTier: approveTier,
          adminNotes: approveNotes || undefined,
        }),
      });

      setActionSuccess(
        'Practitioner application successfully APPROVED and published to sanctuary!',
      );
      setIsApproveModalOpen(false);
      closeDossier();
      fetchQueue(activeTab);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Approval action failed');
      }
    } finally {
      setIsSubmittingApprove(false);
    }
  };

  // Handle Reject
  const handleReject = async () => {
    if (!selectedAppId || !rejectReason.trim()) return;
    setIsSubmittingReject(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/admin/verification/${selectedAppId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });

      setActionSuccess('Application rejected with audit trail feedback.');
      setIsRejectModalOpen(false);
      setRejectReason('');
      closeDossier();
      fetchQueue(activeTab);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Rejection action failed');
      }
    } finally {
      setIsSubmittingReject(false);
    }
  };

  // Handle Request More Info
  const handleRequestInfo = async () => {
    if (!selectedAppId || !requestInfoMessage.trim()) return;
    setIsSubmittingRequestInfo(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/admin/verification/${selectedAppId}/request-info`, {
        method: 'POST',
        body: JSON.stringify({ message: requestInfoMessage }),
      });

      setActionSuccess(
        'Information request sent. Profile returned to DRAFT for practitioner revision.',
      );
      setIsRequestInfoModalOpen(false);
      setRequestInfoMessage('');
      closeDossier();
      fetchQueue(activeTab);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Request more info failed');
      }
    } finally {
      setIsSubmittingRequestInfo(false);
    }
  };

  const filteredApps = applications.filter((app) => {
    const q = searchQuery.toLowerCase();
    return (
      app.displayName.toLowerCase().includes(q) ||
      app.user.email.toLowerCase().includes(q) ||
      app.categories.some((c) => c.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="font-semibold">
              Admin Ops
            </Badge>
            <span className="text-xs text-muted-foreground">Sanctuary Vetting Board</span>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground mt-1">
            Practitioner Verification Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit applicant identity credentials, verify professional modality licences, and approve
            healers before public profile indexing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchQueue(activeTab, true)}
            disabled={isRefreshing || isLoading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Queue
          </Button>
          <Button variant="default" size="sm" asChild className="gap-2 text-xs">
            <Link href="/admin/dashboard">
              Ops Dashboard <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Global Alerts */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-3 text-sm animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3 text-sm animate-in fade-in">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setErrorMessage(null)}
            className="ml-auto h-7 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Tab Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/60">
          {(
            [
              { key: 'PENDING', label: 'Pending Review', color: 'text-primary' },
              { key: 'DRAFT', label: 'In Revision (Draft)', color: 'text-muted-foreground' },
              { key: 'APPROVED', label: 'Sanctuary Healers', color: 'text-emerald-600' },
              { key: 'REJECTED', label: 'Rejected', color: 'text-destructive' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, modality..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Table / List */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading sanctuary verification queue...</p>
        </div>
      ) : filteredApps.length === 0 ? (
        <Card className="py-16 text-center border-dashed bg-muted/10">
          <div className="max-w-md mx-auto space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="font-serif text-lg font-semibold">No Applications in this Queue</h3>
            <p className="text-xs text-muted-foreground">
              {searchQuery
                ? 'No practitioners match your current search query.'
                : `There are currently no healer profiles marked with status ${activeTab}.`}
            </p>
          </div>
        </Card>
      ) : (
        <div className="border border-border/80 rounded-2xl overflow-hidden shadow-sm bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3.5 px-6">Practitioner</th>
                  <th className="py-3.5 px-6">Modalities</th>
                  <th className="py-3.5 px-6">Credentials</th>
                  <th className="py-3.5 px-6">Escrow Payout</th>
                  <th className="py-3.5 px-6">Status / Tier</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-sm">
                {filteredApps.map((app) => (
                  <tr
                    key={app.id}
                    className="hover:bg-muted/10 transition-colors group cursor-pointer"
                    onClick={() => openDossier(app.id)}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center text-primary font-serif font-bold shrink-0">
                          {app.avatarUrl ? (
                            <img
                              src={app.avatarUrl}
                              alt={app.displayName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            app.displayName.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                            <span>{app.displayName}</span>
                            {app.city && (
                              <span className="text-[11px] font-normal text-muted-foreground">
                                &bull; {app.city}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Mail className="h-3 w-3" />
                            <span>{app.user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {app.categories.map((c) => (
                          <Badge
                            key={c.id}
                            variant={c.requiresLicense ? 'destructive' : 'secondary'}
                            className="text-[10px] px-2 py-0"
                          >
                            {c.name}
                            {c.requiresLicense && ' (License Req)'}
                          </Badge>
                        ))}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-foreground flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span>
                            {app.verifiedCredentialsCount} of {app.credentialsCount} Verified
                          </span>
                        </div>
                        {app.credentialsCount === 0 ? (
                          <span className="text-[11px] text-destructive block">
                            No credentials uploaded
                          </span>
                        ) : app.verifiedCredentialsCount === app.credentialsCount ? (
                          <span className="text-[11px] text-emerald-600 block flex items-center gap-1">
                            <Check className="h-3 w-3" /> All documents verified
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-600 block">
                            Documents need audit
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        <Badge
                          variant={app.payoutAccountId ? 'success' : 'outline'}
                          className="text-[10px]"
                        >
                          {app.payoutAccountId ? 'Razorpay Linked' : 'Not Configured'}
                        </Badge>
                        {app.kycStatus && (
                          <div className="text-[11px] text-muted-foreground">
                            KYC: {app.kycStatus}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        <Badge
                          variant={
                            app.approvalStatus === 'APPROVED'
                              ? 'success'
                              : app.approvalStatus === 'PENDING'
                                ? 'default'
                                : app.approvalStatus === 'REJECTED'
                                  ? 'destructive'
                                  : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {app.approvalStatus}
                        </Badge>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {app.verificationTier}
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDossier(app.id);
                        }}
                        className="text-xs rounded-xl gap-1.5 shadow-sm"
                      >
                        <Eye className="h-3.5 w-3.5 text-primary" />
                        Inspect Dossier
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Complete Verification Dossier Drawer / Dialog */}
      {selectedAppId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-3xl h-full bg-card shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif font-bold text-lg">
                  {dossier?.profile?.displayName?.charAt(0) || 'P'}
                </div>
                <div>
                  <h2 className="font-serif text-xl font-semibold text-foreground">
                    {dossier?.profile?.displayName || 'Practitioner Dossier'}
                  </h2>
                  <p className="text-xs text-muted-foreground">Application ID: {selectedAppId}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {dossier?.profile?.approvalStatus === 'APPROVED' && (
                  <Button size="sm" variant="outline" asChild className="gap-1.5 text-xs">
                    <Link
                      href={`/providers/${dossier.profile.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Live Profile
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeDossier}
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {isLoadingDossier ? (
                <div className="py-24 text-center space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Loading complete practitioner dossier...
                  </p>
                </div>
              ) : !dossier ? (
                <div className="text-center py-16 text-muted-foreground">
                  Could not load dossier details.
                </div>
              ) : (
                <>
                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                      dossier.profile.approvalStatus === 'APPROVED'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                        : dossier.profile.approvalStatus === 'PENDING'
                          ? 'bg-primary/10 border-primary/20 text-primary'
                          : dossier.profile.approvalStatus === 'REJECTED'
                            ? 'bg-destructive/10 border-destructive/20 text-destructive'
                            : 'bg-muted/40 border-border text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider">
                          Current Approval State: {dossier.profile.approvalStatus}
                        </div>
                        <div className="text-xs opacity-90 mt-0.5">
                          Verification Tier: <strong>{dossier.profile.verificationTier}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-xs">
                      <span>Submitted / Updated</span>
                      <div className="font-semibold">
                        {new Date(dossier.profile.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Rejection / Note feedback if present */}
                  {dossier.profile.rejectionReason && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs space-y-1">
                      <span className="font-semibold text-destructive uppercase">
                        Previous Rejection Feedback:
                      </span>
                      <p className="text-destructive/90">{dossier.profile.rejectionReason}</p>
                    </div>
                  )}

                  {/* Basic Healer Information */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="h-4 w-4 text-primary" />
                      Identity & Background
                    </h3>
                    <Card className="p-5 space-y-3 border-border/80">
                      <div>
                        <div className="text-xs text-muted-foreground">Headline</div>
                        <div className="text-sm font-medium text-foreground">
                          {dossier.profile.headline}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Email & Phone</span>
                          <span className="font-medium text-foreground">
                            {dossier.profile.user.email} &bull;{' '}
                            {dossier.profile.user.phone || 'No phone'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Location & Experience</span>
                          <span className="font-medium text-foreground">
                            {[dossier.profile.city, dossier.profile.country]
                              .filter(Boolean)
                              .join(', ')}{' '}
                            &bull; {dossier.profile.yearsExperience} yrs exp
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Biography</div>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line bg-muted/20 p-3 rounded-lg border border-border/50">
                          {dossier.profile.bio}
                        </p>
                      </div>

                      {dossier.profile.introVideoUrl && (
                        <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Video className="h-4 w-4 text-primary" />
                            Intro Video URL:
                          </span>
                          <a
                            href={dossier.profile.introVideoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1 font-medium"
                          >
                            Watch Video <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Modalities & Categories */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Modalities & Licensing Rules
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {dossier.categories.map((c) => (
                        <div
                          key={c.id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                            c.requiresLicense
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : 'bg-card border-border/80'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              <span>{c.name}</span>
                              {c.isPrimary && (
                                <Badge variant="default" className="text-[9px] py-0">
                                  Primary
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {c.requiresLicense
                                ? 'Mandatory Board Licence Required'
                                : 'Standard Credentialing'}
                            </div>
                          </div>

                          {c.requiresLicense && (
                            <Badge variant="amber" className="text-[10px]">
                              License Mandatory
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Uploaded Credentials Audit */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-primary" />
                        Uploaded Certificates & Documents ({dossier.credentials.length})
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Presigned private download links
                      </span>
                    </div>

                    {dossier.credentials.length === 0 ? (
                      <Card className="p-6 text-center text-xs text-muted-foreground border-dashed">
                        No credentials or certifications have been uploaded by this applicant.
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {dossier.credentials.map((cred) => (
                          <div
                            key={cred.id}
                            className="p-4 rounded-xl border border-border/80 bg-card space-y-3"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px]">
                                    {cred.type}
                                  </Badge>
                                  <Badge
                                    variant={
                                      cred.status === 'VERIFIED'
                                        ? 'success'
                                        : cred.status === 'REJECTED'
                                          ? 'destructive'
                                          : 'amber'
                                    }
                                    className="text-[10px]"
                                  >
                                    {cred.status}
                                  </Badge>
                                </div>
                                <h4 className="font-semibold text-sm text-foreground">
                                  {cred.title}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Issuer: <strong>{cred.issuer}</strong> &bull; Uploaded:{' '}
                                  {new Date(cred.createdAt).toLocaleDateString()}
                                </p>
                              </div>

                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                className="text-xs rounded-xl gap-1.5 shrink-0"
                              >
                                <a
                                  href={cred.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <FileText className="h-3.5 w-3.5 text-primary" />
                                  Inspect PDF / Doc
                                </a>
                              </Button>
                            </div>

                            {/* Credential Action Review Buttons */}
                            <div className="pt-2 border-t border-border/40 flex items-center justify-end gap-2">
                              {cred.status !== 'VERIFIED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={reviewingCredId === cred.id}
                                  onClick={() => handleReviewCredential(cred.id, 'VERIFIED')}
                                  className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 gap-1"
                                >
                                  <Check className="h-3 w-3" />
                                  Verify Document
                                </Button>
                              )}

                              {cred.status !== 'REJECTED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={reviewingCredId === cred.id}
                                  onClick={() =>
                                    handleReviewCredential(
                                      cred.id,
                                      'REJECTED',
                                      'Document does not meet authenticity criteria or resolution is unreadable.',
                                    )
                                  }
                                  className="h-7 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 gap-1"
                                >
                                  <X className="h-3 w-3" />
                                  Reject Document
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sample Service Offering */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-primary" />
                      Proposed Sessions & Offerings ({dossier.services.length})
                    </h3>

                    {dossier.services.length === 0 ? (
                      <Card className="p-6 text-center text-xs text-muted-foreground border-dashed">
                        No services configured yet.
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {dossier.services.map((svc) => (
                          <div
                            key={svc.id}
                            className="p-4 rounded-xl border border-border/80 bg-card flex items-center justify-between gap-4 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold text-foreground text-sm">
                                {svc.title}
                              </div>
                              <div className="text-muted-foreground">
                                {svc.categoryName} &bull; {svc.durationMin} mins &bull; {svc.mode}
                              </div>
                            </div>
                            <div className="font-serif font-bold text-base text-foreground">
                              ₹{(svc.priceAmount / 100).toFixed(0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Payout & Razorpay Route KYC */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Razorpay Route Escrow Account
                    </h3>
                    <Card className="p-4 border-border/80 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Linked Account ID:</span>
                        <span className="font-mono font-medium text-foreground">
                          {dossier.profile.payoutAccountId || 'Not configured'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">KYC Verification Status:</span>
                        <Badge
                          variant={dossier.profile.kycStatus === 'verified' ? 'success' : 'amber'}
                          className="text-[10px]"
                        >
                          {dossier.profile.kycStatus || 'pending_onboarding'}
                        </Badge>
                      </div>
                    </Card>
                  </div>
                </>
              )}
            </div>

            {/* Sticky Action Footer */}
            {dossier && (
              <div className="p-5 border-t border-border bg-card flex flex-wrap items-center justify-end gap-3 shadow-lg">
                <Button
                  variant="outline"
                  onClick={() => setIsRequestInfoModalOpen(true)}
                  className="text-xs rounded-xl gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                  Request More Info
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setIsRejectModalOpen(true)}
                  className="text-xs rounded-xl gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject Application
                </Button>

                <Button
                  onClick={() => setIsApproveModalOpen(true)}
                  className="text-xs rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve & Grant Tier
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPROVE MODAL */}
      {isApproveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-md w-full bg-card shadow-2xl border-primary/20 rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <CardTitle className="font-serif text-xl flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Approve Practitioner Application
              </CardTitle>
              <CardDescription>
                Publish {dossier?.profile.displayName} to the Project Nirvana sanctuary.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tier" className="text-xs font-semibold">
                  Assign Verification Tier
                </Label>
                <select
                  id="tier"
                  value={approveTier}
                  onChange={(e) => setApproveTier(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="CREDENTIAL_VERIFIED">
                    Credential Verified (Recommended: verified licenses/certs)
                  </option>
                  <option value="ID_VERIFIED">ID Verified (Government identity only)</option>
                  <option value="BACKGROUND_CHECKED">
                    Background Checked (Comprehensive security check)
                  </option>
                  <option value="UNVERIFIED">Unverified (Basic profile without badge)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-xs font-semibold">
                  Board Audit Notes (Optional)
                </Label>
                <Input
                  id="notes"
                  placeholder="e.g. Verified license against state board registry."
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                This action transitions status to <strong>APPROVED</strong>, creates an audit log
                record, and sends an in-app sanctuary notification to the healer.
              </div>
            </CardContent>

            <CardFooter className="bg-muted/20 px-6 py-4 flex items-center justify-end gap-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsApproveModalOpen(false)}
                disabled={isSubmittingApprove}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isSubmittingApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
              >
                {isSubmittingApprove ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm Approval
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* REJECT MODAL */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-md w-full bg-card shadow-2xl border-destructive/20 rounded-2xl overflow-hidden">
            <CardHeader className="bg-destructive/10 pb-4">
              <CardTitle className="font-serif text-xl flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                Reject Application
              </CardTitle>
              <CardDescription>
                Provide a clear reason explaining why this application cannot be approved.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rejectReason" className="text-xs font-semibold">
                  Rejection Reason (Required)
                </Label>
                <textarea
                  id="rejectReason"
                  rows={4}
                  placeholder="Explain why the application was rejected (e.g. Expired credentials, invalid license number, or misaligned scope of practice)..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full p-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                The reason will be saved in the practitioner&apos;s record and emailed/notified to
                them.
              </div>
            </CardContent>

            <CardFooter className="bg-muted/20 px-6 py-4 flex items-center justify-end gap-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejectModalOpen(false)}
                disabled={isSubmittingReject}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={isSubmittingReject || rejectReason.trim().length < 5}
                className="gap-1.5"
              >
                {isSubmittingReject ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Confirm Rejection
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* REQUEST MORE INFO MODAL */}
      {isRequestInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-md w-full bg-card shadow-2xl border-amber-500/20 rounded-2xl overflow-hidden">
            <CardHeader className="bg-amber-500/10 pb-4">
              <CardTitle className="font-serif text-xl flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <MessageSquare className="h-5 w-5" />
                Request Additional Information
              </CardTitle>
              <CardDescription>
                Revert application to DRAFT so the practitioner can edit their profile and re-upload
                missing credentials.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="infoMsg" className="text-xs font-semibold">
                  Guidance Message to Healer
                </Label>
                <textarea
                  id="infoMsg"
                  rows={4}
                  placeholder="e.g. Please upload a higher resolution copy of your state license showing the issue date and registration seal..."
                  value={requestInfoMessage}
                  onChange={(e) => setRequestInfoMessage(e.target.value)}
                  className="w-full p-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300">
                The practitioner will receive an in-app sanctuary notification and will see this
                message directly in their onboarding wizard.
              </div>
            </CardContent>

            <CardFooter className="bg-muted/20 px-6 py-4 flex items-center justify-end gap-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRequestInfoModalOpen(false)}
                disabled={isSubmittingRequestInfo}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRequestInfo}
                disabled={isSubmittingRequestInfo || requestInfoMessage.trim().length < 5}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium gap-1.5"
              >
                {isSubmittingRequestInfo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Request
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
