import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { NotificationTemplatesService } from './services/notification-templates.service';
import { EmailGateway } from './gateways/email.gateway';
import { SmsGateway } from './gateways/sms.gateway';
import { PushGateway } from './gateways/push.gateway';
import { ReminderQueueService } from './queues/reminder.queue';
import { NotificationEventsListener } from './listeners/notification-events.listener';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationTemplatesService,
    EmailGateway,
    SmsGateway,
    PushGateway,
    ReminderQueueService,
    NotificationEventsListener,
  ],
  exports: [NotificationsService, ReminderQueueService, NotificationTemplatesService],
})
export class NotificationsModule {}
