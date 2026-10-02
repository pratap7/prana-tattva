/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { prisma, UserRole, BookingStatus } from '@project-nirvana/db';
import { TokenService } from '../src/modules/auth/services/token.service';
import { MessageEncryptionService } from '../src/modules/messaging/services/message-encryption.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Messaging & Multi-Channel Notifications (e2e)', () => {
  let app: INestApplication;
  let tokenService: TokenService;
  let consumerToken: string;
  let _providerToken: string;
  let thirdPartyToken: string;

  const consumerId = '11111111-2222-4333-8444-555555555555';
  const providerId = '66666666-7777-4888-8999-000000000000';
  const thirdPartyId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const conversationId = uuidv4();
  const bookingId = uuidv4();

  const mockConsumer = {
    id: consumerId,
    email: 'seeker.msg@sanctuary.com',
    role: UserRole.CONSUMER,
    locale: 'en-US',
  };

  const mockProvider = {
    id: providerId,
    email: 'guru.msg@sanctuary.com',
    role: UserRole.PROVIDER,
    locale: 'en-US',
    providerProfile: {
      id: 'prof-msg-1',
      displayName: 'Swami Ananda',
      avatarUrl: 'https://images.unsplash.com/guru.jpg',
    },
  };

  const mockConversation = {
    id: conversationId,
    consumerId,
    providerId,
    bookingId,
    isUnlocked: true,
    preBookingMessageCount: 0,
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    consumer: mockConsumer,
    provider: mockProvider,
  };

  beforeAll(async () => {
    (jest.spyOn(prisma.refreshToken, 'create') as any).mockResolvedValue({ id: 'rt-mock' });
    (jest.spyOn(prisma.notificationDeliveryLog, 'create') as any).mockResolvedValue({});

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();

    tokenService = moduleFixture.get<TokenService>(TokenService);

    // Generate JWT access tokens
    const cTokens = await tokenService.generateTokens(
      consumerId,
      mockConsumer.email,
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    consumerToken = cTokens.accessToken;

    const pTokens = await tokenService.generateTokens(
      providerId,
      mockProvider.email,
      UserRole.PROVIDER,
      'Asia/Kolkata',
    );
    _providerToken = pTokens.accessToken;

    const tTokens = await tokenService.generateTokens(
      thirdPartyId,
      'intruder@sanctuary.com',
      UserRole.CONSUMER,
      'Asia/Kolkata',
    );
    thirdPartyToken = tTokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    (jest.spyOn(prisma.refreshToken, 'create') as any).mockResolvedValue({ id: 'rt-mock' });
    (jest.spyOn(prisma.notificationDeliveryLog, 'create') as any).mockResolvedValue({});
  });

  describe('Conversations API', () => {
    it('GET /conversations - should return user conversations with decrypted preview', async () => {
      jest.spyOn(prisma.conversation, 'findMany').mockResolvedValue([
        {
          ...mockConversation,
          messages: [],
        },
      ] as any);

      jest.spyOn(prisma.message, 'count').mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(conversationId);
      expect(res.body[0].partner.displayName).toBe('Swami Ananda');
    });

    it('POST /conversations/with/:providerId - should get or create unified conversation', async () => {
      jest.spyOn(prisma.user, 'findUnique' as any).mockImplementation((args: any) => {
        if (args.where.id === consumerId) return Promise.resolve(mockConsumer as any);
        if (args.where.id === providerId) return Promise.resolve(mockProvider as any);
        return Promise.resolve(null);
      });

      jest.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.booking, 'findFirst').mockResolvedValue({ id: bookingId } as any);
      jest.spyOn(prisma.conversation, 'create').mockResolvedValue(mockConversation as any);

      const res = await request(app.getHttpServer())
        .post(`/conversations/with/${providerId}`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(201);

      expect(res.body.id).toBe(conversationId);
      expect(res.body.isUnlocked).toBe(true);
    });
  });

  describe('Secure Messaging & Anti-Leakage', () => {
    it('POST /conversations/:id/messages - should encrypt message at rest and return to sender', async () => {
      jest.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(mockConversation as any);
      jest.spyOn(prisma.userBlock, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.booking, 'findFirst').mockResolvedValue({
        id: bookingId,
        status: BookingStatus.CONFIRMED,
      } as any);

      let savedDbRecord: any = null;
      jest.spyOn(prisma.message, 'create' as any).mockImplementation((args: any) => {
        savedDbRecord = args.data;
        return Promise.resolve({
          id: 'msg-e2e-1',
          ...args.data,
          createdAt: new Date(),
        });
      });

      jest.spyOn(prisma.conversation, 'update').mockResolvedValue(mockConversation as any);

      const payload = {
        content: 'Namaste Guruji, I am seeking guidance on morning pranayama practice.',
      };

      const res = await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBe('msg-e2e-1');
      expect(res.body.content).toBe(payload.content);
      expect(res.body.hasLeakageWarning).toBe(false);

      // Verify DB record was encrypted at rest (never plaintext in DB)
      expect(savedDbRecord).toBeDefined();
      expect(savedDbRecord.ciphertext).toBeDefined();
      expect(savedDbRecord.ciphertext).not.toBe(payload.content);
      expect(savedDbRecord.iv).toBeDefined();
      expect(savedDbRecord.authTag).toBeDefined();
    });

    it('POST /conversations/:id/messages - should flag off-platform contact before booking is paid without blocking', async () => {
      jest.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
        ...mockConversation,
        isUnlocked: false,
      } as any);
      jest.spyOn(prisma.userBlock, 'findFirst').mockResolvedValue(null);
      // No paid booking
      jest.spyOn(prisma.booking, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.message, 'count').mockResolvedValue(0);

      jest.spyOn(prisma.message, 'create' as any).mockImplementation((args: any) =>
        Promise.resolve({
          id: 'msg-leak-e2e',
          ...args.data,
          createdAt: new Date(),
        }),
      );

      jest.spyOn(prisma.conversation, 'update').mockResolvedValue(mockConversation as any);

      const payload = {
        content: 'Can you whatsapp me at +91 9988776655 to coordinate?',
      };

      const res = await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.hasLeakageWarning).toBe(true);
      expect(res.body.leakageFlags).toContain('PHONE');
      expect(res.body.leakageFlags).toContain('OFF_PLATFORM_KEYWORD');
      expect(res.body.warningMessage).toContain('Sanctuary Safety Notice');
      expect(res.body.flaggedForModeration).toBe(true);
    });

    it('GET /conversations/:id/messages - should return decrypted messages for participant', async () => {
      jest.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(mockConversation as any);

      // We encrypt a test message
      const encryptionService = app.get(MessageEncryptionService);
      const enc = encryptionService.encrypt('Decrypted test session details');

      jest.spyOn(prisma.message, 'findMany').mockResolvedValue([
        {
          id: 'msg-dec-1',
          conversationId,
          senderId: providerId,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
          keyVersion: enc.keyVersion,
          attachmentUrl: null,
          attachmentType: null,
          attachmentSize: null,
          readAt: null,
          hasLeakageWarning: false,
          leakageFlags: null,
          flaggedForModeration: false,
          createdAt: new Date(),
          sender: mockProvider,
        },
      ] as any);

      const res = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body.messages.length).toBe(1);
      expect(res.body.messages[0].content).toBe('Decrypted test session details');
    });

    it('GET /conversations/:id/messages - should reject third party with 403 Forbidden', async () => {
      jest.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(mockConversation as any);

      await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${thirdPartyToken}`)
        .expect(403);
    });
  });

  describe('User Blocking & Safety Reports', () => {
    it('POST /users/:id/block - should block provider and subsequently reject messages', async () => {
      jest.spyOn(prisma.userBlock, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.userBlock, 'create').mockResolvedValue({
        id: 'blk-1',
        blockerId: consumerId,
        blockedId: providerId,
      } as any);

      await request(app.getHttpServer())
        .post(`/users/${providerId}/block`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ reason: 'Spamming' })
        .expect(200);

      // Now attempt to message should fail with 403 Forbidden
      jest.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(mockConversation as any);
      jest.spyOn(prisma.userBlock, 'findFirst').mockResolvedValue({
        id: 'blk-1',
        blockerId: consumerId,
        blockedId: providerId,
      } as any);

      await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ content: 'Message should fail' })
        .expect(403);
    });

    it('DELETE /users/:id/block - should unblock user', async () => {
      jest.spyOn(prisma.userBlock, 'findUnique').mockResolvedValue({
        id: 'blk-1',
        blockerId: consumerId,
        blockedId: providerId,
      } as any);
      jest.spyOn(prisma.userBlock, 'delete').mockResolvedValue({} as any);

      await request(app.getHttpServer())
        .delete(`/users/${providerId}/block`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);
    });

    it('POST /users/:id/report - should file safety report', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockProvider as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({
        id: 'rep-e2e-1',
        reporterId: consumerId,
        reportedUserId: providerId,
        category: 'SAFETY',
        reason: 'Aggressive behavior during call',
      } as any);

      const res = await request(app.getHttpServer())
        .post(`/users/${providerId}/report`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          category: 'SAFETY',
          reason: 'Aggressive behavior during call',
        })
        .expect(201);

      expect(res.body.id).toBe('rep-e2e-1');
    });
  });

  describe('Notifications API & Preferences', () => {
    it('GET /notifications/preferences - should return preference center options', async () => {
      jest.spyOn(prisma.notificationPreference, 'findMany').mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((p: any) => p.type === 'BOOKING_CONFIRMED')).toBe(true);
      expect(res.body.some((p: any) => p.type === 'SESSION_REMINDER_24H')).toBe(true);
    });

    it('PUT /notifications/preferences - should update channel preferences', async () => {
      jest.spyOn(prisma.notificationPreference, 'upsert').mockResolvedValue({} as any);
      jest.spyOn(prisma.notificationPreference, 'findMany').mockResolvedValue([
        {
          type: 'SESSION_REMINDER_24H',
          inApp: true,
          email: false,
          sms: false,
          push: true,
        },
      ] as any);

      const res = await request(app.getHttpServer())
        .put('/notifications/preferences')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          preferences: [
            {
              type: 'SESSION_REMINDER_24H',
              inApp: true,
              email: false,
              sms: false,
              push: true,
            },
          ],
        })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const updatedItem = res.body.find((p: any) => p.type === 'SESSION_REMINDER_24H');
      expect(updatedItem.email).toBe(false);
    });

    it('GET /notifications - should return in-app notifications and unread count', async () => {
      jest.spyOn(prisma.notification, 'findMany').mockResolvedValue([
        {
          id: 'notif-e2e-1',
          userId: consumerId,
          type: 'BOOKING_CONFIRMED',
          title: 'Session Confirmed',
          body: 'Your session has been secured',
          data: {},
          readAt: null,
          createdAt: new Date(),
        },
      ] as any);
      jest.spyOn(prisma.notification, 'count').mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${consumerToken}`)
        .expect(200);

      expect(res.body.notifications.length).toBe(1);
      expect(res.body.unreadCount).toBe(1);
      expect(res.body.notifications[0].title).toBe('Session Confirmed');
    });

    it('POST /notifications/push-subscription - should register web push subscription', async () => {
      jest.spyOn(prisma.pushSubscription, 'upsert').mockResolvedValue({
        id: 'push-sub-1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub',
      } as any);

      const res = await request(app.getHttpServer())
        .post('/notifications/push-subscription')
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub',
          keys: {
            p256dh: 'BNcRdreALRF8JxZ...testKey',
            auth: 'authKey123',
          },
        })
        .expect(200);

      expect(res.body.id).toBe('push-sub-1');
    });
  });
});
