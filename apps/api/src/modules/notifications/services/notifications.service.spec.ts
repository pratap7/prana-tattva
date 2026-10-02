/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { NotificationTemplatesService } from './notification-templates.service';
import { EmailGateway } from '../gateways/email.gateway';
import { SmsGateway } from '../gateways/sms.gateway';
import { PushGateway } from '../gateways/push.gateway';
import { prisma } from '@project-nirvana/db';

jest.mock('@project-nirvana/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notificationPreference: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    notificationDeliveryLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    pushSubscription: {
      upsert: jest.fn(),
    },
  },
}));

describe('NotificationsService & Multi-Channel Preference Enforcement', () => {
  let service: NotificationsService;
  let emailGateway: EmailGateway;
  let smsGateway: SmsGateway;
  let pushGateway: PushGateway;

  const mockUserId = 'user-seeker-101';
  const mockUser = {
    id: mockUserId,
    email: 'seeker@sanctuary.com',
    phone: '+919876543210',
    locale: 'en-US',
    notificationPreferences: [],
    pushSubscriptions: [
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/sub-123',
        p256dh: 'p256-key',
        auth: 'auth-sec',
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        NotificationTemplatesService,
        {
          provide: EmailGateway,
          useValue: {
            sendEmail: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: SmsGateway,
          useValue: {
            sendSms: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: PushGateway,
          useValue: {
            sendPushNotification: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    emailGateway = module.get<EmailGateway>(EmailGateway);
    smsGateway = module.get<SmsGateway>(SmsGateway);
    pushGateway = module.get<PushGateway>(PushGateway);

    jest.clearAllMocks();
  });

  describe('User Preference Enforcement Across Channels', () => {
    it('should dispatch across all channels when user preferences permit', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        notificationPreferences: [
          {
            type: 'BOOKING_CONFIRMED',
            inApp: true,
            email: true,
            sms: true,
            push: true,
          },
        ],
      });

      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif-1',
        userId: mockUserId,
        type: 'BOOKING_CONFIRMED',
      });

      (prisma.notificationDeliveryLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.dispatch(mockUserId, 'BOOKING_CONFIRMED', {
        serviceTitle: 'Vedic Meditation Journey',
        providerName: 'Guruji Vedavyas',
        sessionTime: 'Saturday, 10:00 AM',
        bookingId: 'book-1',
      });

      expect(result.inAppDispatched).toBe(true);
      expect(result.emailDispatched).toBe(true);
      expect(result.smsDispatched).toBe(true);
      expect(result.pushDispatched).toBe(true);

      expect(emailGateway.sendEmail).toHaveBeenCalledWith(
        'seeker@sanctuary.com',
        expect.stringContaining('Confirmed: Vedic Meditation Journey'),
        expect.stringContaining('Your Sanctuary Session is Secured'),
      );
      expect(smsGateway.sendSms).toHaveBeenCalled();
      expect(pushGateway.sendPushNotification).toHaveBeenCalled();

      // Verify delivery logs recorded DELIVERED
      expect(prisma.notificationDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId,
            status: 'DELIVERED',
          }),
        }),
      );
    });

    it('should skip email and SMS channels when user has disabled them in preferences', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        notificationPreferences: [
          {
            type: 'SESSION_REMINDER_24H',
            inApp: true,
            email: false, // User opted out of email for 24h reminders
            sms: false, // User opted out of SMS
            push: true,
          },
        ],
      });

      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif-2',
        userId: mockUserId,
      });

      (prisma.notificationDeliveryLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.dispatch(mockUserId, 'SESSION_REMINDER_24H', {
        serviceTitle: 'Pranic Energy Clearing',
        providerName: 'Dr. Ananya',
        sessionTime: 'Tomorrow at 4 PM',
      });

      expect(result.inAppDispatched).toBe(true);
      expect(result.emailDispatched).toBe(false);
      expect(result.smsDispatched).toBe(false);
      expect(result.pushDispatched).toBe(true);

      expect(emailGateway.sendEmail).not.toHaveBeenCalled();
      expect(smsGateway.sendSms).not.toHaveBeenCalled();

      // Verify SKIPPED_PREFERENCE recorded in delivery logs
      expect(prisma.notificationDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'EMAIL',
            status: 'SKIPPED_PREFERENCE',
          }),
        }),
      );
      expect(prisma.notificationDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'SMS',
            status: 'SKIPPED_PREFERENCE',
          }),
        }),
      );
    });

    it('should allow SMS dispatch for critical alerts (e.g. cancellation) even if standard SMS is disabled', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        notificationPreferences: [
          {
            type: 'BOOKING_CANCELLED',
            inApp: true,
            email: true,
            sms: false, // normally false
            push: true,
          },
        ],
      });

      (prisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-3' });
      (prisma.notificationDeliveryLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.dispatch(
        mockUserId,
        'BOOKING_CANCELLED',
        {
          serviceTitle: 'Reiki Alignment',
          refundAmount: 200000,
          reason: 'Practitioner emergency',
        },
        { isCritical: true }, // isCritical override
      );

      expect(result.smsDispatched).toBe(true);
      expect(smsGateway.sendSms).toHaveBeenCalled();
    });

    it('should record DEAD_LETTER in delivery logs if email gateway fails', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (emailGateway.sendEmail as jest.Mock).mockRejectedValueOnce(
        new Error('SMTP connection timeout'),
      );

      (prisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-4' });
      (prisma.notificationDeliveryLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.dispatch(mockUserId, 'BOOKING_CONFIRMED', {
        serviceTitle: 'Sound Healing',
      });

      expect(result.emailDispatched).toBe(false);
      expect(prisma.notificationDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'EMAIL',
            status: 'DEAD_LETTER',
            error: 'SMTP connection timeout',
          }),
        }),
      );
    });
  });

  describe('User Preference Center Management', () => {
    it('should save and update user notification preferences per type and channel', async () => {
      (prisma.notificationPreference.upsert as jest.Mock).mockResolvedValue({});
      (prisma.notificationPreference.findMany as jest.Mock).mockResolvedValue([
        {
          type: 'CHAT_MESSAGE',
          inApp: true,
          email: false,
          sms: false,
          push: true,
        },
      ]);

      const res = await service.updateUserPreferences(mockUserId, {
        preferences: [
          {
            type: 'CHAT_MESSAGE',
            inApp: true,
            email: false,
            sms: false,
            push: true,
          },
        ],
      });

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_type: {
              userId: mockUserId,
              type: 'CHAT_MESSAGE',
            },
          },
        }),
      );
      expect(res).toBeDefined();
    });
  });
});
