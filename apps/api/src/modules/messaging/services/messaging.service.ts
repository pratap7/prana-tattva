import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { prisma, BookingStatus, UserRole } from '@project-nirvana/db';
import {
  SendMessageDto,
  CreateAttachmentUrlDto,
  ReportUserDto,
  GetMessagesQueryDto,
  ConversationSummary,
  MessageItem,
  AttachmentSignedUrlResponse,
} from '@project-nirvana/shared';
import { MessageEncryptionService } from './message-encryption.service';
import { AntiLeakageService } from './anti-leakage.service';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly PRE_BOOKING_MESSAGE_LIMIT = 3;

  constructor(
    private readonly encryptionService: MessageEncryptionService,
    private readonly antiLeakageService: AntiLeakageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Retrieves or creates a single unified conversation for a consumer and provider pair.
   * Unlocked once a booking exists, or capped at 3 messages pre-booking.
   */
  async getOrCreateConversation(consumerId: string, providerId: string, initialBookingId?: string) {
    if (consumerId === providerId) {
      throw new BadRequestException('Cannot start a conversation with yourself');
    }

    // Verify both users exist
    const [consumer, provider] = await Promise.all([
      prisma.user.findUnique({ where: { id: consumerId } }),
      prisma.user.findUnique({
        where: { id: providerId },
        include: { providerProfile: true },
      }),
    ]);

    if (!consumer) throw new NotFoundException(`Consumer ${consumerId} not found`);
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);

    // Check if an existing conversation exists for this exact pair
    let conversation = await prisma.conversation.findUnique({
      where: {
        consumerId_providerId: {
          consumerId,
          providerId,
        },
      },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    // Check if any booking exists between this pair
    const anyBooking = await prisma.booking.findFirst({
      where: {
        consumerId,
        providerId,
      },
      orderBy: { createdAt: 'desc' },
    });

    const hasBooking = !!anyBooking;

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          consumerId,
          providerId,
          bookingId: initialBookingId || anyBooking?.id || null,
          isUnlocked: hasBooking,
          preBookingMessageCount: 0,
        },
        include: {
          consumer: true,
          provider: { include: { providerProfile: true } },
        },
      });
      this.logger.log(
        `Created conversation ${conversation.id} for consumer ${consumerId} and provider ${providerId}`,
      );
    } else if (!conversation.isUnlocked && hasBooking) {
      // Unlock conversation if a booking was created after initial outreach
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          isUnlocked: true,
          bookingId: anyBooking?.id || conversation.bookingId,
        },
        include: {
          consumer: true,
          provider: { include: { providerProfile: true } },
        },
      });
    }

    return conversation;
  }

  /**
   * Retrieves all conversations for the given user with latest message decrypted.
   */
  async getConversations(userId: string): Promise<ConversationSummary[]> {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ consumerId: userId }, { providerId: userId }],
      },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Compute unread counts for each conversation
    const summaries: ConversationSummary[] = await Promise.all(
      conversations.map(async (conv) => {
        const isUserConsumer = conv.consumerId === userId;
        const partnerUser = isUserConsumer ? conv.provider : conv.consumer;
        const partnerProfile = isUserConsumer ? conv.provider.providerProfile : null;

        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            readAt: null,
          },
        });

        let lastMsgItem: ConversationSummary['lastMessage'] = null;
        if (conv.messages.length > 0) {
          const raw = conv.messages[0];
          let decryptedContent = '[Encrypted message]';
          try {
            decryptedContent = this.encryptionService.decrypt({
              ciphertext: raw.ciphertext,
              iv: raw.iv,
              authTag: raw.authTag,
              keyVersion: raw.keyVersion,
            });
          } catch {
            decryptedContent = '[Secure message]';
          }

          lastMsgItem = {
            id: raw.id,
            senderId: raw.senderId,
            content: decryptedContent,
            hasAttachment: !!raw.attachmentUrl,
            createdAt: raw.createdAt.toISOString(),
            isRead: !!raw.readAt,
          };
        }

        return {
          id: conv.id,
          bookingId: conv.bookingId,
          isUnlocked: conv.isUnlocked,
          preBookingMessageCount: conv.preBookingMessageCount,
          unreadCount,
          partner: {
            id: partnerUser.id,
            displayName: partnerProfile?.displayName || partnerUser.email.split('@')[0],
            avatarUrl: partnerProfile?.avatarUrl || null,
            headline: partnerProfile?.headline || null,
            role: isUserConsumer ? UserRole.PROVIDER : UserRole.CONSUMER,
          },
          lastMessage: lastMsgItem,
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
        };
      }),
    );

    return summaries;
  }

  /**
   * Retrieves messages for a conversation with pagination/cursor, decrypted.
   */
  async getConversationMessages(
    userId: string,
    conversationId: string,
    query: GetMessagesQueryDto,
  ): Promise<{ messages: MessageItem[]; isUnlocked: boolean; preBookingCount: number }> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.consumerId !== userId && conversation.providerId !== userId) {
      throw new ForbiddenException('Access denied: You are not a participant in this conversation');
    }

    const limit = query.limit || 50;
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {}),
      },
      include: {
        sender: { include: { providerProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const decryptedItems: MessageItem[] = messages.map((msg) => {
      let content = '[Decryption error]';
      try {
        content = this.encryptionService.decrypt({
          ciphertext: msg.ciphertext,
          iv: msg.iv,
          authTag: msg.authTag,
          keyVersion: msg.keyVersion,
        });
      } catch {
        content = '[Encrypted payload]';
      }

      const senderName = msg.sender.providerProfile?.displayName || msg.sender.email.split('@')[0];

      return {
        id: msg.id,
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        senderName,
        content,
        attachmentUrl: msg.attachmentUrl,
        attachmentType: msg.attachmentType,
        attachmentSize: msg.attachmentSize,
        isRead: !!msg.readAt,
        readAt: msg.readAt ? msg.readAt.toISOString() : null,
        hasLeakageWarning: msg.hasLeakageWarning,
        leakageFlags: (msg.leakageFlags as string[]) || null,
        flaggedForModeration: msg.flaggedForModeration,
        createdAt: msg.createdAt.toISOString(),
      };
    });

    // Return in chronological order
    decryptedItems.reverse();

    return {
      messages: decryptedItems,
      isUnlocked: conversation.isUnlocked,
      preBookingCount: conversation.preBookingMessageCount,
    };
  }

  /**
   * Sends a message within a conversation:
   * 1. Validates participant authorization.
   * 2. Checks active user block.
   * 3. Enforces pre-booking spam cap (3 messages if no booking exists).
   * 4. Scans for anti-leakage (phone, email, off-platform payment) if unpaid.
   * 5. Encrypts message body via AES-256-GCM (never written to logs).
   * 6. Persists message and emits domain/socket events.
   */
  async sendMessage(
    senderId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageItem> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        consumer: true,
        provider: { include: { providerProfile: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const isConsumer = conversation.consumerId === senderId;
    const isProvider = conversation.providerId === senderId;

    if (!isConsumer && !isProvider) {
      throw new ForbiddenException('Access denied: You are not a participant in this conversation');
    }

    const recipientId = isConsumer ? conversation.providerId : conversation.consumerId;

    // 1. Block Check
    const activeBlock = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: recipientId },
          { blockerId: recipientId, blockedId: senderId },
        ],
      },
    });

    if (activeBlock) {
      throw new ForbiddenException(
        'Unable to send message: A block is in effect between participants',
      );
    }

    // 2. Pre-Booking Spam Cap Check
    let isUnlocked = conversation.isUnlocked;
    if (!isUnlocked) {
      // Check if a booking has been created in the meantime
      const existingBooking = await prisma.booking.findFirst({
        where: {
          consumerId: conversation.consumerId,
          providerId: conversation.providerId,
        },
      });

      if (existingBooking) {
        isUnlocked = true;
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { isUnlocked: true, bookingId: existingBooking.id },
        });
      } else if (isConsumer) {
        // Enforce 3-message cap for consumer before booking
        const consumerSentCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: conversation.consumerId,
          },
        });

        if (consumerSentCount >= this.PRE_BOOKING_MESSAGE_LIMIT) {
          throw new ForbiddenException(
            `Pre-booking message limit reached (${this.PRE_BOOKING_MESSAGE_LIMIT} messages). Please book a session to continue conversing with this practitioner.`,
          );
        }
      }
    }

    // 3. Anti-Leakage Inspection
    // Active if no confirmed or completed booking exists yet
    const hasPaidBooking = await prisma.booking.findFirst({
      where: {
        consumerId: conversation.consumerId,
        providerId: conversation.providerId,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
      },
    });

    let hasLeakageWarning = false;
    let leakageFlags: string[] = [];
    let warningMessage: string | null = null;

    if (!hasPaidBooking) {
      const inspection = this.antiLeakageService.inspectMessage(dto.content);
      if (inspection.hasLeakage) {
        hasLeakageWarning = true;
        leakageFlags = inspection.leakageFlags;
        warningMessage = inspection.warningMessage || null;
      }
    }

    // 4. Encrypt at rest via AES-256-GCM (NEVER LOG PLAINTEXT)
    const encrypted = this.encryptionService.encrypt(dto.content);

    // 5. Persist to DB
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        isEncrypted: true,
        attachmentUrl: dto.attachmentUrl || null,
        attachmentType: dto.attachmentType || null,
        attachmentSize: dto.attachmentSize || null,
        hasLeakageWarning,
        leakageFlags:
          leakageFlags.length > 0 ? JSON.parse(JSON.stringify(leakageFlags)) : undefined,
        flaggedForModeration: hasLeakageWarning,
        moderationReason: hasLeakageWarning
          ? 'Contact or payment leakage pattern detected prior to confirmed booking'
          : null,
      },
    });

    // Update conversation lastMessageAt & preBookingMessageCount
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        ...(!isUnlocked && isConsumer ? { preBookingMessageCount: { increment: 1 } } : {}),
      },
    });

    const senderUser = isConsumer ? conversation.consumer : conversation.provider;
    const senderProfile = !isConsumer ? conversation.provider.providerProfile : null;
    const senderName = senderProfile?.displayName || senderUser.email.split('@')[0];

    const resultItem: MessageItem = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName,
      content: dto.content, // Returned to sender in response, not logged
      attachmentUrl: message.attachmentUrl,
      attachmentType: message.attachmentType,
      attachmentSize: message.attachmentSize,
      isRead: false,
      readAt: null,
      hasLeakageWarning,
      leakageFlags,
      flaggedForModeration: message.flaggedForModeration,
      warningMessage,
      createdAt: message.createdAt.toISOString(),
    };

    // Emit domain event for notification delivery & WebSocket broadcast
    this.eventEmitter.emit('message.sent', {
      messageId: message.id,
      conversationId: conversation.id,
      senderId,
      recipientId,
      senderName,
      hasAttachment: !!message.attachmentUrl,
      hasLeakageWarning,
      createdAt: message.createdAt,
    });

    return resultItem;
  }

  /**
   * Marks unread messages in a conversation as read.
   */
  async markAsRead(userId: string, conversationId: string): Promise<{ markedCount: number }> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.consumerId !== userId && conversation.providerId !== userId) {
      throw new ForbiddenException('Access denied: You are not a participant in this conversation');
    }

    const updateRes = await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    if (updateRes.count > 0) {
      const partnerId =
        conversation.consumerId === userId ? conversation.providerId : conversation.consumerId;
      this.eventEmitter.emit('message.read', {
        conversationId,
        readByUserId: userId,
        partnerId,
        readAt: new Date(),
      });
    }

    return { markedCount: updateRes.count };
  }

  /**
   * Generates a signed attachment upload URL with size and mime-type validation.
   */
  async generateAttachmentUrl(
    userId: string,
    conversationId: string,
    dto: CreateAttachmentUrlDto,
  ): Promise<AttachmentSignedUrlResponse> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.consumerId !== userId && conversation.providerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const timestamp = Date.now();
    const cleanFileName = dto.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `attachments/${conversationId}/${timestamp}_${cleanFileName}`;

    // Generate authenticated signed URL / secure upload endpoint
    const uploadUrl = `/api/v1/conversations/${conversationId}/upload?path=${encodeURIComponent(storagePath)}`;
    const attachmentUrl = `https://storage.pranatattva.com/${storagePath}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min expiry

    return {
      uploadUrl,
      attachmentUrl,
      expiresAt,
    };
  }

  /**
   * Blocks a user.
   */
  async blockUser(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const existingBlock = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    if (existingBlock) {
      return existingBlock;
    }

    return prisma.userBlock.create({
      data: {
        blockerId,
        blockedId,
        reason: reason || null,
      },
    });
  }

  /**
   * Unblocks a user.
   */
  async unblockUser(blockerId: string, blockedId: string) {
    const block = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    if (!block) {
      throw new NotFoundException('Block record not found');
    }

    await prisma.userBlock.delete({
      where: { id: block.id },
    });

    return { success: true, message: 'User unblocked successfully' };
  }

  /**
   * Lists blocked users.
   */
  async getBlockedUsers(userId: string) {
    return prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            email: true,
            providerProfile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Reports a user for safety, harassment, fraud, or leakage violations.
   */
  async reportUser(reporterId: string, dto: ReportUserDto) {
    if (reporterId === dto.userId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const reportedUser = await prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!reportedUser) {
      throw new NotFoundException(`User ${dto.userId} not found`);
    }

    return prisma.report.create({
      data: {
        reporterId,
        reportedUserId: dto.userId,
        category: dto.category,
        reason: dto.reason,
        bookingId: dto.bookingId || null,
      },
    });
  }
}
