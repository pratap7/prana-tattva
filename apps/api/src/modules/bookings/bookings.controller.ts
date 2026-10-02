import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  createBookingSchema,
  CreateBookingDto,
  rescheduleBookingSchema,
  RescheduleBookingDto,
  cancelBookingSchema,
  CancelBookingDto,
  paymentWebhookSchema,
  PaymentWebhookDto,
  recordAttendanceSchema,
  RecordAttendanceDto,
  BookingSummaryResponse,
} from '@project-nirvana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BookingsService } from './services/bookings.service';

interface UserJwtPayload {
  userId: string;
  email: string;
  role: string;
}

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CONSUMER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create booking reservation with 10-minute concurrency-safe slot lock',
    description:
      'Creates a booking in PENDING_PAYMENT state and acquires an atomic slot lock backed by Redis and PostgreSQL DB exclusion.',
  })
  @ApiResponse({ status: 201, description: 'Booking slot locked successfully' })
  @ApiResponse({
    status: 409,
    description: 'Slot collision: slot is currently locked or already booked',
  })
  async createBooking(
    @CurrentUser() user: UserJwtPayload,
    @Body(new ZodValidationPipe(createBookingSchema)) dto: CreateBookingDto,
  ): Promise<BookingSummaryResponse> {
    return this.bookingsService.createBooking(user.userId, dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CONSUMER')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get consumer's bookings (upcoming or past)" })
  @ApiQuery({ name: 'filter', required: false, enum: ['upcoming', 'past'] })
  async listConsumerBookings(
    @CurrentUser() user: UserJwtPayload,
    @Query('filter') filter?: 'upcoming' | 'past',
  ): Promise<BookingSummaryResponse[]> {
    return this.bookingsService.listConsumerBookings(user.userId, filter);
  }

  @Get('provider/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get provider's scheduled appointments and requests calendar" })
  @ApiQuery({ name: 'filter', required: false, enum: ['upcoming', 'past'] })
  async listProviderBookings(
    @CurrentUser() user: UserJwtPayload,
    @Query('filter') filter?: 'upcoming' | 'past',
  ): Promise<BookingSummaryResponse[]> {
    return this.bookingsService.listProviderBookings(user.userId, filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get booking summary and real-time slot lock remaining countdown' })
  async getBooking(
    @Param('id') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
  ): Promise<BookingSummaryResponse> {
    return this.bookingsService.getBooking(bookingId, user.userId);
  }

  @Post(':id/reschedule')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reschedule an appointment slot',
    description:
      'Re-validates practitioner availability and cancellation policy rules, preserves existing payment, and atomically updates the appointment slot.',
  })
  async rescheduleBooking(
    @Param('id') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
    @Body(new ZodValidationPipe(rescheduleBookingSchema)) dto: RescheduleBookingDto,
  ): Promise<BookingSummaryResponse> {
    return this.bookingsService.rescheduleBooking(bookingId, user.userId, dto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel an appointment slot and compute refund per policy',
    description:
      'Calculates refund amount according to service cancellation policy (FLEXIBLE, MODERATE, STRICT). Provider cancellation always yields 100% refund and records a reliability strike.',
  })
  async cancelBooking(
    @Param('id') bookingId: string,
    @CurrentUser() user: UserJwtPayload,
    @Body(new ZodValidationPipe(cancelBookingSchema)) dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelBooking(bookingId, user.userId, dto.reason);
  }

  @Post(':id/attendance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record session attendance timestamp' })
  async recordAttendance(
    @Param('id') bookingId: string,
    @Body(new ZodValidationPipe(recordAttendanceSchema)) dto: RecordAttendanceDto,
  ): Promise<{ success: boolean }> {
    await this.bookingsService.recordAttendance(
      bookingId,
      dto.party,
      dto.joinedAt ? new Date(dto.joinedAt) : new Date(),
    );
    return { success: true };
  }

  @Post('webhook/payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Idempotent Payment Webhook',
    description:
      'Transitions booking from PENDING_PAYMENT to CONFIRMED on payment success, or CANCELLED on failure. Cancels slot lock expiration job.',
  })
  async handlePaymentWebhook(
    @Body(new ZodValidationPipe(paymentWebhookSchema)) dto: PaymentWebhookDto,
  ) {
    return this.bookingsService.handlePaymentWebhook(dto);
  }
}
