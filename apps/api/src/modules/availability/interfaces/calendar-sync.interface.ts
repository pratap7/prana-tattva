import { DateTime } from 'luxon';

export interface CalendarTimeInterval {
  start: DateTime;
  end: DateTime;
  summary?: string;
}

export interface ICalendarSyncService {
  /**
   * Retrieves busy intervals from connected external calendars (e.g. Google Calendar)
   * within the requested UTC time range.
   */
  getBusyTimes(
    providerId: string,
    startUtc: DateTime,
    endUtc: DateTime,
  ): Promise<CalendarTimeInterval[]>;
}

export const CALENDAR_SYNC_SERVICE = Symbol('CALENDAR_SYNC_SERVICE');
