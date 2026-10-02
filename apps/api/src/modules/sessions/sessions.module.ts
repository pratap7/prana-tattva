import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './services/sessions.service';
import { DailyVideoGateway } from './gateways/daily-video.gateway';
import { DAILY_VIDEO_PROVIDER } from './interfaces/daily-video-provider.interface';
import { SessionBookingListener } from './listeners/session-booking.listener';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    DailyVideoGateway,
    {
      provide: DAILY_VIDEO_PROVIDER,
      useClass: DailyVideoGateway,
    },
    SessionBookingListener,
  ],
  exports: [SessionsService, DAILY_VIDEO_PROVIDER],
})
export class SessionsModule {}
