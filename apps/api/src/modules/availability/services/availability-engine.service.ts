import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Weekday, AvailableSlot } from '@project-nirvana/shared';
import { CalendarTimeInterval } from '../interfaces/calendar-sync.interface';

export interface TimeSlotInterval {
  start: DateTime; // Must be UTC
  end: DateTime; // Must be UTC
}

export interface RuleModel {
  id?: string;
  weekday: Weekday;
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  providerTimeZone: string;
  isActive: boolean;
}

export interface ExceptionModel {
  id?: string;
  startAt: Date;
  endAt: Date;
  isBlocked: boolean;
  reason?: string | null;
}

export interface BookingModel {
  id: string;
  startAt: Date;
  endAt: Date;
  status: string;
  slotLockExpiresAt?: Date | null;
}

export interface SlotEngineParams {
  providerTimeZone: string;
  rules: RuleModel[];
  exceptions: ExceptionModel[];
  bookings: BookingModel[];
  calendarBusyTimes: CalendarTimeInterval[];
  serviceDurationMin: number;
  bufferMinutes: number;
  minNoticeHours: number;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  viewerTimeZone: string;
  referenceNowUtc?: DateTime; // Injected for deterministic testing
}

const LUXON_WEEKDAY_MAP: Record<number, Weekday> = {
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
  7: 'SUNDAY',
};

@Injectable()
export class AvailabilityEngineService {
  private readonly logger = new Logger(AvailabilityEngineService.name);

  /**
   * Main entry point: Generates all valid, non-overlapping booking slots
   */
  generateSlots(params: SlotEngineParams): AvailableSlot[] {
    const {
      providerTimeZone,
      rules,
      exceptions,
      bookings,
      calendarBusyTimes,
      serviceDurationMin,
      bufferMinutes,
      minNoticeHours,
      startDate,
      endDate,
      viewerTimeZone,
      referenceNowUtc = DateTime.utc(),
    } = params;

    // 1. Expand recurring weekly rules to concrete UTC intervals
    let availableIntervals = this.expandWeeklyRulesToUtc({
      startDate,
      endDate,
      rules,
      providerTimeZone,
      viewerTimeZone,
    });

    // 2. Subtract blocked exceptions and add extra-slot exceptions
    availableIntervals = this.applyExceptions(availableIntervals, exceptions);

    // 3. Subtract bookings (including rest buffers and unexpired slot locks)
    availableIntervals = this.subtractBookingsAndBuffers(
      availableIntervals,
      bookings,
      bufferMinutes,
      referenceNowUtc,
    );

    // 4. Subtract external calendar busy times
    availableIntervals = this.subtractCalendarBusyTimes(
      availableIntervals,
      calendarBusyTimes,
      bufferMinutes,
    );

    // 5. Apply minimum booking notice
    availableIntervals = this.applyMinimumNotice(
      availableIntervals,
      minNoticeHours,
      referenceNowUtc,
    );

    // 6. Slice available continuous intervals into service-duration slots
    const rawSlots = this.sliceIntoSlots(
      availableIntervals,
      serviceDurationMin,
      startDate,
      endDate,
      viewerTimeZone,
    );

    // 7. Format into viewer's local representation and return
    return this.formatSlots(rawSlots, viewerTimeZone);
  }

  /**
   * Expands weekly rules across the requested date window.
   * Handles DST transitions (spring-forward and fall-back) and midnight-crossing shifts.
   */
  expandWeeklyRulesToUtc(params: {
    startDate: string;
    endDate: string;
    rules: RuleModel[];
    providerTimeZone: string;
    viewerTimeZone: string;
  }): TimeSlotInterval[] {
    const { startDate, endDate, rules, providerTimeZone, viewerTimeZone } = params;

    const activeRules = rules.filter((r) => r.isActive);
    if (activeRules.length === 0) {
      return [];
    }

    // Determine query date range in viewer's zone
    const queryStartViewer = DateTime.fromISO(startDate, { zone: viewerTimeZone }).startOf('day');
    const queryEndViewer = DateTime.fromISO(endDate, { zone: viewerTimeZone }).endOf('day');

    // To ensure timezone boundary safety (e.g. UTC+5:30 vs UTC-8), expand calendar search range
    // by 2 days in the provider's local time zone.
    const searchStartProvider = queryStartViewer
      .setZone(providerTimeZone)
      .minus({ days: 2 })
      .startOf('day');
    const searchEndProvider = queryEndViewer
      .setZone(providerTimeZone)
      .plus({ days: 2 })
      .endOf('day');

    const intervals: TimeSlotInterval[] = [];

    let currentDay = searchStartProvider;
    while (currentDay <= searchEndProvider) {
      const weekdayName = LUXON_WEEKDAY_MAP[currentDay.weekday];
      const dayRules = activeRules.filter((r) => r.weekday === weekdayName);

      for (const rule of dayRules) {
        const zone = rule.providerTimeZone || providerTimeZone;
        const [startH, startM] = rule.startTime.split(':').map(Number);
        const [endH, endM] = rule.endTime.split(':').map(Number);

        // Build localized DateTime in provider's zone
        // Luxon correctly handles daylight saving shifts (spring forward skips, fall back overlaps)
        const localStart = DateTime.fromObject(
          {
            year: currentDay.year,
            month: currentDay.month,
            day: currentDay.day,
            hour: startH,
            minute: startM,
            second: 0,
            millisecond: 0,
          },
          { zone },
        );

        let localEnd: DateTime;
        // Check for midnight-crossing slot (e.g., 22:00 to 02:00)
        if (endH < startH || (endH === startH && endM < startM)) {
          // Span into the next day
          localEnd = DateTime.fromObject(
            {
              year: currentDay.year,
              month: currentDay.month,
              day: currentDay.day,
              hour: endH,
              minute: endM,
              second: 0,
              millisecond: 0,
            },
            { zone },
          ).plus({ days: 1 });
        } else {
          localEnd = DateTime.fromObject(
            {
              year: currentDay.year,
              month: currentDay.month,
              day: currentDay.day,
              hour: endH,
              minute: endM,
              second: 0,
              millisecond: 0,
            },
            { zone },
          );
        }

        const startUtc = localStart.toUTC();
        const endUtc = localEnd.toUTC();

        if (startUtc < endUtc) {
          intervals.push({ start: startUtc, end: endUtc });
        }
      }

      currentDay = currentDay.plus({ days: 1 });
    }

    return this.mergeIntervals(intervals);
  }

