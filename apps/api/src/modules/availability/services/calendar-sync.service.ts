import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ICalendarSyncService, CalendarTimeInterval } from '../interfaces/calendar-sync.interface';

@Injectable()
export class StubCalendarSyncService implements ICalendarSyncService {
  private readonly logger = new Logger(StubCalendarSyncService.name);

  // In-memory registry for testing and stubbing external events
  private readonly stubBusyBlocks = new Map<string, CalendarTimeInterval[]>();

  async getBusyTimes(
    providerId: string,
    startUtc: DateTime,
    endUtc: DateTime,
  ): Promise<CalendarTimeInterval[]> {
    this.logger.debug(
      `Checking external calendar busy blocks for provider ${providerId} between ${startUtc.toISO()} and ${endUtc.toISO()}`,
    );

    const blocks = this.stubBusyBlocks.get(providerId) || [];
    return blocks.filter((b) => b.end > startUtc && b.start < endUtc);
  }

  /**
   * Test helper to inject simulated Google Calendar busy blocks
   */
  addStubBusyBlock(providerId: string, block: CalendarTimeInterval): void {
    const list = this.stubBusyBlocks.get(providerId) || [];
    list.push(block);
    this.stubBusyBlocks.set(providerId, list);
  }

  clearStubBusyBlocks(providerId?: string): void {
    if (providerId) {
      this.stubBusyBlocks.delete(providerId);
    } else {
      this.stubBusyBlocks.clear();
    }
  }
}
