import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  updateNotificationPreferencesSchema,
  UpdateNotificationPreferencesDto,
  registerPushSubscriptionSchema,
  RegisterPushSubscriptionDto,
} from '@project-nirvana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './services/notifications.service';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Retrieves paginated in-app notifications and unread count.
   */
  @Get()
  @ApiOperation({ summary: 'Get in-app notifications' })
  async getNotifications(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 30;
    return this.notificationsService.getInAppNotifications(user.id, parsedLimit);
  }

  /**
   * Marks a specific in-app notification as read.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') notificationId: string) {
    return this.notificationsService.markNotificationRead(user.id, notificationId);
  }

  /**
   * Marks all in-app notifications as read.
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllNotificationsRead(user.id);
  }

  /**
   * Retrieves notification preference center configuration.
   */
  @Get('preferences')
  @ApiOperation({ summary: 'Get user notification preferences' })
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUserPreferences(user.id);
  }

  /**
   * Updates notification preference center toggles per type and channel.
   */
  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema))
    dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updateUserPreferences(user.id, dto);
  }

  /**
   * Registers a web push subscription.
   */
  @Post('push-subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register web push subscription' })
  async registerPush(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerPushSubscriptionSchema))
    dto: RegisterPushSubscriptionDto,
  ) {
    return this.notificationsService.registerPushSubscription(user.id, dto);
  }

  /**
   * Retrieves notification delivery logs.
   */
  @Get('delivery-logs')
  @ApiOperation({ summary: 'Get notification delivery logs' })
  async getDeliveryLogs(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 50;
    return this.notificationsService.getDeliveryLogs(user.id, parsedLimit);
  }
}
