import { Injectable, Logger } from '@nestjs/common';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class PushGateway {
  private readonly logger = new Logger(PushGateway.name);

  async sendPushNotification(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: PushNotificationPayload,
  ): Promise<boolean> {
    this.logger.log(
      `[PushGateway] Dispatching web push to ${subscription.endpoint.substring(0, 40)}... | Title: "${payload.title}"`,
    );
    return true;
  }
}
