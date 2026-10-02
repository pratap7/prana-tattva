import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Req,
  Ip,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import {
  recordingConsentSchema,
  RecordingConsentDto,
  extendSessionSchema,
  ExtendSessionDto,
  JoinSessionResponse,
  SessionStatusResponse,
} from '@project-nirvana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionsService } from './services/sessions.service';

interface UserJwtPayload {
  id?: string;
  userId?: string;
  email: string;
  role: string;
}

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post(':bookingId/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Join secure Daily.co video session',
    description:
      'Validates that caller is the booking consumer or provider and session window is open (-10m to +30m). Generates on-demand meeting token.',
  })
  @ApiResponse({ status: 200, description: 'Token and room details returned' })
  @HttpCode(HttpStatus.OK)
  async joinSession(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
  ): Promise<JoinSessionResponse> {
    const userId = user.id || user.userId || '';
    return this.sessionsService.joinSession(userId, bookingId);
  }

  @Get(':bookingId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get session status, timing window, partner presence, and in-person details',
  })
  @ApiResponse({ status: 200, description: 'Session status retrieved' })
  async getSessionStatus(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
  ): Promise<SessionStatusResponse> {
    const userId = user.id || user.userId || '';
    return this.sessionsService.getSessionStatus(userId, bookingId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Daily.co webhook receiver',
    description:
      'Receives participant.joined and meeting.ended events. Updates timestamps and executes completion/no-show logic.',
  })
  @ApiHeader({ name: 'x-webhook-signature', required: false })
  async handleWebhook(
    @Req() req: RequestWithRawBody,
    @Headers('x-webhook-signature') webhookSignature?: string,
    @Headers('x-daily-signature') dailySignature?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Body() payload?: any,
  ): Promise<{ status: string; event: string }> {
    const signature = webhookSignature || dailySignature || '';
    const rawBody = req.rawBody ? req.rawBody.toString('utf-8') : JSON.stringify(payload || {});
    return this.sessionsService.handleDailyWebhook(rawBody, signature, payload || {});
  }

  @Post(':bookingId/recording/consent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Grant explicit consent for session recording',
    description:
      'Recording is OFF by default. Strictly prohibited for Psychotherapy. Requires double consent from both participants.',
  })
  @HttpCode(HttpStatus.OK)
  async grantRecordingConsent(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
    @Body(new ZodValidationPipe(recordingConsentSchema)) _dto: RecordingConsentDto,
    @Ip() clientIp: string,
  ) {
    const userId = user.id || user.userId || '';
    return this.sessionsService.grantRecordingConsent(userId, bookingId, clientIp);
  }

  @Post(':bookingId/recording/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start cloud recording on Daily.co room',
    description:
      'Requires explicit consent from both participants. Strictly forbidden for Psychotherapy.',
  })
  @HttpCode(HttpStatus.OK)
  async startRecording(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
  ): Promise<{ recordingId: string }> {
    const userId = user.id || user.userId || '';
    return this.sessionsService.startRecording(userId, bookingId);
  }

  @Post(':bookingId/extend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Extend session room expiration by 5 to 30 minutes',
    description:
      'Allows practitioner to extend an active session if no subsequent appointment conflicts.',
  })
  @HttpCode(HttpStatus.OK)
  async extendSession(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
    @Body(new ZodValidationPipe(extendSessionSchema)) dto: ExtendSessionDto,
  ): Promise<{ extendedMinutes: number; newEndAt: string }> {
    const userId = user.id || user.userId || '';
    return this.sessionsService.extendSession(userId, bookingId, dto.minutes);
  }
}
