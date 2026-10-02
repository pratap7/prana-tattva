'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Globe,
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Coffee,
  Sun,
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

const WEEKDAYS = [
  { key: 'MONDAY', label: 'Monday' },
  { key: 'TUESDAY', label: 'Tuesday' },
  { key: 'WEDNESDAY', label: 'Wednesday' },
  { key: 'THURSDAY', label: 'Thursday' },
  { key: 'FRIDAY', label: 'Friday' },
  { key: 'SATURDAY', label: 'Saturday' },
  { key: 'SUNDAY', label: 'Sunday' },
] as const;

const COMMON_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST, UTC+5:30)' },
  { value: 'America/New_York', label: 'Eastern Time (ET, UTC-5/UTC-4)' },
  { value: 'America/Chicago', label: 'Central Time (CT, UTC-6/UTC-5)' },
  { value: 'America/Denver', label: 'Mountain Time (MT, UTC-7/UTC-6)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT, UTC-8/UTC-7)' },
  { value: 'Europe/London', label: 'British Time (GMT/BST, UTC+0/UTC+1)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET, UTC+1/UTC+2)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST, UTC+4)' },
  { value: 'Asia/Singapore', label: 'Singapore Time (SGT, UTC+8)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET, UTC+10/UTC+11)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];

interface RuleState {
  weekday: (typeof WEEKDAYS)[number]['key'];
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface ExceptionItem {
  id: string;
  startAt: string;
  endAt: string;
  isBlocked: boolean;
  reason?: string | null;
}

interface ConfigState {
  bufferMinutes: number;
  minNoticeHours: number;
}

export function AvailabilityEditor() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Timezone
  const [providerTimeZone, setProviderTimeZone] = useState('Asia/Kolkata');

  // Weekly rules
  const [rules, setRules] = useState<Record<string, RuleState>>({
    MONDAY: { weekday: 'MONDAY', startTime: '09:00', endTime: '17:00', isActive: true },
    TUESDAY: { weekday: 'TUESDAY', startTime: '09:00', endTime: '17:00', isActive: true },
    WEDNESDAY: { weekday: 'WEDNESDAY', startTime: '09:00', endTime: '17:00', isActive: true },
    THURSDAY: { weekday: 'THURSDAY', startTime: '09:00', endTime: '17:00', isActive: true },
    FRIDAY: { weekday: 'FRIDAY', startTime: '09:00', endTime: '17:00', isActive: true },
    SATURDAY: { weekday: 'SATURDAY', startTime: '10:00', endTime: '14:00', isActive: false },
    SUNDAY: { weekday: 'SUNDAY', startTime: '10:00', endTime: '14:00', isActive: false },
  });

  // Config
  const [config, setConfig] = useState<ConfigState>({
    bufferMinutes: 15,
    minNoticeHours: 4,
  });

  // Exceptions
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [isAddingException, setIsAddingException] = useState(false);
  const [newException, setNewException] = useState({
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '17:00',
    isBlocked: true,
    reason: '',
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [rulesRes, exceptionsRes, configRes] = await Promise.all([
        apiFetch<
          Array<{
            weekday: string;
            startTime: string;
            endTime: string;
            providerTimeZone: string;
            isActive: boolean;
          }>
        >('/provider/availability/rules'),
        apiFetch<ExceptionItem[]>('/provider/availability/exceptions'),
        apiFetch<ConfigState>('/provider/availability/config'),
      ]);

      if (rulesRes && rulesRes.length > 0) {
        const nextRules: Record<string, RuleState> = {};
        for (const w of WEEKDAYS) {
          nextRules[w.key] = {
            weekday: w.key,
            startTime: '09:00',
            endTime: '17:00',
            isActive: false,
          };
        }
        for (const r of rulesRes) {
          if (r.weekday in nextRules) {
            nextRules[r.weekday] = {
              weekday: r.weekday as RuleState['weekday'],
              startTime: r.startTime,
              endTime: r.endTime,
              isActive: r.isActive,
            };
          }
          if (r.providerTimeZone) {
            setProviderTimeZone(r.providerTimeZone);
          }
        }
        setRules(nextRules);
      }

      if (exceptionsRes) setExceptions(exceptionsRes);
      if (configRes) setConfig(configRes);
    } catch (err: unknown) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to load availability configuration.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle rule toggle
  const toggleDay = (key: string) => {
    setRules((prev) => ({
      ...prev,
      [key]: { ...prev[key], isActive: !prev[key].isActive },
    }));
  };

  // Handle rule time change
  const updateRuleTime = (key: string, field: 'startTime' | 'endTime', value: string) => {
    setRules((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  // Save All Availability
  const handleSave = async () => {
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const activeRulesPayload = Object.values(rules).filter((r) => r.isActive);

      await Promise.all([
        apiFetch('/provider/availability/rules', {
          method: 'PUT',
          body: JSON.stringify({
            providerTimeZone,
            rules: activeRulesPayload.map((r) => ({
              weekday: r.weekday,
              startTime: r.startTime,
              endTime: r.endTime,
              providerTimeZone,
              isActive: true,
            })),
          }),
        }),
        apiFetch('/provider/availability/config', {
          method: 'PUT',
          body: JSON.stringify(config),
        }),
      ]);

      setSuccessMessage('Weekly availability & session buffer rules saved successfully!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to save availability settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // Create Exception
  const handleCreateException = async () => {
    if (!newException.startDate || !newException.endDate) {
      setErrorMessage('Please select both start and end dates for the exception.');
      return;
    }

    try {
      const startAt = new Date(
        `${newException.startDate}T${newException.startTime}:00`,
      ).toISOString();
      const endAt = new Date(`${newException.endDate}T${newException.endTime}:00`).toISOString();

      const created = await apiFetch<ExceptionItem>('/provider/availability/exceptions', {
        method: 'POST',
        body: JSON.stringify({
          startAt,
          endAt,
          isBlocked: newException.isBlocked,
          reason: newException.reason.trim() || undefined,
        }),
      });

      setExceptions((prev) => [...prev, created]);
      setIsAddingException(false);
      setNewException({
        startDate: '',
        startTime: '09:00',
        endDate: '',
        endTime: '17:00',
        isBlocked: true,
        reason: '',
      });
      setSuccessMessage('Exception date created.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to create exception.');
    }
  };

  // Delete Exception
  const handleDeleteException = async (id: string) => {
    try {
      await apiFetch(`/provider/availability/exceptions/${id}`, { method: 'DELETE' });
      setExceptions((prev) => prev.filter((e) => e.id !== id));
      setSuccessMessage('Exception removed.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to remove exception.');
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Loading your sanctuary availability...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Practitioner Sanctuary</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3 text-primary" />
              {providerTimeZone}
            </span>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground mt-1">
            Availability & Working Hours
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure your recurring weekly schedule, session rest buffers, and vacation dates. All
            times are defined in your local time zone and converted automatically for global
            seekers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl gap-2 shadow-sm"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Working Hours
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-3 text-sm animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3 text-sm animate-in fade-in">
          <AlertCircle className="h-5 w-5 shrink-0" />
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

      {/* Timezone & Session Rules Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-border/70 p-5 rounded-2xl space-y-2">
          <Label htmlFor="tz" className="text-xs font-semibold flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-primary" />
            Your Time Zone
          </Label>
          <select
            id="tz"
            value={providerTimeZone}
            onChange={(e) => setProviderTimeZone(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Weekly slots expand from this timezone with accurate DST transitions.
          </p>
        </Card>

        <Card className="border border-border/70 p-5 rounded-2xl space-y-2">
          <Label htmlFor="buffer" className="text-xs font-semibold flex items-center gap-1.5">
            <Coffee className="h-4 w-4 text-amber-500" />
            Rest Buffer Between Sessions
          </Label>
          <select
            id="buffer"
            value={config.bufferMinutes}
            onChange={(e) => setConfig({ ...config, bufferMinutes: parseInt(e.target.value, 10) })}
            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={0}>No buffer (Back-to-back)</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes (Recommended)</option>
            <option value={20}>20 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
          <p className="text-[11px] text-muted-foreground">
            Protects your peace. Enforces mandatory rest between consecutive bookings.
          </p>
        </Card>

        <Card className="border border-border/70 p-5 rounded-2xl space-y-2">
          <Label htmlFor="notice" className="text-xs font-semibold flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-emerald-600" />
            Minimum Booking Notice
          </Label>
          <select
            id="notice"
            value={config.minNoticeHours}
            onChange={(e) => setConfig({ ...config, minNoticeHours: parseInt(e.target.value, 10) })}
            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={1}>1 hour</option>
            <option value={2}>2 hours</option>
            <option value={4}>4 hours (Recommended)</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours (1 full day notice)</option>
            <option value={48}>48 hours (2 days notice)</option>
          </select>
          <p className="text-[11px] text-muted-foreground">
            Prevents last-minute bookings. Seekers cannot book sooner than this window.
          </p>
        </Card>
      </div>

      {/* Weekly Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-serif font-semibold text-foreground flex items-center gap-2">
              <Sun className="h-5 w-5 text-primary" />
              Weekly Recurring Hours
            </h2>
            <p className="text-xs text-muted-foreground">
              Set standard working hours for each day of the week.
            </p>
          </div>
        </div>

        <Card className="border border-border/80 rounded-2xl overflow-hidden divide-y divide-border/40 bg-card">
          {WEEKDAYS.map((day) => {
            const rule = rules[day.key];
            return (
              <div
                key={day.key}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  rule.isActive ? 'bg-card' : 'bg-muted/10 opacity-70'
                }`}
              >
                <div className="flex items-center gap-4 min-w-[150px]">
                  <input
                    type="checkbox"
                    id={`check-${day.key}`}
                    checked={rule.isActive}
                    onChange={() => toggleDay(day.key)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <Label
                    htmlFor={`check-${day.key}`}
                    className="text-sm font-semibold text-foreground cursor-pointer"
                  >
                    {day.label}
                  </Label>
                </div>

                {rule.isActive ? (
                  <div className="flex items-center gap-3 flex-1 sm:justify-center">
                    <div className="flex items-center gap-2 text-xs">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="time"
                        value={rule.startTime}
                        onChange={(e) => updateRuleTime(day.key, 'startTime', e.target.value)}
                        className="w-32 h-9 text-xs"
                      />
                    </div>
                    <span className="text-muted-foreground text-xs">to</span>
                    <div className="flex items-center gap-2 text-xs">
                      <Input
                        type="time"
                        value={rule.endTime}
                        onChange={(e) => updateRuleTime(day.key, 'endTime', e.target.value)}
                        className="w-32 h-9 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 sm:text-center text-xs text-muted-foreground italic">
                    Unavailable (Day Off)
                  </div>
                )}

                <div className="text-right">
                  <Badge variant={rule.isActive ? 'success' : 'outline'} className="text-[10px]">
                    {rule.isActive ? 'Available' : 'Closed'}
                  </Badge>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Exceptions & Vacation Overrides */}
      <div className="space-y-4 pt-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-serif font-semibold text-foreground flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Schedule Exceptions & Time Off ({exceptions.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Add vacation days, holidays, or one-off extra availability slots.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAddingException(true)}
            className="rounded-xl gap-1.5 text-xs shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            Add Exception Date
          </Button>
        </div>

        {exceptions.length === 0 ? (
          <Card className="p-8 text-center bg-muted/10 border-dashed rounded-2xl">
            <p className="text-xs text-muted-foreground">
              No schedule exceptions added. Your weekly recurring hours will apply continuously.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {exceptions.map((exc) => {
              const start = new Date(exc.startAt);
              const end = new Date(exc.endAt);
              return (
                <Card
                  key={exc.id}
                  className="p-4 rounded-xl border border-border/80 bg-card flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={exc.isBlocked ? 'destructive' : 'success'}
                        className="text-[10px]"
                      >
                        {exc.isBlocked ? 'Blocked (Time Off)' : 'Extra Slot (Open)'}
                      </Badge>
                      {exc.reason && (
                        <span className="text-xs font-semibold text-foreground">{exc.reason}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {start.toLocaleDateString()}{' '}
                      {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull;{' '}
                      {end.toLocaleDateString()}{' '}
                      {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteException(exc.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    title="Remove exception"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD EXCEPTION MODAL */}
      {isAddingException && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-md w-full bg-card shadow-2xl border-primary/20 rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <CardTitle className="font-serif text-xl">Add Schedule Exception</CardTitle>
              <CardDescription>
                Block specific vacation hours or open a one-off weekend session.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="excType" className="text-xs font-semibold">
                  Exception Type
                </Label>
                <select
                  id="excType"
                  value={newException.isBlocked ? 'blocked' : 'extra'}
                  onChange={(e) =>
                    setNewException({
                      ...newException,
                      isBlocked: e.target.value === 'blocked',
                    })
                  }
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="blocked">Time Off / Blocked (Unavailable for booking)</option>
                  <option value="extra">Extra Slot (Open for booking outside regular hours)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="startDate" className="text-xs">
                    Start Date
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={newException.startDate}
                    onChange={(e) =>
                      setNewException({ ...newException, startDate: e.target.value })
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="startTime" className="text-xs">
                    Start Time
                  </Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={newException.startTime}
                    onChange={(e) =>
                      setNewException({ ...newException, startTime: e.target.value })
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="endDate" className="text-xs">
                    End Date
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={newException.endDate}
                    onChange={(e) => setNewException({ ...newException, endDate: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endTime" className="text-xs">
                    End Time
                  </Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={newException.endTime}
                    onChange={(e) => setNewException({ ...newException, endTime: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reason" className="text-xs">
                  Reason (Optional)
                </Label>
                <Input
                  id="reason"
                  placeholder="e.g. Travel, Personal Retreat, or Public Holiday"
                  value={newException.reason}
                  onChange={(e) => setNewException({ ...newException, reason: e.target.value })}
                  className="text-xs"
                />
              </div>
            </CardContent>

            <CardFooter className="bg-muted/20 px-6 py-4 flex items-center justify-end gap-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setIsAddingException(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateException}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              >
                Add Exception
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
