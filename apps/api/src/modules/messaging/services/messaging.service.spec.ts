/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessageEncryptionService } from './message-encryption.service';
import { AntiLeakageService } from './anti-leakage.service';
import { prisma, BookingStatus } from '@project-nirvana/db';

jest.mock('@project-nirvana/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
    },
    userBlock: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    report: {
      create: jest.fn(),
    },
  },
  BookingStatus: {
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    CONFIRMED: 'CONFIRMED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },
  UserRole: {
    CONSUMER: 'CONSUMER',
    PROVIDER: 'PROVIDER',
  },
}));

describe('MessagingService & Safety Guardrails', () => {
  let service: MessagingService;
  let encryptionService: MessageEncryptionService;

  const consumerId = 'consumer-user-1';
  const providerId = 'provider-user-2';
  const thirdPartyId = 'third-party-user-3';
  const conversationId = 'conv-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        MessageEncryptionService,
        AntiLeakageService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
    encryptionService = module.get<MessageEncryptionService>(MessageEncryptionService);

    jest.clearAllMocks();
  });

  describe('Permission Checks & Conversation Access', () => {
    it('should reject third-party user from sending messages in another pair conversation', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: true,
      });

      await expect(
        service.sendMessage(thirdPartyId, conversationId, {
          content: 'Hello unauthorized',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if conversation does not exist', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.sendMessage(consumerId, 'non-existent-conv', {
          content: 'Hello',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject sending message if recipient is blocked by sender or vice-versa', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: true,
        consumer: { id: consumerId, email: 'consumer@sanctuary.com' },
        provider: { id: providerId, email: 'provider@sanctuary.com' },
      });

      (prisma.userBlock.findFirst as jest.Mock).mockResolvedValue({
        id: 'block-1',
        blockerId: providerId,
        blockedId: consumerId,
      });

      await expect(
        service.sendMessage(consumerId, conversationId, {
          content: 'Trying to contact blocked user',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should enforce 3-message spam limit for pre-booking consumer outreach when no booking exists', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: false,
        preBookingMessageCount: 3,
        consumer: { id: consumerId, email: 'consumer@sanctuary.com' },
        provider: { id: providerId, email: 'provider@sanctuary.com' },
      });

      // No booking exists
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
      // Consumer already sent 3 messages
      (prisma.message.count as jest.Mock).mockResolvedValue(3);

      await expect(
        service.sendMessage(consumerId, conversationId, {
          content: 'Fourth message before booking',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow sending message when booking exists even if previous count was 3', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: true,
        preBookingMessageCount: 3,
        consumer: { id: consumerId, email: 'consumer@sanctuary.com' },
        provider: { id: providerId, email: 'provider@sanctuary.com' },
      });

      // Booking confirmed exists
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
        id: 'booking-paid',
        status: BookingStatus.CONFIRMED,
      });

      (prisma.userBlock.findFirst as jest.Mock).mockResolvedValue(null);

      (prisma.message.create as jest.Mock).mockImplementation((args) => ({
        id: 'msg-1',
        ...args.data,
        createdAt: new Date(),
      }));

      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      const result = await service.sendMessage(consumerId, conversationId, {
        content: 'Booking is confirmed, message should be allowed',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('msg-1');
      expect(result.content).toBe('Booking is confirmed, message should be allowed');
    });
  });

  describe('Anti-Leakage Detection Engine', () => {
    it('should detect phone numbers and warn sender without silently blocking message delivery', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: false,
        consumer: { id: consumerId, email: 'consumer@sanctuary.com' },
        provider: { id: providerId, email: 'provider@sanctuary.com' },
      });

      (prisma.userBlock.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null); // Unpaid
      (prisma.message.count as jest.Mock).mockResolvedValue(1);

      (prisma.message.create as jest.Mock).mockImplementation((args) => ({
        id: 'msg-leak-phone',
        ...args.data,
        createdAt: new Date(),
      }));

      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      const result = await service.sendMessage(consumerId, conversationId, {
        content: 'Call me at +91 9876543210 for details',
      });

      expect(result.hasLeakageWarning).toBe(true);
      expect(result.leakageFlags).toContain('PHONE');
      expect(result.flaggedForModeration).toBe(true);
      expect(result.warningMessage).toContain('Sanctuary Safety Notice');
      // Delivery must NOT be silently blocked
      expect(prisma.message.create).toHaveBeenCalled();
    });

    it('should detect email addresses and WhatsApp keywords before a booking is paid', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: false,
        consumer: { id: consumerId, email: 'consumer@sanctuary.com' },
        provider: { id: providerId, email: 'provider@sanctuary.com' },
      });

      (prisma.userBlock.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null); // Unpaid
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      (prisma.message.create as jest.Mock).mockImplementation((args) => ({
        id: 'msg-leak-wa',
        ...args.data,
        createdAt: new Date(),
      }));

      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      const result = await service.sendMessage(consumerId, conversationId, {
        content: 'Ping me on WhatsApp or email me at healer@gmail.com and pay outside to save fee',
      });

      expect(result.hasLeakageWarning).toBe(true);
      expect(result.leakageFlags).toContain('EMAIL');
      expect(result.leakageFlags).toContain('OFF_PLATFORM_KEYWORD');
      expect(result.flaggedForModeration).toBe(true);
    });

    it('should bypass leakage warnings once booking is paid (CONFIRMED)', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: true,
        consumer: { id: consumerId, email: 'consumer@sanctuary.com' },
        provider: { id: providerId, email: 'provider@sanctuary.com' },
      });

      (prisma.userBlock.findFirst as jest.Mock).mockResolvedValue(null);
      // Has confirmed booking
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
        id: 'b-confirmed',
        status: BookingStatus.CONFIRMED,
      });

      (prisma.message.create as jest.Mock).mockImplementation((args) => ({
        id: 'msg-paid',
        ...args.data,
        createdAt: new Date(),
      }));

      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      const result = await service.sendMessage(consumerId, conversationId, {
        content: 'My number is 9876543210 in case of arrival directions',
      });

      expect(result.hasLeakageWarning).toBe(false);
      expect(result.flaggedForModeration).toBe(false);
    });
  });

  describe('Application-Level AES-256-GCM Encryption at Rest', () => {
    it('should encrypt message bodies so ciphertext and authTag are saved to DB (never plaintext)', async () => {
      const plaintext = 'Secret therapeutic intention details';

      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: conversationId,
        consumerId,
        providerId,
        isUnlocked: true,
        consumer: { id: consumerId, email: 'consumer@sanctuary.com' },
        provider: { id: providerId, email: 'provider@sanctuary.com' },
      });

      (prisma.userBlock.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ id: 'b-1', status: 'CONFIRMED' });

      let savedData: any = null;
      (prisma.message.create as jest.Mock).mockImplementation((args) => {
        savedData = args.data;
        return {
          id: 'msg-enc-1',
          ...args.data,
          createdAt: new Date(),
        };
      });

      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      await service.sendMessage(consumerId, conversationId, { content: plaintext });

      expect(savedData).toBeDefined();
      expect(savedData.ciphertext).toBeDefined();
      expect(savedData.ciphertext).not.toEqual(plaintext);
      expect(savedData.iv).toBeDefined();
      expect(savedData.authTag).toBeDefined();
      expect(savedData.keyVersion).toBe(1);

      // Verify decrypt recovers exact original plaintext
      const decrypted = encryptionService.decrypt({
        ciphertext: savedData.ciphertext,
        iv: savedData.iv,
        authTag: savedData.authTag,
        keyVersion: savedData.keyVersion,
      });
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Block and Report Functionality', () => {
    it('should record user block and prevent messaging', async () => {
      (prisma.userBlock.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.userBlock.create as jest.Mock).mockResolvedValue({
        id: 'block-new',
        blockerId: consumerId,
        blockedId: providerId,
        reason: 'Unsolicited messages',
      });

      const block = await service.blockUser(consumerId, providerId, 'Unsolicited messages');
      expect(block).toBeDefined();
      expect(prisma.userBlock.create).toHaveBeenCalledWith({
        data: {
          blockerId: consumerId,
          blockedId: providerId,
          reason: 'Unsolicited messages',
        },
      });
    });

    it('should reject blocking oneself', async () => {
      await expect(service.blockUser(consumerId, consumerId)).rejects.toThrow(BadRequestException);
    });

    it('should create report with category and reason', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: providerId });
      (prisma.report.create as jest.Mock).mockResolvedValue({
        id: 'rep-1',
        reporterId: consumerId,
        reportedUserId: providerId,
        category: 'HARASSMENT',
        reason: 'Inappropriate conduct',
      });

      const report = await service.reportUser(consumerId, {
        userId: providerId,
        category: 'HARASSMENT',
        reason: 'Inappropriate conduct',
      });

      expect(report.id).toBe('rep-1');
      expect(prisma.report.create).toHaveBeenCalled();
    });
  });
});
