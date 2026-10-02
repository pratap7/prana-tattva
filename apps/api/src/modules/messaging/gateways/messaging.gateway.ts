import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { MessagingService } from '../services/messaging.service';
import { SendMessageDto } from '@project-nirvana/shared';
import { getEnvConfig } from '../../../config/env.config';

interface SocketUser {
  id: string;
  email: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/messaging',
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * Validates JWT token on connection handshake and joins the user's personal room.
   */
  async handleConnection(socket: Socket) {
    try {
      const authHeader =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!authHeader) {
        this.logger.warn(`Socket connection rejected: No token provided (${socket.id})`);
        socket.disconnect();
        return;
      }

      const env = getEnvConfig();
      const payload = await this.jwtService.verifyAsync(authHeader, {
        secret: env.JWT_SECRET,
      });

      const user: SocketUser = {
        id: payload.sub || payload.id,
        email: payload.email,
        role: payload.role,
      };

      socket.data.user = user;
      const userRoom = `user:${user.id}`;
      await socket.join(userRoom);

      this.logger.log(`Socket client connected: ${user.id} (${socket.id}) joined ${userRoom}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown auth error';
      this.logger.warn(`Socket auth failed: ${msg} (${socket.id})`);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const user = socket.data?.user as SocketUser | undefined;
    if (user) {
      this.logger.log(`Socket disconnected: ${user.id} (${socket.id})`);
    }
  }

  /**
   * Joins a specific conversation room for real-time delivery and typing indicators.
   */
  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!data.conversationId) return;
    const room = `conv:${data.conversationId}`;
    await socket.join(room);
    return { event: 'conversation:joined', conversationId: data.conversationId };
  }

  /**
   * Leaves a specific conversation room.
   */
  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!data.conversationId) return;
    const room = `conv:${data.conversationId}`;
    await socket.leave(room);
    return { event: 'conversation:left', conversationId: data.conversationId };
  }

  /**
   * Broadcasts typing indicator to partner in conversation room.
   */
  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !data.conversationId) return;

    socket.to(`conv:${data.conversationId}`).emit('typing:update', {
      conversationId: data.conversationId,
      userId: user.id,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !data.conversationId) return;

    socket.to(`conv:${data.conversationId}`).emit('typing:update', {
      conversationId: data.conversationId,
      userId: user.id,
      isTyping: false,
    });
  }

  /**
   * Real-time message send via WebSockets.
   */
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      attachmentUrl?: string;
      attachmentType?: string;
      attachmentSize?: number;
    },
  ) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user) {
      return { error: 'Unauthorized' };
    }

    try {
      const dto: SendMessageDto = {
        content: data.content,
        attachmentUrl: data.attachmentUrl,
        attachmentType: data.attachmentType,
        attachmentSize: data.attachmentSize,
      };

      const result = await this.messagingService.sendMessage(user.id, data.conversationId, dto);

      // Broadcast to all sockets currently in the conversation room
      this.server.to(`conv:${data.conversationId}`).emit('message:received', result);

      return { status: 'ok', message: result };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      return { status: 'error', message: errorMsg };
    }
  }

  /**
   * Real-time read receipt update.
   */
  @SubscribeMessage('message:read')
  async handleMarkRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !data.conversationId) return;

    const res = await this.messagingService.markAsRead(user.id, data.conversationId);
    return res;
  }

  /**
   * Domain event listener: emits real-time event to recipient's personal user room.
   */
  @OnEvent('message.sent')
  handleDomainMessageSent(payload: {
    messageId: string;
    conversationId: string;
    senderId: string;
    recipientId: string;
    senderName: string;
    hasAttachment: boolean;
    hasLeakageWarning: boolean;
    createdAt: Date;
  }) {
    if (this.server) {
      // Emit to recipient's personal room in case they aren't on the active conversation view
      this.server.to(`user:${payload.recipientId}`).emit('message:new_alert', {
        conversationId: payload.conversationId,
        senderId: payload.senderId,
        senderName: payload.senderName,
        hasAttachment: payload.hasAttachment,
        createdAt: payload.createdAt.toISOString(),
      });
    }
  }

  /**
   * Domain event listener: notifies partner that their sent messages were read.
   */
  @OnEvent('message.read')
  handleDomainMessageRead(payload: {
    conversationId: string;
    readByUserId: string;
    partnerId: string;
    readAt: Date;
  }) {
    if (this.server) {
      this.server.to(`conv:${payload.conversationId}`).emit('message:read_receipt', {
        conversationId: payload.conversationId,
        readByUserId: payload.readByUserId,
        readAt: payload.readAt.toISOString(),
      });
      this.server.to(`user:${payload.partnerId}`).emit('message:read_receipt', {
        conversationId: payload.conversationId,
        readByUserId: payload.readByUserId,
        readAt: payload.readAt.toISOString(),
      });
    }
  }
}
