'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders,
  Shield,
  Save,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Percent,
  FileText,
  Lock,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { AdminSettings } from '@project-nirvana/shared';

const DEFAULT_SETTINGS: AdminSettings = {
  featureFlags: {
    dailyVideoEnabled: true,
    antiLeakageStrict: true,
    escrowAutoRelease: true,
    newPractitionerApplications: true,
    audioOnlyFallback: true,
  },
  platformFeeBps: 1500,
  escrowHoldHours: 24,
  cancellationDefaults: {
    flexibleNoticeHours: 24,
    moderateNoticeHours: 48,
    strictNoticeHours: 72,
  },
  disclaimers: {
    healthDataNotice:
      'Project Nirvana connects seekers with authentic wellness wisdom. Guidance provided does not constitute registered clinical diagnosis.',
    emergencyCrisisNotice:
      'For acute emotional or psychiatric crisis, please call emergency services (112) or the Vandrevala Foundation (9999 666 555).',
  },
  reason: 'Initial setup',
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  const [auditReason, setAuditReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiFetch<AdminSettings>('/admin/settings');
      if (data) {
        setSettings(data);
      }
    } catch {
      // Offline fallback
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggleFlag = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      featureFlags: {
        ...prev.featureFlags,
        [key]: !prev.featureFlags[key],
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditReason.trim() || auditReason.trim().length < 5) {
      setErrorMessage('Audit compliance requires an explanatory reason of at least 5 characters.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setSaveSuccess(false);

      await apiFetch('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...settings,
          reason: auditReason.trim(),
        }),
      });

      setSaveSuccess(true);
      setAuditReason('');
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setErrorMessage((err as Error)?.message || 'Failed to update platform settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center text-stone-400">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
        Loading system configuration parameters...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-light text-stone-100 tracking-tight">
            Platform Global Settings
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            System feature switches, escrow release holding windows, commission take rate, and
            statutory notices.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchSettings}
          className="border-stone-800 text-stone-300 hover:bg-stone-900 w-fit"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Reload Settings
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Feature Flags */}
        <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
          <CardHeader className="p-5 pb-3 border-b border-stone-800/80">
            <CardTitle className="text-base font-medium text-stone-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-500" />
              Dynamic Feature Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {Object.entries(settings.featureFlags).map(([key, enabled]) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 rounded-lg bg-stone-950/40 border border-stone-800/60"
              >
                <div>
                  <div className="text-sm font-medium text-stone-200 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-xs text-stone-500 font-mono">flag: {key}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleFlag(key)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    enabled ? 'bg-amber-600 justify-end' : 'bg-stone-800 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Section 2: Financial & Escrow Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
            <CardHeader className="p-5 pb-3 border-b border-stone-800/80">
              <CardTitle className="text-base font-medium text-stone-200 flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-400" />
                Platform Commission Fee
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Default Platform Fee (Basis Points)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="5000"
                  value={settings.platformFeeBps}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      platformFeeBps: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="bg-stone-950 border-stone-800 text-stone-200"
                />
                <span className="text-[11px] text-stone-500 mt-1 block">
                  {(settings.platformFeeBps / 100).toFixed(2)}% taken from consumer booking total
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
            <CardHeader className="p-5 pb-3 border-b border-stone-800/80">
              <CardTitle className="text-base font-medium text-stone-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Escrow Settlement Hold Period
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Hold Duration (Hours post-session completion)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="720"
                  value={settings.escrowHoldHours}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      escrowHoldHours: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="bg-stone-950 border-stone-800 text-stone-200"
                />
                <span className="text-[11px] text-stone-500 mt-1 block">
                  Funds remain in platform escrow for dispute filing window prior to automated
                  provider payout
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Cancellation Policies Defaults */}
        <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
          <CardHeader className="p-5 pb-3 border-b border-stone-800/80">
            <CardTitle className="text-base font-medium text-stone-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              Cancellation Tier Notice Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Flexible Tier Notice (Hours)
              </label>
              <Input
                type="number"
                value={settings.cancellationDefaults.flexibleNoticeHours}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cancellationDefaults: {
                      ...prev.cancellationDefaults,
                      flexibleNoticeHours: parseInt(e.target.value, 10) || 0,
                    },
                  }))
                }
                className="bg-stone-950 border-stone-800 text-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Moderate Tier Notice (Hours)
              </label>
              <Input
                type="number"
                value={settings.cancellationDefaults.moderateNoticeHours}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cancellationDefaults: {
                      ...prev.cancellationDefaults,
                      moderateNoticeHours: parseInt(e.target.value, 10) || 0,
                    },
                  }))
                }
                className="bg-stone-950 border-stone-800 text-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Strict Tier Notice (Hours)
              </label>
              <Input
                type="number"
                value={settings.cancellationDefaults.strictNoticeHours}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cancellationDefaults: {
                      ...prev.cancellationDefaults,
                      strictNoticeHours: parseInt(e.target.value, 10) || 0,
                    },
                  }))
                }
                className="bg-stone-950 border-stone-800 text-stone-200"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Platform Disclaimers */}
        <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
          <CardHeader className="p-5 pb-3 border-b border-stone-800/80">
            <CardTitle className="text-base font-medium text-stone-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-stone-400" />
              Statutory Platform Disclaimers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Health Data & Non-Clinical Practice Notice
              </label>
              <textarea
                rows={2}
                value={settings.disclaimers.healthDataNotice}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    disclaimers: {
                      ...prev.disclaimers,
                      healthDataNotice: e.target.value,
                    },
                  }))
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-md p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Emergency Crisis Intervention Contact Notice
              </label>
              <textarea
                rows={2}
                value={settings.disclaimers.emergencyCrisisNotice}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    disclaimers: {
                      ...prev.disclaimers,
                      emergencyCrisisNotice: e.target.value,
                    },
                  }))
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-md p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </CardContent>
        </Card>

        {/* Audit Verification & Save Bar */}
        <Card className="border-amber-500/30 bg-amber-950/10">
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-amber-400 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Mandatory Audit Trail Justification <span className="text-rose-400">*</span>
              </label>
              <Input
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                placeholder="State reason for modifying system parameters (min 5 characters)..."
                className="bg-stone-950 border-stone-800 text-stone-200"
              />
              <span className="text-[11px] text-stone-500 mt-1 block">
                This modification will be cryptographically audit-logged with before/after state
                diffs.
              </span>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Platform settings updated and audit-logged successfully.</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium px-6"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Committing Changes...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save & Audit Log Configuration
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
