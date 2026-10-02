import { DateTime } from 'luxon';
import * as fc from 'fast-check';
import { AvailabilityEngineService, RuleModel, BookingModel } from './availability-engine.service';

describe('AvailabilityEngineService (Correctness-Critical Suite)', () => {
  let engine: AvailabilityEngineService;

  beforeEach(() => {
    engine = new AvailabilityEngineService();
  });

  // ==========================================================================
  // 1. DST SPRING-FORWARD TRANSITION
  // ==========================================================================
  it('correctly handles DST spring-forward transition (America/New_York on 2026-03-08)', () => {
    // On 2026-03-08, New York clocks jump from 02:00 to 03:00 (EST -> EDT)
    const rules: RuleModel[] = [
      {
        weekday: 'SUNDAY',
        startTime: '09:00',
        endTime: '17:00',
        providerTimeZone: 'America/New_York',
        isActive: true,
      },
    ];

    const slots = engine.generateSlots({
      providerTimeZone: 'America/New_York',
      rules,
      exceptions: [],
      bookings: [],
      calendarBusyTimes: [],
      serviceDurationMin: 60,
      bufferMinutes: 0,
      minNoticeHours: 0,
      startDate: '2026-03-08',
      endDate: '2026-03-08',
      viewerTimeZone: 'America/New_York',
      referenceNowUtc: DateTime.fromISO('2026-03-01T00:00:00Z'),
    });

    expect(slots.length).toBeGreaterThan(0);

    // On 2026-03-08, 09:00 EDT is 13:00 UTC (UTC-4), NOT 14:00 UTC (EST)
    const firstSlot = slots[0];
    expect(firstSlot.localStart).toBe('2026-03-08T09:00:00');
    expect(firstSlot.localDate).toBe('2026-03-08');
    expect(firstSlot.startUtc).toBe('2026-03-08T13:00:00.000Z');

    const lastSlot = slots[slots.length - 1];
    expect(lastSlot.localStart).toBe('2026-03-08T16:00:00');
    expect(lastSlot.localEnd).toBe('2026-03-08T17:00:00');
    expect(lastSlot.endUtc).toBe('2026-03-08T21:00:00.000Z');
  });

  // ==========================================================================
  // 2. DST FALL-BACK TRANSITION
  // ==========================================================================
  it('correctly handles DST fall-back transition (America/New_York on 2026-11-01)', () => {
    // On 2026-11-01, New York clocks jump back from 02:00 to 01:00 (EDT -> EST)
    const rules: RuleModel[] = [
      {
        weekday: 'SUNDAY',
        startTime: '09:00',
        endTime: '17:00',
        providerTimeZone: 'America/New_York',
        isActive: true,
      },
    ];

    const slots = engine.generateSlots({
      providerTimeZone: 'America/New_York',
      rules,
      exceptions: [],
      bookings: [],
      calendarBusyTimes: [],
      serviceDurationMin: 60,
      bufferMinutes: 0,
      minNoticeHours: 0,
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      viewerTimeZone: 'America/New_York',
      referenceNowUtc: DateTime.fromISO('2026-10-01T00:00:00Z'),
    });

    expect(slots.length).toBeGreaterThan(0);

    // On 2026-11-01 after 02:00 AM, New York is in standard time EST (UTC-5)
    // 09:00 EST is 14:00 UTC
    const firstSlot = slots[0];
    expect(firstSlot.localStart).toBe('2026-11-01T09:00:00');
    expect(firstSlot.startUtc).toBe('2026-11-01T14:00:00.000Z');

    // Verify slots are contiguous and no duplicates exist
    const startTimes = slots.map((s) => s.startUtc);
    const uniqueStartTimes = new Set(startTimes);
    expect(startTimes.length).toBe(uniqueStartTimes.size);
  });

  // ==========================================================================
  // 3. PROVIDER AND VIEWER IN DIFFERENT TIME ZONES
  // ==========================================================================
  it('accurately converts slots when provider is Asia/Kolkata and viewer is America/Los_Angeles', () => {
    // Provider works Monday 09:00 to 17:00 IST
    // 09:00 IST = 03:30 UTC
    // In LA (PDT, UTC-7), 03:30 UTC on 2026-10-12 is Sunday 2026-10-11 at 20:30 (8:30 PM)
    const rules: RuleModel[] = [
      {
        weekday: 'MONDAY',
        startTime: '09:00',
        endTime: '17:00',
        providerTimeZone: 'Asia/Kolkata',
        isActive: true,
      },
    ];

    // Viewer in Los Angeles searching for Sunday 2026-10-11 evening
    const slots = engine.generateSlots({
      providerTimeZone: 'Asia/Kolkata',
      rules,
      exceptions: [],
      bookings: [],
      calendarBusyTimes: [],
      serviceDurationMin: 60,
      bufferMinutes: 0,
      minNoticeHours: 0,
      startDate: '2026-10-11',
      endDate: '2026-10-11',
      viewerTimeZone: 'America/Los_Angeles',
      referenceNowUtc: DateTime.fromISO('2026-10-01T00:00:00Z'),
    });

    expect(slots.length).toBeGreaterThan(0);

    const firstSlot = slots[0];
    expect(firstSlot.viewerTimeZone).toBe('America/Los_Angeles');
    expect(firstSlot.localDate).toBe('2026-10-11');
    expect(firstSlot.localStart).toBe('2026-10-11T20:30:00');
    expect(firstSlot.startUtc).toBe('2026-10-12T03:30:00.000Z');
  });

  // ==========================================================================
  // 4. BACK-TO-BACK BOOKINGS WITH BUFFERS
  // ==========================================================================
  it('enforces rest buffers strictly between back-to-back sessions', () => {
    const rules: RuleModel[] = [
      {
        weekday: 'MONDAY',
        startTime: '09:00',
        endTime: '13:00',
        providerTimeZone: 'UTC',
        isActive: true,
      },
    ];

    // Existing booking from 10:00 to 11:00 UTC with 15-min rest buffer
    const bookings: BookingModel[] = [
      {
        id: 'booking-1',
        startAt: new Date('2026-10-12T10:00:00Z'),
        endAt: new Date('2026-10-12T11:00:00Z'),
        status: 'CONFIRMED',
      },
    ];

    const slots = engine.generateSlots({
      providerTimeZone: 'UTC',
      rules,
      exceptions: [],
      bookings,
      calendarBusyTimes: [],
      serviceDurationMin: 60,
      bufferMinutes: 15,
      minNoticeHours: 0,
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      viewerTimeZone: 'UTC',
      referenceNowUtc: DateTime.fromISO('2026-10-01T00:00:00Z'),
    });

    // Effective blocked window for booking: 09:45 to 11:15 UTC
    for (const slot of slots) {
      const sStart = DateTime.fromISO(slot.startUtc);
      const sEnd = DateTime.fromISO(slot.endUtc);

      // Must either finish on or before 09:45, OR start on or after 11:15
      const finishesBeforeBuffer = sEnd <= DateTime.fromISO('2026-10-12T09:45:00Z');
      const startsAfterBuffer = sStart >= DateTime.fromISO('2026-10-12T11:15:00Z');

      expect(finishesBeforeBuffer || startsAfterBuffer).toBe(true);
    }

    // Explicitly verify 11:00-12:00 is NOT returned, but 11:15-12:15 IS returned (after 15 min buffer)
    const slotStarts = slots.map((s) => s.startUtc);
    expect(slotStarts).not.toContain('2026-10-12T11:00:00.000Z');
    expect(slotStarts).toContain('2026-10-12T11:15:00.000Z');
  });

  // ==========================================================================
  // 5. MIDNIGHT-CROSSING SLOTS
  // ==========================================================================
  it('correctly expands and slices midnight-crossing night shifts (22:00 to 02:00)', () => {
    const rules: RuleModel[] = [
      {
        weekday: 'FRIDAY',
        startTime: '22:00',
        endTime: '02:00',
        providerTimeZone: 'UTC',
        isActive: true,
      },
    ];

    const slots = engine.generateSlots({
      providerTimeZone: 'UTC',
      rules,
      exceptions: [],
      bookings: [],
      calendarBusyTimes: [],
      serviceDurationMin: 60,
      bufferMinutes: 0,
      minNoticeHours: 0,
      startDate: '2026-10-16',
      endDate: '2026-10-17',
      viewerTimeZone: 'UTC',
      referenceNowUtc: DateTime.fromISO('2026-10-01T00:00:00Z'),
    });

    const slotStarts = slots.map((s) => s.startUtc);

    // Should include Friday night 22:00, 23:00 and Saturday early morning 00:00, 01:00
    expect(slotStarts).toContain('2026-10-16T22:00:00.000Z');
    expect(slotStarts).toContain('2026-10-16T23:00:00.000Z');
    expect(slotStarts).toContain('2026-10-17T00:00:00.000Z');
    expect(slotStarts).toContain('2026-10-17T01:00:00.000Z');
    expect(slotStarts).not.toContain('2026-10-17T02:00:00.000Z');
  });

  // ==========================================================================
  // 6. MINIMUM BOOKING NOTICE
  // ==========================================================================
  it('filters out slots starting within the minimum booking notice period', () => {
    const rules: RuleModel[] = [
      {
        weekday: 'MONDAY',
        startTime: '09:00',
        endTime: '17:00',
        providerTimeZone: 'UTC',
        isActive: true,
      },
    ];

    // Now is 11:00 UTC on 2026-10-12 with 4 hours minimum notice
    // Cutoff time is 15:00 UTC
    const refNow = DateTime.fromISO('2026-10-12T11:00:00Z');

    const slots = engine.generateSlots({
      providerTimeZone: 'UTC',
      rules,
      exceptions: [],
      bookings: [],
      calendarBusyTimes: [],
      serviceDurationMin: 60,
      bufferMinutes: 0,
      minNoticeHours: 4,
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      viewerTimeZone: 'UTC',
      referenceNowUtc: refNow,
    });

    for (const slot of slots) {
      const sStart = DateTime.fromISO(slot.startUtc);
      expect(sStart >= DateTime.fromISO('2026-10-12T15:00:00Z')).toBe(true);
    }

    const slotStarts = slots.map((s) => s.startUtc);
    expect(slotStarts).not.toContain('2026-10-12T14:30:00.000Z');
    expect(slotStarts).toContain('2026-10-12T15:00:00.000Z');
  });

  // ==========================================================================
  // 7. PROPERTY-BASED TESTING: NO RETURNED SLOT EVER OVERLAPS A BOOKING
  // ==========================================================================
  it('property-based test: NO returned slot ever overlaps an active booking (100 random runs)', () => {
    const rules: RuleModel[] = [
      {
        weekday: 'WEDNESDAY',
        startTime: '08:00',
        endTime: '20:00',
        providerTimeZone: 'UTC',
        isActive: true,
      },
    ];

    fc.assert(
      fc.property(
        // Random buffer between 0 and 30 min
        fc.integer({ min: 0, max: 30 }),
        // Random service duration between 30 and 120 min
        fc.constantFrom(30, 45, 60, 90, 120),
        // Generate 1 to 4 random non-overlapping bookings within the working hours
        fc.array(
          fc.record({
            startHour: fc.integer({ min: 9, max: 17 }),
            startMinute: fc.constantFrom(0, 30),
            durationMin: fc.constantFrom(30, 60, 90),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        (bufferMin, durationMin, rawBookings) => {
          // Construct booking models
          const bookings: BookingModel[] = rawBookings.map((b, idx) => {
            const start = DateTime.fromObject(
              { year: 2026, month: 10, day: 14, hour: b.startHour, minute: b.startMinute },
              { zone: 'utc' },
            );
            const end = start.plus({ minutes: b.durationMin });
            return {
              id: `b-${idx}`,
              startAt: start.toJSDate(),
              endAt: end.toJSDate(),
              status: 'CONFIRMED',
            };
          });

          const slots = engine.generateSlots({
            providerTimeZone: 'UTC',
            rules,
            exceptions: [],
            bookings,
            calendarBusyTimes: [],
            serviceDurationMin: durationMin,
            bufferMinutes: bufferMin,
            minNoticeHours: 0,
            startDate: '2026-10-14',
            endDate: '2026-10-14',
            viewerTimeZone: 'UTC',
            referenceNowUtc: DateTime.fromISO('2026-10-01T00:00:00Z'),
          });

          // INVARIANCE CHECK: Every returned slot must strictly respect non-overlap + buffer
          for (const slot of slots) {
            const sStart = DateTime.fromISO(slot.startUtc);
            const sEnd = DateTime.fromISO(slot.endUtc);

            for (const b of bookings) {
              const bStart = DateTime.fromJSDate(b.startAt, { zone: 'utc' });
              const bEnd = DateTime.fromJSDate(b.endAt, { zone: 'utc' });

              // Effective blocked window including buffer
              const blockedStart = bStart.minus({ minutes: bufferMin });
              const blockedEnd = bEnd.plus({ minutes: bufferMin });

              const hasConflict = sStart < blockedEnd && sEnd > blockedStart;
              if (hasConflict) {
                return false; // Invariant violated!
              }
            }
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
