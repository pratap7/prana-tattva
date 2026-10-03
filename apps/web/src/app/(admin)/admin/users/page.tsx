'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Download,
  ShieldAlert,
  ShieldCheck,
  Eye,
  History,
  AlertTriangle,
  RefreshCw,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { AdminUserListItem } from '@project-nirvana/shared';

interface AuditLogEntry {
  id: string;
  action: string;
  reason?: string | null;
  createdAt: string;
  user?: { email: string } | null;
  ipAddress?: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Drawers
  const [suspendTarget, setSuspendTarget] = useState<AdminUserListItem | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [auditTarget, setAuditTarget] = useState<AdminUserListItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '15');
      if (search.trim()) params.append('search', search.trim());
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);

      const data = await apiFetch<{
        users: AdminUserListItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/admin/users?${params.toString()}`);

      setUsers(data.users || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      // Offline fallback dummy preview
      setUsers([
        {
          id: 'u-sample-1',
          email: 'dr.ananya@sanctuary.test',
          phone: '+919876543210',
          role: 'PROVIDER',
          status: 'ACTIVE',
          adminPermissions: [],
          createdAt: new Date().toISOString(),
          providerProfile: {
            id: 'p-1',
            displayName: 'Dr. Ananya Sharma',
            slug: 'dr-ananya-sharma',
            approvalStatus: 'APPROVED',
            verificationTier: 'CREDENTIAL_VERIFIED',
            ratingAvg: 4.95,
            ratingCount: 38,
            isFeatured: true,
          },
          bookingsCount: 42,
        },
        {
          id: 'u-sample-2',
          email: 'seeker.rahul@gmail.com',
          phone: '+919811122233',
          role: 'CONSUMER',
          status: 'ACTIVE',
          adminPermissions: [],
          createdAt: new Date().toISOString(),
          providerProfile: null,
          bookingsCount: 5,
        },
      ]);
      setTotal(2);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      params.append('exportCsv', 'true');
      if (search.trim()) params.append('search', search.trim());
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('nirvana_access_token') || ''}`,
        },
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-export-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Unable to export CSV at this moment.');
    }
  };

  // Suspend / Reinstate action
  const handleToggleStatus = async () => {
    if (!suspendTarget) return;
    if (!suspendReason.trim() || suspendReason.trim().length < 5) {
      setStatusError('Audit compliance requires a reason of at least 5 characters.');
      return;
    }

    try {
      setIsSubmittingStatus(true);
      setStatusError(null);
      const newStatus = suspendTarget.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

      await apiFetch(`/admin/users/${suspendTarget.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          reason: suspendReason.trim(),
        }),
      });

      setSuspendTarget(null);
      setSuspendReason('');
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user status';
      setStatusError(msg);
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // Launch Impersonation-Free "View As" (Read-Only Mode)
  const handleViewAs = async (u: AdminUserListItem) => {
    try {
      await apiFetch(`/admin/users/${u.id}/view-as`);
      const payload = {
        targetId: u.id,
        targetEmail: u.email,
        targetName: u.providerProfile?.displayName || u.email.split('@')[0],
        role: u.role,
      };
      localStorage.setItem('nirvana_view_as', JSON.stringify(payload));
      window.location.href =
        u.role === 'PROVIDER' ? `/providers/${u.providerProfile?.slug || ''}` : '/dashboard';
    } catch {
      alert('Failed to initiate view-as session.');
    }
  };

  // Open Audit Trail
  const handleOpenAudit = async (u: AdminUserListItem) => {
    setAuditTarget(u);
    try {
      setIsLoadingAudit(true);
      const logs = await apiFetch<AuditLogEntry[]>(`/admin/users/${u.id}/audit-trail`);
      setAuditLogs(logs || []);
    } catch {
      setAuditLogs([]);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Users & Practitioners</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full registry of seekers, verified healers, and administrator accounts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs gap-1.5 h-9"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={isLoading}
            className="text-xs gap-1.5 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="p-4 bg-card border-border/80 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search email, phone, or healer name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 text-xs h-9"
            />
          </div>

          <div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs h-9 rounded-md border border-border bg-background px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Roles (Seeker, Healer, Admin)</option>
              <option value="CONSUMER">Consumers (Seekers)</option>
              <option value="PROVIDER">Practitioners (Healers)</option>
              <option value="ADMIN">Administrators</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs h-9 rounded-md border border-border bg-background px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Account Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="SUSPENDED">Suspended Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden border border-border/80 bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">User / Healer Profile</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Sessions</th>
                <th className="py-3 px-3">Verification Tier</th>
                <th className="py-3 px-3">Joined</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                    <span>Loading registry...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No users found matching current filters.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">
                        {u.providerProfile?.displayName || u.email}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {u.email} {u.phone ? `• ${u.phone}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={
                          u.role === 'ADMIN'
                            ? 'destructive'
                            : u.role === 'PROVIDER'
                              ? 'default'
                              : 'outline'
                        }
                        className="text-[10px]"
                      >
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={u.status === 'ACTIVE' ? 'success' : 'destructive'}
                        className="text-[10px]"
                      >
                        {u.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 font-mono font-medium">{u.bookingsCount}</td>
                    <td className="py-3 px-3">
                      {u.providerProfile ? (
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-medium text-foreground block">
                            {u.providerProfile.verificationTier.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {u.providerProfile.approvalStatus}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Impersonation-Free "View As" */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewAs(u)}
                          title="View As (Read-Only Mode)"
                          className="h-7 px-2 text-[11px] text-primary hover:text-primary"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View As
                        </Button>

                        {/* Audit Trail */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenAudit(u)}
                          title="Inspect Audit Trail"
                          className="h-7 px-2 text-[11px] text-muted-foreground"
                        >
                          <History className="h-3.5 w-3.5 mr-1" />
                          Audit
                        </Button>

                        {/* Suspend / Reinstate */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSuspendTarget(u)}
                          className={`h-7 px-2 text-[11px] ${
                            u.status === 'ACTIVE'
                              ? 'text-destructive hover:bg-destructive/10 border-destructive/30'
                              : 'text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-border/50 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing page {page} of {totalPages} ({total} total records)
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 px-2 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 px-2 text-xs"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Suspend / Reinstate Audit Dialog */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <button
              onClick={() => {
                setSuspendTarget(null);
                setSuspendReason('');
                setStatusError(null);
              }}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  suspendTarget.status === 'ACTIVE'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-emerald-500/10 text-emerald-600'
                }`}
              >
                {suspendTarget.status === 'ACTIVE' ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  {suspendTarget.status === 'ACTIVE'
                    ? 'Suspend User Access'
                    : 'Reinstate User Access'}
                </h3>
                <p className="text-xs text-muted-foreground truncate">{suspendTarget.email}</p>
              </div>
            </div>

            {statusError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{statusError}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed">
              Every status alteration is immutably recorded in the platform audit log. Please detail
              the formal rationale for{' '}
              {suspendTarget.status === 'ACTIVE' ? 'suspending' : 'reinstating'} this account.
            </p>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Audit Compliance Reason <span className="text-destructive">*</span>
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. Investigation into client harassment allegations or dispute resolution..."
                rows={3}
                className="w-full text-xs rounded-xl border border-border bg-background p-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSuspendTarget(null);
                  setSuspendReason('');
                  setStatusError(null);
                }}
              >
                Cancel
              </Button>

              <Button
                variant={suspendTarget.status === 'ACTIVE' ? 'destructive' : 'default'}
                size="sm"
                onClick={handleToggleStatus}
                disabled={isSubmittingStatus}
                className="gap-1.5"
              >
                {isSubmittingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  Confirm {suspendTarget.status === 'ACTIVE' ? 'Suspension' : 'Reinstatement'}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Drawer Modal */}
      {auditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs p-0 animate-in fade-in duration-200">
          <div className="h-full w-full max-w-lg bg-card border-l border-border p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-foreground">
                  Immutable Audit Trail
                </h3>
                <p className="text-xs text-muted-foreground truncate">{auditTarget.email}</p>
              </div>
              <button
                onClick={() => setAuditTarget(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isLoadingAudit ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                  <span className="text-xs">Fetching audit log entries...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No audit log entries recorded for this user.
                </p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-border/60 bg-muted/10 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-primary text-[11px]">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.reason && (
                      <p className="text-foreground/90 italic text-[11px]">
                        &ldquo;{log.reason}&rdquo;
                      </p>
                    )}
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>Actor: {log.user?.email || 'SYSTEM'}</span>
                      {log.ipAddress && <span>• IP: {log.ipAddress}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-border/40 text-right">
              <Button variant="outline" size="sm" onClick={() => setAuditTarget(null)}>
                Close Trail
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
