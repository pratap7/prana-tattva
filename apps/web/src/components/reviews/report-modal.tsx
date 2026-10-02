'use client';

import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

interface ReportModalProps {
  type: 'PROVIDER' | 'REVIEW';
  targetId: string; // providerId or reviewId
  targetName: string;
  bookingId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReportModal({
  type,
  targetId,
  targetName,
  bookingId,
  isOpen,
  onClose,
  onSuccess,
}: ReportModalProps) {
  const [providerCategory, setProviderCategory] = useState<string>('MISCONDUCT');
  const [reviewReason, setReviewReason] = useState<string>('DEFAMATION');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [reasonText, setReasonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    message: string;
    autoSuspended?: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonText.trim()) {
      setError('Please provide specific details explaining the issue.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (type === 'PROVIDER') {
        const res = await apiFetch<{
          success: boolean;
          autoSuspended: boolean;
          message: string;
        }>('/reviews/report-provider', {
          method: 'POST',
          body: JSON.stringify({
            providerId: targetId,
            category: providerCategory,
            reason: reasonText.trim(),
            bookingId: bookingId || undefined,
            severity,
          }),
        });

        setSuccessInfo({
          message: res.message,
          autoSuspended: res.autoSuspended,
        });
      } else {
        const res = await apiFetch<{ success: boolean; message: string }>(
          `/reviews/${targetId}/report`,
          {
            method: 'POST',
            body: JSON.stringify({
              reason: reviewReason,
              details: reasonText.trim(),
            }),
          },
        );

        setSuccessInfo({ message: res.message });
      }

      onSuccess?.();
      setTimeout(() => {
        setSuccessInfo(null);
        onClose();
      }, 3000);
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
            <h3 className="font-serif text-lg font-medium text-foreground">
              {type === 'PROVIDER' ? 'Report Practitioner' : 'Report Review'}
            </h3>
            <p className="text-xs text-muted-foreground">Concerning {targetName}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successInfo ? (
          <div className="py-6 text-center space-y-3 animate-in fade-in duration-200">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h4 className="font-serif text-base font-medium text-foreground">
              {successInfo.autoSuspended ? 'Emergency Safety Action Taken' : 'Report Acknowledged'}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{successInfo.message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {type === 'PROVIDER' ? (
              <>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Primary Concern Category
                  </label>
                  <select
                    value={providerCategory}
                    onChange={(e) => setProviderCategory(e.target.value)}
                    className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="MISCONDUCT">Professional Misconduct / Breach of Ethics</option>
                    <option value="MEDICAL_CLAIMS">
                      Unsubstantiated Medical Cures / False Claims
                    </option>
                    <option value="SCAM">Financial Scam / Off-Platform Solicitation</option>
                    <option value="HARASSMENT">Harassment or Inappropriate Boundaries</option>
                    <option value="OTHER">Other Serious Violation</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Severity Assessment
                  </label>
                  <select
                    value={severity}
                    onChange={(e) =>
                      setSeverity(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
                    }
                    className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="LOW">Low (Procedural confusion or minor concern)</option>
                    <option value="MEDIUM">
                      Medium (Unprofessional standard or communication)
                    </option>
                    <option value="HIGH">
                      High (Aggressive behavior, explicit claims, safety risk)
                    </option>
                    <option value="CRITICAL">
                      Critical (Immediate harm, severe abuse, emergency)
                    </option>
                  </select>
                  {(severity === 'HIGH' || severity === 'CRITICAL') && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>
                        Severe reports prompt automated temporary suspension pending audit.
                      </span>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Reason for Review Report
                </label>
                <select
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="DEFAMATION">Defamation or provably false statements</option>
                  <option value="PROFANITY">Profanity or abusive hate speech</option>
                  <option value="HARASSMENT">Targeted harassment of practitioner</option>
                  <option value="FAKE_REVIEW">Suspected fake or competitor review</option>
                  <option value="CONFLICT_OF_INTEREST">
                    Conflict of interest / unauthorized third party
                  </option>
                  <option value="OTHER">Other violation</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Detailed Context & Quotations
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={4}
                placeholder="Explain what occurred with specific examples. Our Trust & Safety board handles all submissions confidentially..."
                className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
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
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Submitting...
                  </>
                ) : (
                  'File Confidential Report'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
