import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { prisma } from '@project-nirvana/db';
import { getEnvConfig } from '../../../config/env.config';

export interface ReminderJobData {
  bookingId: string;
  type: 'SESSION_REMINDER_24H' | 'SESSION_REMINDER_1H' | 'REVIEW_REQUEST';
  consumerId: string;
  providerId: string;
  serviceTitle: string;
  sessionTime: string;
}

@Injectable()
export class ReminderQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderQueueService.name);
  private queue: Queue<ReminderJobData> | null = null;
  private isRedisConnected = false;

  async onModuleInit() {
    try {
      const config = getEnvConfig();
      const url = new URL(config.REDIS_URL);
      this.queue = new Queue<ReminderJobData>('reminders', {
        connection: {
          host: url.hostname || 'localhost',
          port: Number(url.port) || 6379,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        },
      });
      this.isRedisConnected = true;
      this.logger.log('ReminderQueueService initialized with BullMQ');
    } catch (err: unknown) {
      this.logger.warn(
        `BullMQ Redis unavailable, running in DB-persisted mode: ${(err as Error).message}`,
      );
      this.queue = null;
    }
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close().catch(() => {});
    }
  }

  /**
   * Schedules BullMQ reminders for a confirmed booking:
   * 1. 24 hours prior to session start
   * 2. 1 hour prior to session start
   * 3. 15 minutes after session completion for review request
   */
  async scheduleSessionReminders(booking: {
    id: string;
    startAt: Date;
    endAt: Date;
    consumerId: string;
    providerId: string;
    serviceTitle: string;
  }): Promise<{ scheduledCount: number; jobIds: string[] }> {
    const now = Date.now();
    const startTime = booking.startAt.getTime();
    const endTime = booking.endAt.getTime();

    const remindersToSchedule = [
      {
        type: 'SESSION_REMINDER_24H' as const,
        triggerAt: new Date(startTime - 24 * 60 * 60 * 1000),
        delay: Math.max(0, startTime - 24 * 60 * 60 * 1000 - now),
      },
      {
        type: 'SESSION_REMINDER_1H' as const,
        triggerAt: new Date(startTime - 60 * 60 * 1000),
        delay: Math.max(0, startTime - 60 * 60 * 1000 - now),
      },
      {
        type: 'REVIEW_REQUEST' as const,
        triggerAt: new Date(endTime + 15 * 60 * 1000),
        delay: Math.max(0, endTime + 15 * 60 * 1000 - now),
      },
    ];

    const jobIds: string[] = [];

    for (const item of remindersToSchedule) {
      // Only schedule if trigger time is in the future
      if (item.triggerAt.getTime() > now) {
        const jobId = `job_${item.type.toLowerCase()}_${booking.id}_${Date.now()}`;
        jobIds.push(jobId);

        // 1. Add to BullMQ queue if queue connected
        if (this.queue) {
          try {
            await this.queue.add(
              item.type,
              {
                bookingId: booking.id,
                type: item.type,
                consumerId: booking.consumerId,
                providerId: booking.providerId,
                serviceTitle: booking.serviceTitle,
                sessionTime: booking.startAt.toISOString(),
              },
              {
                delay: item.delay,
                jobId,
                removeOnComplete: true,
                removeOnFail: false,
              },
            );
          } catch (err) {
            this.logger.warn(`Failed to enqueue BullMQ job ${jobId}: ${(err as Error).message}`);
          }
        }

        // 2. Persist in ScheduledReminder table
        await prisma.scheduledReminder.create({
          data: {
            bookingId: booking.id,
            jobId,
            type: item.type,
            triggerAt: item.triggerAt,
            status: 'SCHEDULED',
          },
        });

        this.logger.log(
          `Scheduled reminder ${item.type} for booking ${booking.id} at ${item.triggerAt.toISOString()}`,
        );
      }
    }

    return { scheduledCount: jobIds.length, jobIds };
  }

  /**
   * Cancels and removes all pending BullMQ reminder jobs for a booking (e.g. on cancellation).
   */
  async cancelSessionReminders(bookingId: string): Promise<{ cancelledCount: number }> {
    const activeReminders = await prisma.scheduledReminder.findMany({
      where: {
        bookingId,
        status: 'SCHEDULED',
      },
    });

    for (const rem of activeReminders) {
      // Remove from BullMQ queue
      if (this.queue) {
        try {
          const job = await this.queue.getJob(rem.jobId);
          if (job) {
            await job.remove();
            this.logger.log(`Removed BullMQ job ${rem.jobId} for cancelled booking ${bookingId}`);
          }
        } catch (err) {
          this.logger.warn(`Could not remove BullMQ job ${rem.jobId}: ${(err as Error).message}`);
        }
      }

      // Mark cancelled in DB
      await prisma.scheduledReminder.update({
        where: { id: rem.id },
        data: { status: 'CANCELLED' },
      });
    }

    this.logger.log(
      `Cancelled ${activeReminders.length} scheduled reminders for booking ${bookingId}`,
    );
    return { cancelledCount: activeReminders.length };
  }

  /**
   * Reschedules session reminders:
   * 1. Removes all existing scheduled jobs.
   * 2. Schedules new jobs matching the new session start and end times.
   */
  async rescheduleSessionReminders(booking: {
    id: string;
    startAt: Date;
    endAt: Date;
    consumerId: string;
    providerId: string;
    serviceTitle: string;
  }): Promise<{ cancelledCount: number; scheduledCount: number }> {
    this.logger.log(`Rescheduling reminders for booking ${booking.id}`);
    const { cancelledCount } = await this.cancelSessionReminders(booking.id);
    const { scheduledCount } = await this.scheduleSessionReminders(booking);
    return { cancelledCount, scheduledCount };
  }
}
