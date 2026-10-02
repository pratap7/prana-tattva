import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './services/bookings.service';
import { RedisLockService } from './services/redis-lock.service';
import { BookingQueueService } from './services/booking-queue.service';
import {
  BookingNotificationListener,
  BookingLedgerListener,
  BookingAnalyticsListener,
} from './listeners/booking-event.listeners';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, NotificationModule, AuthModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    RedisLockService,
    BookingQueueService,
    BookingNotificationListener,
    BookingLedgerListener,
    BookingAnalyticsListener,
  ],
  exports: [BookingsService, RedisLockService, BookingQueueService],
})
export class BookingsModule {}
