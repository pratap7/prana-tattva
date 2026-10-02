import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  sendMessageSchema,
  SendMessageDto,
  createAttachmentUrlSchema,
  CreateAttachmentUrlDto,
  blockUserSchema,
  reportUserSchema,
  getMessagesQuerySchema,
  GetMessagesQueryDto,
  ConversationSummary,
  MessageItem,
  AttachmentSignedUrlResponse,
} from '@project-nirvana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagingService } from './services/messaging.service';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  /**
   * Lists all conversations for the authenticated user.
   */
  @Get('conversations')
  @ApiOperation({ summary: 'List all conversations for authenticated user' })
  @ApiResponse({ status: 200, description: 'Conversations with latest decrypted message' })
  async getConversations(@CurrentUser() user: AuthenticatedUser): Promise<ConversationSummary[]> {
    return this.messagingService.getConversations(user.id);
  }

  /**
   * Initiates or fetches a conversation between current consumer and a provider.
   */
  @Post('conversations/with/:providerId')
  @ApiOperation({ summary: 'Get or start conversation with a provider' })
  async getOrCreateConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
  ) {
    const conv = await this.messagingService.getOrCreateConversation(user.id, providerId);
    return {
      id: conv.id,
      consumerId: conv.consumerId,
      providerId: conv.providerId,
      bookingId: conv.bookingId,
      isUnlocked: conv.isUnlocked,
      preBookingMessageCount: conv.preBookingMessageCount,
      createdAt: conv.createdAt.toISOString(),
    };
  }

  /**
   * Retrieves messages for a conversation with pagination/cursor.
   */
  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  async getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Query(new ZodValidationPipe(getMessagesQuerySchema)) query: GetMessagesQueryDto,
  ) {
    return this.messagingService.getConversationMessages(user.id, conversationId, query);
  }

  /**
   * Sends a message in a conversation (REST fallback).
   */
  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message (REST fallback)' })
  @ApiResponse({ status: 201, description: 'Message sent and encrypted' })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<MessageItem> {
    return this.messagingService.sendMessage(user.id, conversationId, dto);
  }

  /**
   * Marks unread messages in a conversation as read.
   */
  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation messages as read' })
  async markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') conversationId: string) {
    return this.messagingService.markAsRead(user.id, conversationId);
  }

  /**
   * Generates a signed attachment upload URL.
   */
  @Post('conversations/:id/attachment-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get signed image upload URL' })
  async getAttachmentUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(createAttachmentUrlSchema)) dto: CreateAttachmentUrlDto,
  ): Promise<AttachmentSignedUrlResponse> {
    return this.messagingService.generateAttachmentUrl(user.id, conversationId, dto);
  }

  /**
   * Blocks a user.
   */
  @Post('users/:id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user' })
  async blockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') blockedId: string,
    @Body(new ZodValidationPipe(blockUserSchema.omit({ userId: true }).optional()))
    body?: { reason?: string },
  ) {
    return this.messagingService.blockUser(user.id, blockedId, body?.reason);
  }

  /**
   * Unblocks a user.
   */
  @Delete('users/:id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user' })
  async unblockUser(@CurrentUser() user: AuthenticatedUser, @Param('id') blockedId: string) {
    return this.messagingService.unblockUser(user.id, blockedId);
  }

  /**
   * Lists blocked users.
   */
  @Get('users/blocks')
  @ApiOperation({ summary: 'List blocked users' })
  async getBlockedUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.getBlockedUsers(user.id);
  }

  /**
   * Reports a user for safety, harassment, fraud, or off-platform leakage.
   */
  @Post('users/:id/report')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a user for policy violation' })
  async reportUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') reportedUserId: string,
    @Body(new ZodValidationPipe(reportUserSchema.omit({ userId: true })))
    body: {
      category: 'HARASSMENT' | 'UNPROFESSIONAL' | 'FRAUD' | 'NO_SHOW' | 'LEAKAGE' | 'SAFETY';
      reason: string;
      bookingId?: string | null;
    },
  ) {
    return this.messagingService.reportUser(user.id, {
      userId: reportedUserId,
      category: body.category,
      reason: body.reason,
      bookingId: body.bookingId,
    });
  }
}