  /**
   * Applies exceptions: subtracts blocked days/vacations and merges extra-slot windows
   */
  applyExceptions(
    baseIntervals: TimeSlotInterval[],
    exceptions: ExceptionModel[],
  ): TimeSlotInterval[] {
    let current = [...baseIntervals];

    // 1. Subtract blocked exceptions
    const blockedExceptions = exceptions
      .filter((e) => e.isBlocked)
      .map((e) => ({
        start: DateTime.fromJSDate(e.startAt, { zone: 'utc' }),
        end: DateTime.fromJSDate(e.endAt, { zone: 'utc' }),
      }))
      .filter((i) => i.start < i.end);

    current = this.subtractIntervals(current, blockedExceptions);

    // 2. Add extra-slot exceptions
    const extraSlots = exceptions
      .filter((e) => !e.isBlocked)
      .map((e) => ({
        start: DateTime.fromJSDate(e.startAt, { zone: 'utc' }),
        end: DateTime.fromJSDate(e.endAt, { zone: 'utc' }),
      }))
      .filter((i) => i.start < i.end);

    current.push(...extraSlots);

    return this.mergeIntervals(current);
  }

  /**
   * Subtracts existing bookings, slot locks, and session buffers
   */
  subtractBookingsAndBuffers(
    baseIntervals: TimeSlotInterval[],
    bookings: BookingModel[],
    bufferMinutes: number,
    nowUtc: DateTime,
  ): TimeSlotInterval[] {
    const blockingWindows: TimeSlotInterval[] = [];

    for (const b of bookings) {
      // Ignore cancelled or refunded bookings
      if (
        b.status === 'CANCELLED_BY_CONSUMER' ||
        b.status === 'CANCELLED_BY_PROVIDER' ||
        b.status === 'REFUNDED'
      ) {
        continue;
      }

      // Check slot lock expiration for PENDING_PAYMENT bookings
      if (b.status === 'PENDING_PAYMENT') {
        if (b.slotLockExpiresAt) {
          const expiresAtUtc = DateTime.fromJSDate(b.slotLockExpiresAt, { zone: 'utc' });
          if (expiresAtUtc <= nowUtc) {
            // Lock has expired; do not block slot
            continue;
          }
        }
      }

      const bookingStart = DateTime.fromJSDate(b.startAt, { zone: 'utc' });
      const bookingEnd = DateTime.fromJSDate(b.endAt, { zone: 'utc' });

      // Apply rest buffer on both sides of the booking so back-to-back sessions
      // cannot violate the mandatory rest buffer
      const effectiveStart = bookingStart.minus({ minutes: bufferMinutes });
      const effectiveEnd = bookingEnd.plus({ minutes: bufferMinutes });

      if (effectiveStart < effectiveEnd) {
        blockingWindows.push({ start: effectiveStart, end: effectiveEnd });
      }
    }

    return this.subtractIntervals(baseIntervals, blockingWindows);
  }

  /**
   * Subtracts external calendar busy times with rest buffer
   */
  subtractCalendarBusyTimes(
    baseIntervals: TimeSlotInterval[],
    busyTimes: CalendarTimeInterval[],
    bufferMinutes: number,
  ): TimeSlotInterval[] {
    const blockingWindows: TimeSlotInterval[] = busyTimes.map((b) => ({
      start: b.start.toUTC().minus({ minutes: bufferMinutes }),
      end: b.end.toUTC().plus({ minutes: bufferMinutes }),
    }));

    return this.subtractIntervals(baseIntervals, blockingWindows);
  }

