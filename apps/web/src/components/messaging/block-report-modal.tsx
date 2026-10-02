'use client';

import React, { useState } from 'react';
import { ShieldAlert, Ban, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

interface BlockReportModalProps {
  userId: string;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
  onBlocked?: () => void;
  isAlreadyBlocked?: boolean;
}

type TabType = 'block' | 'report';

export function BlockReportModal({
  userId,
  userName,
  isOpen,
  onClose,
  onBlocked,
  isAlreadyBlocked = false,
}: BlockReportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('block');
  const [reportReason, setReportReason] = useState<string>('HARASSMENT');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBlockToggle = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      if (isAlreadyBlocked) {
        await apiFetch(`/users/${userId}/block`, { method: 'DELETE' });
        setSuccessMessage(`${userName} has been unblocked.`);
      } else {
        await apiFetch(`/users/${userId}/block`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Blocked by user from chat' }),
        });
        setSuccessMessage(`${userName} has been blocked.`);
      }

      onBlocked?.();
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update block state';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDetails.trim()) {
      setError('Please provide details for the safety team.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await apiFetch(`/users/${userId}/report`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reportReason,
          details: reportDetails,
        }),
      });

      setSuccessMessage(
        'Thank you. Our safety and trust team will review this report within 12 hours.',
      );
      setTimeout(() => {
        setSuccessMessage(null);
        setReportDetails('');
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit report';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50 transition-colors"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-medium text-foreground">Trust & Safety</h3>
            <p className="text-xs text-muted-foreground">Manage interaction with {userName}</p>
          </div>
        </div>

        {/* Tab selection */}
        <div className="flex rounded-lg bg-muted/60 p-1 mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('block')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'block'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Ban className="h-3.5 w-3.5" />
            {isAlreadyBlocked ? 'Unblock' : 'Block'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'report'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Report
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage ? (
          <div className="py-6 text-center space-y-2 animate-in fade-in duration-200">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-foreground">{successMessage}</p>
          </div>
        ) : activeTab === 'block' ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAlreadyBlocked
                ? `Unblocking will allow ${userName} to send you messages and view your bookings if active.`
                : `Blocking will immediately prevent ${userName} from sending you messages. Existing appointments will remain visible in your booking history.`}
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                variant={isAlreadyBlocked ? 'default' : 'destructive'}
                size="sm"
                onClick={handleBlockToggle}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing...' : isAlreadyBlocked ? 'Unblock User' : 'Block User'}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleReport} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Reason for report
              </label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full text-xs rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="HARASSMENT">Harassment or abusive language</option>
                <option value="OFF_PLATFORM_PAYMENT">
                  Requesting payment or contact outside Sanctuary
                </option>
                <option value="SPAM">Spam or unwanted advertising</option>
                <option value="INAPPROPRIATE_BEHAVIOR">Inappropriate professional conduct</option>
                <option value="OTHER">Other concern</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Details & Context
              </label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={3}
                placeholder="Describe what occurred. Specific quotes or timestamps help our trust and safety auditors..."
                className="w-full text-xs rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button variant="destructive" size="sm" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Confidential Report'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
