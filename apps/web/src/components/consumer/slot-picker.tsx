'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Globe,
  Loader2,
  CheckCircle2,
  Sun,
  Sunset,
  Moon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AvailableSlot } from '@project-nirvana/shared';
import { apiFetch } from '@/lib/api-client';

const COMMON_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time PT)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time MT)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time CT)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time ET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (Central European CET)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST, UTC+4)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (India Standard IST, UTC+5:30)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT, UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST, UTC+9)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AET, UTC+10/11)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];

export interface SlotPickerProps {
  providerId: string;
  serviceId: string;
  serviceTitle: string;
  serviceDurationMin: number;
  onSelectSlot: (slot: AvailableSlot) => void;
  selectedSlot?: AvailableSlot | null;
}

export function SlotPicker({
  providerId,
  serviceId,
  serviceTitle,
  serviceDurationMin,
  onSelectSlot,
  selectedSlot,
}: SlotPickerProps) {
  // Detect viewer's IANA timezone automatically with fallback to UTC
  const [viewerTimeZone, setViewerTimeZone] = useState<string>('UTC');
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setViewerTimeZone(detected);
    } catch {
      setViewerTimeZone('UTC');
    }
  }, []);

  // Selected date (defaults to tomorrow in local time)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate 14 selectable dates starting from tomorrow
  const availableDates = useMemo(() => {
    const list: Array<{ dateStr: string; dayName: string; dayNumber: string; monthName: string }> =
      [];
    const base = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(base.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNumber = d.toLocaleDateString('en-US', { day: 'numeric' });
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      list.push({ dateStr, dayName, dayNumber, monthName });
    }
    return list;
  }, []);

  // Fetch slots for window [selectedDate, selectedDate + 6 days]
  const fetchSlots = useCallback(async () => {
    if (!providerId || !serviceId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Calculate 7 days query window from the start of available dates
      const startDate = availableDates[0]?.dateStr || selectedDate;
      const endDate = availableDates[availableDates.length - 1]?.dateStr || selectedDate;

      const res = await apiFetch<{
        slots: AvailableSlot[];
        cached: boolean;
        totalSlots: number;
      }>(
        `/providers/${providerId}/slots?serviceId=${serviceId}&startDate=${startDate}&endDate=${endDate}&viewerTimeZone=${encodeURIComponent(
          viewerTimeZone,
        )}`,
      );

      setSlots(res.slots || []);
    } catch {
      setErrorMessage(
        'Could not load slots for this service. Please check practitioner availability.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [providerId, serviceId, selectedDate, viewerTimeZone, availableDates]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Filter slots for the currently selected date
  const slotsForDate = useMemo(() => {
    return slots.filter((s) => s.localDate === selectedDate);
  }, [slots, selectedDate]);

  // Group slots by time of day
  const groupedSlots = useMemo(() => {
    const morning: AvailableSlot[] = [];
    const afternoon: AvailableSlot[] = [];
    const evening: AvailableSlot[] = [];

    for (const slot of slotsForDate) {
      // Extract hour from localStart e.g. "2026-10-15T09:30:00"
      const hour = parseInt(slot.localStart.split('T')[1].split(':')[0], 10);
      if (hour < 12) {
        morning.push(slot);
      } else if (hour < 17) {
        afternoon.push(slot);
      } else {
        evening.push(slot);
      }
    }

    return { morning, afternoon, evening };
  }, [slotsForDate]);

  return (
    <div className="space-y-6">
      {/* Explicit Time Zone Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/60">
        <div className="flex items-center gap-2 text-xs">
          <Globe className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">
            {serviceTitle ? `${serviceTitle} • ` : ''}Times explicitly shown in:
          </span>
          <span className="font-semibold text-foreground font-mono bg-background px-2 py-0.5 rounded border border-border/80">
            {viewerTimeZone}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="tz-select" className="text-[11px] text-muted-foreground shrink-0">
            Change Timezone:
          </Label>
          <select
            id="tz-select"
            value={viewerTimeZone}
            onChange={(e) => setViewerTimeZone(e.target.value)}
            className="h-8 px-2 rounded-lg border border-input bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary max-w-[220px]"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Date Carousel Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span className="font-medium">Select Sanctuary Date</span>
          <span>Showing next 14 days</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {availableDates.map((item) => {
            const isSelected = item.dateStr === selectedDate;
            const hasSlotsOnDay = slots.some((s) => s.localDate === item.dateStr);

            return (
              <button
                key={item.dateStr}
                type="button"
                onClick={() => setSelectedDate(item.dateStr)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border min-w-[70px] shrink-0 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-md'
                    : 'border-border/70 bg-card hover:border-primary/40 text-foreground'
                }`}
              >
                <span
                  className={`text-[11px] font-medium uppercase tracking-wider ${
                    isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'
                  }`}
                >
                  {item.dayName}
                </span>
                <span className="text-lg font-serif font-bold mt-0.5 leading-none">
                  {item.dayNumber}
                </span>
                <span
                  className={`text-[10px] mt-1 ${
                    isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  }`}
                >
                  {item.monthName}
                </span>
                {hasSlotsOnDay && !isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Slots Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <h3 className="font-serif font-semibold text-base text-foreground">
              Available Slots for{' '}
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {slotsForDate.length} slot{slotsForDate.length !== 1 ? 's' : ''} available
          </Badge>
        </div>

        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">
              Computing live DST-accurate slots in {viewerTimeZone}...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="p-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-2xl border border-dashed">
            {errorMessage}
          </div>
        ) : slotsForDate.length === 0 ? (
          <div className="py-12 text-center bg-muted/10 rounded-2xl border border-dashed space-y-2 p-6">
            <Clock className="h-8 w-8 text-muted-foreground/60 mx-auto" />
            <p className="text-sm font-serif font-semibold text-foreground">
              No Open Slots on this Date
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              The practitioner has no scheduled availability or all slots are booked for this day.
              Please select another date above.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Morning Slots */}
            {groupedSlots.morning.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                  Morning Sessions
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {groupedSlots.morning.map((slot) => {
                    const isSelected = selectedSlot?.startUtc === slot.startUtc;
                    return (
                      <button
                        key={slot.startUtc}
                        type="button"
                        onClick={() => onSelectSlot(slot)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/20'
                            : 'border-border/80 bg-card hover:border-primary hover:bg-primary/5 text-foreground'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>{slot.localDisplay}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Afternoon Slots */}
            {groupedSlots.afternoon.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sunset className="h-3.5 w-3.5 text-orange-500" />
                  Afternoon Sessions
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {groupedSlots.afternoon.map((slot) => {
                    const isSelected = selectedSlot?.startUtc === slot.startUtc;
                    return (
                      <button
                        key={slot.startUtc}
                        type="button"
                        onClick={() => onSelectSlot(slot)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/20'
                            : 'border-border/80 bg-card hover:border-primary hover:bg-primary/5 text-foreground'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>{slot.localDisplay}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Evening Slots */}
            {groupedSlots.evening.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Moon className="h-3.5 w-3.5 text-indigo-500" />
                  Evening Sessions
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {groupedSlots.evening.map((slot) => {
                    const isSelected = selectedSlot?.startUtc === slot.startUtc;
                    return (
                      <button
                        key={slot.startUtc}
                        type="button"
                        onClick={() => onSelectSlot(slot)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/20'
                            : 'border-border/80 bg-card hover:border-primary hover:bg-primary/5 text-foreground'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>{slot.localDisplay}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Slot Summary Card */}
      {selectedSlot && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-4 animate-in fade-in">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Selected Sanctuary Slot ({serviceDurationMin} mins)</span>
            </div>
            <div className="text-sm font-serif font-bold text-foreground">
              {new Date(selectedSlot.localDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}{' '}
              &bull; {selectedSlot.localDisplay}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Zone: {selectedSlot.viewerTimeZone}
            </div>
          </div>

          <Badge variant="success" className="text-xs px-2.5 py-1">
            Confirmed
          </Badge>
        </div>
      )}
    </div>
  );
}