  /**
   * Filters out any availability that starts before the minimum booking notice
   */
  applyMinimumNotice(
    baseIntervals: TimeSlotInterval[],
    minNoticeHours: number,
    nowUtc: DateTime,
  ): TimeSlotInterval[] {
    const cutoff = nowUtc.plus({ hours: minNoticeHours });

    return baseIntervals
      .map((interval) => {
        if (interval.end <= cutoff) {
          return null; // Entire interval is before notice cutoff
        }
        if (interval.start < cutoff) {
          // Truncate start to cutoff
          return { start: cutoff, end: interval.end };
        }
        return interval;
      })
      .filter((i): i is TimeSlotInterval => i !== null && i.start < i.end);
  }

  /**
   * Slices open continuous intervals into discrete slots matching the service duration
   */
  sliceIntoSlots(
    intervals: TimeSlotInterval[],
    durationMin: number,
    startDateStr: string,
    endDateStr: string,
    viewerTimeZone: string,
  ): TimeSlotInterval[] {
    const slots: TimeSlotInterval[] = [];

    // Step size for slot increments:
    // If duration <= 30 min, step by 15 min; otherwise step by 30 min (or duration)
    const stepMin = durationMin <= 30 ? 15 : durationMin % 30 === 0 ? 30 : 15;

    for (const interval of intervals) {
      let cursor = interval.start;

      while (cursor.plus({ minutes: durationMin }) <= interval.end) {
        const slotEnd = cursor.plus({ minutes: durationMin });

        // Check if slot falls within viewer's requested date window
        const slotLocal = cursor.setZone(viewerTimeZone);
        const slotLocalDate = slotLocal.toFormat('yyyy-MM-dd');

        if (slotLocalDate >= startDateStr && slotLocalDate <= endDateStr) {
          slots.push({
            start: cursor,
            end: slotEnd,
          });
        }

        cursor = cursor.plus({ minutes: stepMin });
      }
    }

    return slots;
  }

  /**
   * Formats slots into UTC and the viewer's local representation
   */
  formatSlots(slots: TimeSlotInterval[], viewerTimeZone: string): AvailableSlot[] {
    return slots.map((slot) => {
      const viewerStart = slot.start.setZone(viewerTimeZone);
      const viewerEnd = slot.end.setZone(viewerTimeZone);

      return {
        startUtc: slot.start.toUTC().toISO() || '',
        endUtc: slot.end.toUTC().toISO() || '',
        localStart: viewerStart.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
        localEnd: viewerEnd.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
        localDisplay: `${viewerStart.toFormat('hh:mm a')} – ${viewerEnd.toFormat('hh:mm a')}`,
        localDate: viewerStart.toFormat('yyyy-MM-dd'),
        viewerTimeZone,
      };
    });
  }

  // ==========================================================================
  // INTERVAL MATHEMATICS UTILITIES
  // ==========================================================================

  /**
   * Merges overlapping or adjacent intervals, sorted by start time
   */
  mergeIntervals(intervals: TimeSlotInterval[]): TimeSlotInterval[] {
    if (intervals.length <= 1) return [...intervals];

    const sorted = [...intervals].sort((a, b) => a.start.toMillis() - b.start.toMillis());
    const merged: TimeSlotInterval[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (current.start <= last.end) {
        // Overlapping or adjacent: expand last interval end if current is longer
        if (current.end > last.end) {
          last.end = current.end;
        }
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Subtracts a list of intervals from another list of intervals
   */
  subtractIntervals(bases: TimeSlotInterval[], toSubtract: TimeSlotInterval[]): TimeSlotInterval[] {
    let result = [...bases];

    for (const sub of toSubtract) {
      const nextResult: TimeSlotInterval[] = [];
      for (const base of result) {
        const split = this.subtractSingleInterval(base, sub);
        nextResult.push(...split);
      }
      result = nextResult;
    }

    return result;
  }

  /**
   * Subtracts interval B from interval A (half-open: [start, end))
   */
  subtractSingleInterval(a: TimeSlotInterval, b: TimeSlotInterval): TimeSlotInterval[] {
    // No intersection
    if (b.end <= a.start || b.start >= a.end) {
      return [a];
    }

    // B completely covers A
    if (b.start <= a.start && b.end >= a.end) {
      return [];
    }

    // B cuts into left side of A
    if (b.start <= a.start && b.end < a.end) {
      return [{ start: b.end, end: a.end }];
    }

    // B cuts into right side of A
    if (b.start > a.start && b.end >= a.end) {
      return [{ start: a.start, end: b.start }];
    }

    // B splits A into two parts
    if (b.start > a.start && b.end < a.end) {
      return [
        { start: a.start, end: b.start },
        { start: b.end, end: a.end },
      ];
    }

    return [a];
  }
}
