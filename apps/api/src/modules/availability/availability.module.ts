import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilityEngineService } from './services/availability-engine.service';
import { RedisCacheService } from './services/redis-cache.service';
import { StubCalendarSyncService } from './services/calendar-sync.service';
import { CALENDAR_SYNC_SERVICE } from './interfaces/calendar-sync.interface';

@Module({
  controllers: [AvailabilityController],
  providers: [
    AvailabilityService,
    AvailabilityEngineService,
    RedisCacheService,
    {
      provide: CALENDAR_SYNC_SERVICE,
      useClass: StubCalendarSyncService,
    },
  ],
  exports: [
    AvailabilityService,
    AvailabilityEngineService,
    RedisCacheService,
    CALENDAR_SYNC_SERVICE,
  ],
})
export class AvailabilityModule {}
