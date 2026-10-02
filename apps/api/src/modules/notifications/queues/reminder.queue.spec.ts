/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ReminderQueueService } from './reminder.queue';
import { prisma } from '@project-nirvana/db';

jest.mock('@project-nirvana/db', () => ({
  prisma: {
    scheduledReminder: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('ReminderQueueService - BullMQ Scheduled Reminders Lifecycle', () => {
  let service: ReminderQueueService;

  const mockBookingId = 'booking-reminder-test-1';
  const now = Date.now();
  // 3 days in the future
  const startAt = new Date(now + 3 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReminderQueueService],
    }).compile();

    service = module.get<ReminderQueueService>(ReminderQueueService);

    jest.clearAllMocks();
  });

  describe('Reminder Scheduling (24h, 1h, Review Request)', () => {
    it('should schedule 24h, 1h, and review request reminders and persist them to DB', async () => {
      (prisma.scheduledReminder.create as jest.Mock).mockImplementation((args) => ({
        id: 'rem-id-1',
        ...args.data,
      }));

      const res = await service.scheduleSessionReminders({
        id: mockBookingId,
        startAt,
        endAt,
        consumerId: 'cons-1',
        providerId: 'prov-1',
        serviceTitle: 'Sound Healing Bath',
      });

      expect(res.scheduledCount).toBe(3);
      expect(res.jobIds.length).toBe(3);

      // Verify DB creation called for 24h, 1h, and review request
      expect(prisma.scheduledReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId: mockBookingId,
            type: 'SESSION_REMINDER_24H',
            status: 'SCHEDULED',
          }),
        }),
      );
      expect(prisma.scheduledReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId: mockBookingId,
            type: 'SESSION_REMINDER_1H',
            status: 'SCHEDULED',
          }),
        }),
      );
      expect(prisma.scheduledReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId: mockBookingId,
            type: 'REVIEW_REQUEST',
            status: 'SCHEDULED',
          }),
        }),
      );
    });
  });

  describe('Cancellation (Old Jobs Removed)', () => {
    it('should cancel and remove all pending BullMQ reminder jobs on booking cancellation', async () => {
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'rem-1',
          bookingId: mockBookingId,
          jobId: 'job_24h_1',
          type: 'SESSION_REMINDER_24H',
          status: 'SCHEDULED',
        },
        {
          id: 'rem-2',
          bookingId: mockBookingId,
          jobId: 'job_1h_1',
          type: 'SESSION_REMINDER_1H',
          status: 'SCHEDULED',
        },
      ]);

      (prisma.scheduledReminder.update as jest.Mock).mockResolvedValue({});

      const res = await service.cancelSessionReminders(mockBookingId);

      expect(res.cancelledCount).toBe(2);
      expect(prisma.scheduledReminder.update).toHaveBeenCalledWith({
        where: { id: 'rem-1' },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.scheduledReminder.update).toHaveBeenCalledWith({
        where: { id: 'rem-2' },
        data: { status: 'CANCELLED' },
      });
    });
  });

  describe('Rescheduling (Old Jobs Removed & New Jobs Created)', () => {
    it('should cancel old jobs first, then schedule new reminder jobs for updated session time', async () => {
      // Mock existing jobs to cancel
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'old-rem-1',
          bookingId: mockBookingId,
          jobId: 'old-job-1',
          status: 'SCHEDULED',
        },
      ]);
      (prisma.scheduledReminder.update as jest.Mock).mockResolvedValue({});
      (prisma.scheduledReminder.create as jest.Mock).mockResolvedValue({});

      // Shift appointment by +2 days
      const newStartAt = new Date(startAt.getTime() + 2 * 24 * 60 * 60 * 1000);
      const newEndAt = new Date(newStartAt.getTime() + 60 * 60 * 1000);

      const res = await service.rescheduleSessionReminders({
        id: mockBookingId,
        startAt: newStartAt,
        endAt: newEndAt,
        consumerId: 'cons-1',
        providerId: 'prov-1',
        serviceTitle: 'Sound Healing Bath',
      });

      // Verify old job was cancelled
      expect(res.cancelledCount).toBe(1);
      expect(prisma.scheduledReminder.update).toHaveBeenCalledWith({
        where: { id: 'old-rem-1' },
        data: { status: 'CANCELLED' },
      });

      // Verify new jobs were scheduled
      expect(res.scheduledCount).toBe(3);
      expect(prisma.scheduledReminder.create).toHaveBeenCalledTimes(3);
    });
  });
});
