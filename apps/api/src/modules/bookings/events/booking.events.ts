import { BookingStatus, BookingEvent, CancellationPolicy } from '@project-nirvana/shared';

export interface BookingEventBase {
  bookingId: string;
  consumerId: string;
  providerId: string;
  serviceId: string;
  timestamp: string;
}

export class BookingCreatedEvent implements BookingEventBase {
  static readonly EVENT_NAME = 'booking.created';
  constructor(
    public readonly bookingId: string,
    public readonly consumerId: string,
    public readonly providerId: string,
    public readonly serviceId: string,
    public readonly startAt: string,
    public readonly endAt: string,
    public readonly pricePaise: number,
    public readonly slotLockExpiresAt: string,
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}

export class BookingConfirmedEvent implements BookingEventBase {
  static readonly EVENT_NAME = 'booking.confirmed';
  constructor(
    public readonly bookingId: string,
    public readonly consumerId: string,
    public readonly providerId: string,
    public readonly serviceId: string,
    public readonly paymentId: string,
    public readonly startAt: string,
    public readonly endAt: string,
    public readonly pricePaise: number,
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}

export class BookingRescheduledEvent implements BookingEventBase {
  static readonly EVENT_NAME = 'booking.rescheduled';
  constructor(
    public readonly bookingId: string,
    public readonly consumerId: string,
    public readonly providerId: string,
    public readonly serviceId: string,
    public readonly previousStartAt: string,
    public readonly previousEndAt: string,
    public readonly newStartAt: string,
    public readonly newEndAt: string,
    public readonly rescheduledCount: number,
    public readonly reason?: string,
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}

export class BookingCancelledEvent implements BookingEventBase {
  static readonly EVENT_NAME = 'booking.cancelled';
  constructor(
    public readonly bookingId: string,
    public readonly consumerId: string,
    public readonly providerId: string,
    public readonly serviceId: string,
    public readonly cancelledBy: 'CONSUMER' | 'PROVIDER',
    public readonly cancellationPolicy: CancellationPolicy,
    public readonly refundAmountPaise: number,
    public readonly refundPercentage: number,
    public readonly reason: string,
    public readonly strikeRecorded: boolean,
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}

export class BookingCompletedEvent implements BookingEventBase {
  static readonly EVENT_NAME = 'booking.completed';
  constructor(
    public readonly bookingId: string,
    public readonly consumerId: string,
    public readonly providerId: string,
    public readonly serviceId: string,
    public readonly attendedByBoth: boolean,
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}

export class BookingNoShowEvent implements BookingEventBase {
  static readonly EVENT_NAME = 'booking.no_show';
  constructor(
    public readonly bookingId: string,
    public readonly consumerId: string,
    public readonly providerId: string,
    public readonly serviceId: string,
    public readonly defaultingParty: 'CONSUMER' | 'PROVIDER',
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}

export class BookingStateChangedEvent implements BookingEventBase {
  static readonly EVENT_NAME = 'booking.state_changed';
  constructor(
    public readonly bookingId: string,
    public readonly consumerId: string,
    public readonly providerId: string,
    public readonly serviceId: string,
    public readonly fromState: BookingStatus,
    public readonly toState: BookingStatus,
    public readonly triggerEvent: BookingEvent,
    public readonly actorId?: string | null,
    public readonly metadata?: Record<string, unknown>,
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}
