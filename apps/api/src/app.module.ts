import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { getPinoLoggerConfig } from './common/logger/pino-logger.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationModule } from './modules/notification/notification.module';
import { StorageModule } from './modules/storage/storage.module';
import { PayoutModule } from './modules/payout/payout.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { VerificationModule } from './modules/verification/verification.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { ServicesModule } from './modules/services/services.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { SearchModule } from './modules/search/search.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    LoggerModule.forRoot(getPinoLoggerConfig()),
    EventEmitterModule.forRoot(),
    HealthModule,
    AuditModule,
    AuthModule,
    NotificationModule,
    StorageModule,
    PayoutModule,
    OnboardingModule,
    VerificationModule,
    ProvidersModule,
    ServicesModule,
    AvailabilityModule,
    SearchModule,
    BookingsModule,
    PaymentsModule,
    SessionsModule,
    MessagingModule,
    NotificationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
