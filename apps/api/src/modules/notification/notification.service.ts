import { Injectable, Logger } from '@nestjs/common';
import { prisma, Notification } from '@project-nirvana/db';

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async send(params: CreateNotificationParams): Promise<Notification | null> {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          data: params.data ? JSON.parse(JSON.stringify(params.data)) : undefined,
        },
      });

      this.logger.log(
        `🔔 Notification sent to user ${params.userId}: [${params.type}] ${params.title}`,
      );

      return notification;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to create notification for user ${params.userId}: ${msg}`);
      return null;
    }
  }

  async listForUser(userId: string, limit = 20): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }
}
