/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import {
  DAILY_VIDEO_PROVIDER,
  DailyVideoProvider,
  DailyRoomInfo,
} from '../interfaces/daily-video-provider.interface';
import { AuditService } from '../../audit/audit.service';
import { prisma, BookingStatus, ServiceMode } from '@project-nirvana/db';

describe('SessionsService (Daily.co Video Integration, Tokens, Webhooks, No-Show, Psychotherapy)', () => {
  let service: SessionsService;
  let mockDailyProvider: jest.Mocked<DailyVideoProvider>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;

  const consumerId = 'consumer-sess-1111';
  const providerId = 'provider-sess-2222';
  const thirdPartyUserId = 'intruder-sess-9999';
  const bookingId = 'booking-sess-3333';
  const serviceId = 'service-sess-4444';

  const now = Date.now();
  const startAt = new Date(now + 5 * 60 * 1000); // 5 minutes in future (inside -10m window)
  const endAt = new Date(now + 65 * 60 * 1000); // 65 minutes in future

  const mockCategoryStandard = {
    id: 'cat-yoga',
    name: 'Pranayama Yoga',
    slug: 'pranayama-yoga',
    requiresLicense: false,
  };

  const mockCategoryPsychotherapy = {
    id: 'cat-psychotherapy',
    name: 'Licensed Psychotherapy & Trauma Healing',
    slug: 'psychotherapy-counseling',
    requiresLicense: true,
  };

  const mockService = {
    id: serviceId,
    title: 'Kundalini Breathwork Session',
    mode: ServiceMode.ONLINE,
    durationMin: 60,
    priceAmount: 300000,
    locationAddress: 'Temple of Prana, Laxman Jhula, Rishikesh',
    locationCity: 'Rishikesh',
    locationCoordinates: { lat: 30.1345, lng: 78.3241 },
    locationInstructions: 'Enter through the sacred courtyard',
    category: mockCategoryStandard,
  };

  const mockProviderProfile = {
    id: 'prof-sess-1',
    userId: providerId,
    displayName: 'Swami Ananda',
    avatarUrl: 'https://images.unsplash.com/photo-swami.jpg',
    completedSessions: 15,
    reliabilityStrikes: 0,
    minNoticeHours: 2,
    city: 'Rishikesh',
  };

  const mockBooking: any = {
    id: bookingId,
    consumerId,
    providerId,
    serviceId,
    status: BookingStatus.CONFIRMED,
    startAt,
    endAt,
    priceSnapshot: 300000,
    currency: 'INR',
    commissionBps: 1500,
    refundAmount: null,
    refundReason: null,
    service: mockService,
    consumer: {
      id: consumerId,
      email: 'seeker@nirvana.org',
    },
    provider: {
      id: providerId,
      email: 'swami@nirvana.org',
      providerProfile: mockProviderProfile,
    },
    session: null,
  };

  beforeEach(async () => {
    mockDailyProvider = {
      createRoom: jest.fn().mockImplementation(
        async (opts) =>
          ({
            id: `daily-room-${opts.name}`,
            name: opts.name,
            url: `https://pranatattva.daily.co/${opts.name}`,
            privacy: 'private',
            createdAt: new Date().toISOString(),
            config: {
              nbf: opts.nbf,
              exp: opts.exp,
              enable_knocking: true,
              enable_screenshare: true,
            },
          }) as DailyRoomInfo,
      ),
      createMeetingToken: jest.fn().mockImplementation(async (opts) => {
        return `mock_token_${opts.roomName}_${opts.isOwner ? 'owner' : 'participant'}`;
      }),
      extendRoom: jest.fn().mockResolvedValue(undefined),
      startRecording: jest.fn().mockResolvedValue({ recordingId: 'rec-daily-123' }),
      stopRecording: jest.fn().mockResolvedValue(undefined),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };

    mockAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockEventEmitter = {
      emit: jest.fn(),
    } as any;

    // Reset Prisma spies
    (jest.spyOn(prisma.booking, 'findUnique') as any).mockImplementation(async ({ where }: any) => {
      if (where.id === bookingId) return mockBooking;
      return null;
    });

    (jest.spyOn(prisma.booking, 'findFirst') as any).mockImplementation(async () => null);

    (jest.spyOn(prisma.booking, 'update') as any).mockImplementation(
      async ({ where, data }: any) => {
        if (where.id === bookingId) {
          Object.assign(mockBooking, data);
          return mockBooking;
        }
        return null;
      },
    );

    (jest.spyOn(prisma.session, 'upsert') as any).mockImplementation(
      async ({ create, update }: any) => {
        const sess = {
          id: 'sess-record-1',
          bookingId,
          videoRoomName: create?.videoRoomName || update?.videoRoomName || 'nirvana-mock-room',
          videoRoomUrl:
            create?.videoRoomUrl ||
            update?.videoRoomUrl ||
            'https://pranatattva.daily.co/nirvana-mock-room',
          recordingStatus: 'DISABLED',
          recordingConsents: null,
          extendedMinutes: 0,
          metadata: null,
          startedAt: null,
          endedAt: null,
          joinedByConsumerAt: null,
          joinedByProviderAt: null,
          ...create,
          ...update,
        };
        mockBooking.session = sess;
        return sess;
      },
    );

    (jest.spyOn(prisma.session, 'findFirst') as any).mockImplementation(async () => {
      if (!mockBooking.session) return null;
      return {
        ...mockBooking.session,
        booking: mockBooking,
      };
    });

    (jest.spyOn(prisma.session, 'update') as any).mockImplementation(async ({ data }: any) => {
      if (mockBooking.session) {
        Object.assign(mockBooking.session, data);
      }
      return mockBooking.session;
    });

    (jest.spyOn(prisma.providerProfile, 'update') as any).mockImplementation(
      async ({ data }: any) => {
        if (data.reliabilityStrikes?.increment) {
          mockProviderProfile.reliabilityStrikes += data.reliabilityStrikes.increment;
        }
        if (data.completedSessions?.increment) {
          mockProviderProfile.completedSessions += data.completedSessions.increment;
        }
        return mockProviderProfile;
      },
    );

    (jest.spyOn(prisma.consentRecord, 'create') as any).mockResolvedValue({ id: 'consent-1' });

    // Reset test booking state
    mockBooking.status = BookingStatus.CONFIRMED;
    mockBooking.startAt = new Date(Date.now() + 5 * 60 * 1000);
    mockBooking.endAt = new Date(Date.now() + 65 * 60 * 1000);
    mockBooking.service.category = mockCategoryStandard;
    mockBooking.session = null;
    mockProviderProfile.reliabilityStrikes = 0;
    mockProviderProfile.completedSessions = 15;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: DAILY_VIDEO_PROVIDER,
          useValue: mockDailyProvider,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  describe('1. Room Provisioning upon Booking Confirmation', () => {
    it('should create a private room with a random name (NEVER containing booking ID)', async () => {
      const session = await service.provisionRoomForBooking(bookingId);

      expect(session).toBeDefined();
      expect(session?.videoRoomName).toBeDefined();
      expect(session?.videoRoomName).toMatch(/^nirvana-[0-9a-f]{16}$/);
      expect(session?.videoRoomName).not.toContain(bookingId);

      // Verify scheduled window (-10m to +30m)
      expect(mockDailyProvider.createRoom).toHaveBeenCalledTimes(1);
      const callArgs = mockDailyProvider.createRoom.mock.calls[0][0];
      const startSec = Math.floor(mockBooking.startAt.getTime() / 1000);
      const endSec = Math.floor(mockBooking.endAt.getTime() / 1000);

      expect(callArgs.nbf).toBe(startSec - 10 * 60);
      expect(callArgs.exp).toBe(endSec + 30 * 60);
      expect(callArgs.privacy).toBe('private');
      expect(callArgs.enableKnocking).toBe(true);
    });

    it('should skip video room provisioning for IN_PERSON service mode', async () => {
      mockBooking.service.mode = ServiceMode.IN_PERSON;
      const session = await service.provisionRoomForBooking(bookingId);

      expect(session).toBeNull();
      expect(mockDailyProvider.createRoom).not.toHaveBeenCalled();
      mockBooking.service.mode = ServiceMode.ONLINE; // reset
    });
  });

  describe('2. Authorization on Join', () => {
    it('should allow the consumer to join and return token with participant permissions', async () => {
      const res = await service.joinSession(consumerId, bookingId);

      expect(res.isOwner).toBe(false);
      expect(res.partner.id).toBe(providerId);
      expect(res.partner.role).toBe('PROVIDER');
      expect(res.token).toContain('participant');
      expect(mockDailyProvider.createMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: false,
          enableScreenshare: false,
          userId: consumerId,
        }),
      );
    });

    it('should allow the provider to join and return token with owner & screen share permissions', async () => {
      const res = await service.joinSession(providerId, bookingId);

      expect(res.isOwner).toBe(true);
      expect(res.partner.id).toBe(consumerId);
      expect(res.partner.role).toBe('CONSUMER');
      expect(res.token).toContain('owner');
      expect(mockDailyProvider.createMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: true,
          enableScreenshare: true,
          userId: providerId,
        }),
      );
    });

    it('should reject a third party with 403 Forbidden', async () => {
      await expect(service.joinSession(thirdPartyUserId, bookingId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject joining an unconfirmed or cancelled booking', async () => {
      mockBooking.status = BookingStatus.PENDING_PAYMENT;
      await expect(service.joinSession(consumerId, bookingId)).rejects.toThrow(BadRequestException);

      mockBooking.status = BookingStatus.CANCELLED_BY_CONSUMER;
      await expect(service.joinSession(consumerId, bookingId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Time Window Boundaries (-10 min before to +30 min after)', () => {
    it('should reject join when session window is not yet open (> 10 minutes before start)', async () => {
      // Session starts in 2 hours
      mockBooking.startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      mockBooking.endAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

      await expect(service.joinSession(consumerId, bookingId)).rejects.toThrow(
        /Session window opens 10 minutes before start time/,
      );
    });

    it('should reject join when session window has expired (> 30 minutes after end)', async () => {
      // Session ended 1 hour ago
      mockBooking.startAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      mockBooking.endAt = new Date(Date.now() - 60 * 60 * 1000);

      await expect(service.joinSession(consumerId, bookingId)).rejects.toThrow(
        /Session window expired/,
      );
    });
  });

  describe('4. Psychotherapy Recording Prohibition', () => {
    it('should mark psychotherapy sessions as recording prohibited', async () => {
      mockBooking.service.category = mockCategoryPsychotherapy;

      const res = await service.joinSession(consumerId, bookingId);
      expect(res.isPsychotherapy).toBe(true);
      expect(res.recordingAllowed).toBe(false);
    });

    it('should strictly throw 403 Forbidden if consent is attempted for psychotherapy', async () => {
      mockBooking.service.category = mockCategoryPsychotherapy;

      await expect(
        service.grantRecordingConsent(consumerId, bookingId, '127.0.0.1'),
      ).rejects.toThrow(/Recording is strictly prohibited for psychotherapy/);
    });

    it('should strictly throw 403 Forbidden if startRecording is attempted for psychotherapy', async () => {
      mockBooking.service.category = mockCategoryPsychotherapy;

      await expect(service.startRecording(providerId, bookingId)).rejects.toThrow(
        /Recording is strictly prohibited for psychotherapy/,
      );
    });
  });

  describe('5. Double Consent Engine for Non-Psychotherapy Recording', () => {
    it('should require consent from BOTH parties before recording can be started', async () => {
      mockBooking.service.category = mockCategoryStandard;
      await service.provisionRoomForBooking(bookingId);

      // Attempt recording with NO consent -> Fail
      await expect(service.startRecording(providerId, bookingId)).rejects.toThrow(
        BadRequestException,
      );

      // Consumer grants consent
      const cRes = await service.grantRecordingConsent(consumerId, bookingId, '10.0.0.1');
      expect(cRes.status).toBe('CONSENT_PENDING');
      expect(cRes.consents.consumer).toBe(true);
      expect(cRes.consents.provider).toBe(false);

      // Attempt recording with ONLY consumer consent -> Fail
      await expect(service.startRecording(providerId, bookingId)).rejects.toThrow(
        BadRequestException,
      );

      // Provider grants consent
      const pRes = await service.grantRecordingConsent(providerId, bookingId, '10.0.0.2');
      expect(pRes.status).toBe('CONSENT_GRANTED');
      expect(pRes.consents.consumer).toBe(true);
      expect(pRes.consents.provider).toBe(true);

      // Now start recording -> Success!
      const startRes = await service.startRecording(providerId, bookingId);
      expect(startRes.recordingId).toBe('rec-daily-123');
      expect(mockDailyProvider.startRecording).toHaveBeenCalledWith(
        mockBooking.session.videoRoomName,
      );
      expect(mockBooking.session.recordingStatus).toBe('RECORDING');
    });
  });

  describe('6. Daily Webhook Processing: Completion and No-Show Logic', () => {
    beforeEach(async () => {
      await service.provisionRoomForBooking(bookingId);
    });

    it('should record joined timestamps and transition booking to IN_PROGRESS when both join', async () => {
      const roomName = mockBooking.session.videoRoomName;

      // Consumer joins
      await service.handleDailyWebhook('{}', 'sig', {
        event: 'participant.joined',
        room: roomName,
        participant: { user_id: consumerId, owner: false },
      });
      expect(mockBooking.session.joinedByConsumerAt).toBeDefined();

      // Provider joins
      await service.handleDailyWebhook('{}', 'sig', {
        event: 'participant.joined',
        room: roomName,
        participant: { user_id: providerId, owner: true },
      });
      expect(mockBooking.session.joinedByProviderAt).toBeDefined();
      expect(mockBooking.session.startedAt).toBeDefined();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('session.started', { bookingId });
    });

    it('should mark COMPLETED and emit booking.completed when both participants attended', async () => {
      const roomName = mockBooking.session.videoRoomName;
      mockBooking.session.joinedByConsumerAt = new Date(Date.now() - 3600000);
      mockBooking.session.joinedByProviderAt = new Date(Date.now() - 3600000);

      const res = await service.handleDailyWebhook('{}', 'sig', {
        event: 'meeting.ended',
        room: roomName,
      });

      expect(res.status).toBe('completed');
      expect(mockBooking.status).toBe(BookingStatus.COMPLETED);
      expect(mockProviderProfile.completedSessions).toBe(16); // incremented from 15
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.completed',
        expect.objectContaining({ bookingId, providerId, consumerId }),
      );
    });

    it('should detect Provider NO-SHOW, add reliability strike, and issue 100% refund', async () => {
      const roomName = mockBooking.session.videoRoomName;
      mockBooking.session.joinedByConsumerAt = new Date(Date.now() - 3600000); // Consumer joined
      mockBooking.session.joinedByProviderAt = null; // Provider NEVER joined

      const res = await service.handleDailyWebhook('{}', 'sig', {
        event: 'meeting.ended',
        room: roomName,
      });

      expect(res.status).toBe('provider_no_show');
      expect(mockBooking.status).toBe(BookingStatus.CANCELLED_BY_PROVIDER);
      expect(mockBooking.refundAmount).toBe(300000); // 100% refund
      expect(mockProviderProfile.reliabilityStrikes).toBe(1); // Reliability strike added!
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.cancelled',
        expect.objectContaining({
          bookingId,
          cancelledBy: 'PROVIDER',
          refundAmount: 300000,
        }),
      );
    });

    it('should detect Consumer NO-SHOW, mark completed with no refund, and protect provider payout', async () => {
      const roomName = mockBooking.session.videoRoomName;
      mockBooking.session.joinedByConsumerAt = null; // Consumer NEVER joined
      mockBooking.session.joinedByProviderAt = new Date(Date.now() - 3600000); // Provider was present

      const res = await service.handleDailyWebhook('{}', 'sig', {
        event: 'meeting.ended',
        room: roomName,
      });

      expect(res.status).toBe('consumer_no_show');
      expect(mockBooking.status).toBe(BookingStatus.COMPLETED);
      expect(mockBooking.refundAmount).toBe(0); // No refund
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.completed',
        expect.objectContaining({
          bookingId,
          isConsumerNoShow: true,
        }),
      );
    });
  });

  describe('7. Session Overtime Extension', () => {
    it('should extend Daily.co room expiration and update session extension minutes', async () => {
      await service.provisionRoomForBooking(bookingId);

      const res = await service.extendSession(providerId, bookingId, 15);

      expect(res.extendedMinutes).toBe(15);
      expect(mockDailyProvider.extendRoom).toHaveBeenCalledTimes(1);
    });

    it('should prevent non-provider from requesting session extension', async () => {
      await service.provisionRoomForBooking(bookingId);

      await expect(service.extendSession(consumerId, bookingId, 15)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should enforce max 30-minute cumulative extension limit', async () => {
      await service.provisionRoomForBooking(bookingId);
      mockBooking.session.extendedMinutes = 20;

      await expect(service.extendSession(providerId, bookingId, 15)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
