import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SessionsService } from '../services/sessions.service';

export interface BookingConfirmedEvent {
  bookingId: string;
}

@Injectable()
export class SessionBookingListener {
  private readonly logger = new Logger(SessionBookingListener.name);

  constructor(private readonly sessionsService: SessionsService) {}

  @OnEvent('booking.confirmed', { async: true })
  async handleBookingConfirmed(event: BookingConfirmedEvent): Promise<void> {
    try {
      this.logger.log(
        `Booking confirmed event received for ${event.bookingId}, provisioning Daily.co room`,
      );
      await this.sessionsService.provisionRoomForBooking(event.bookingId);
    } catch (err) {
      this.logger.error(
        `Failed to provision Daily room for confirmed booking ${event.bookingId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
