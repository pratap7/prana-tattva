import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBookingsService } from './services/admin-bookings.service';
import { AdminDisputesService } from './services/admin-disputes.service';
import { AdminPaymentsService } from './services/admin-payments.service';
import { AdminContentService } from './services/admin-content.service';
import { AdminSettingsService } from './services/admin-settings.service';
import { AdminPermissionsGuard } from './guards/admin-permissions.guard';
import { ReviewsModule } from '../reviews/reviews.module';
import { MessagingModule } from '../messaging/messaging.module';
import { getEnvConfig } from '../../config/env.config';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = getEnvConfig();
        return {
          secret: env.JWT_SECRET,
        };
      },
    }),
    ReviewsModule,
    MessagingModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminBookingsService,
    AdminDisputesService,
    AdminPaymentsService,
    AdminContentService,
    AdminSettingsService,
    AdminPermissionsGuard,
  ],
  exports: [
    AdminDashboardService,
    AdminUsersService,
    AdminBookingsService,
    AdminDisputesService,
    AdminPaymentsService,
    AdminContentService,
    AdminSettingsService,
  ],
})
export class AdminModule {}
