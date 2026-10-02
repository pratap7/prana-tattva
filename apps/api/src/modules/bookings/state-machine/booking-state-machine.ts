import { BadRequestException } from '@nestjs/common';
import { BookingStatus, BookingEvent } from '@project-nirvana/shared';

export class IllegalStateTransitionException extends BadRequestException {
  constructor(
    public readonly currentState: BookingStatus,
    public readonly event: BookingEvent,
    public readonly bookingId?: string,
  ) {
    super({
      code: 'ILLEGAL_STATE_TRANSITION',
      message: `Invalid state transition: Cannot apply event '${event}' to booking in state '${currentState}'`,
      details: {
        bookingId,
        currentState,
        attemptedEvent: event,
      },
    });
  }
}

/**
 * Hand-rolled explicit transition table for the Booking Lifecycle.
 * Maps: CurrentState -> Event -> NextState
 */
export const BOOKING_TRANSITIONS: Partial<
  Record<BookingStatus, Partial<Record<BookingEvent, BookingStatus>>>
> = {
  PENDING_PAYMENT: {
    PAYMENT_SUCCESS: 'CONFIRMED',
    PAYMENT_FAILED: 'CANCELLED_BY_CONSUMER',
    LOCK_EXPIRED: 'CANCELLED_BY_CONSUMER',
    CANCEL_BY_CONSUMER: 'CANCELLED_BY_CONSUMER',
  },
  CONFIRMED: {
    RESCHEDULE: 'CONFIRMED',
    CANCEL_BY_CONSUMER: 'CANCELLED_BY_CONSUMER',
    CANCEL_BY_PROVIDER: 'CANCELLED_BY_PROVIDER',
    SESSION_ATTENDED: 'COMPLETED',
    CONSUMER_NO_SHOW: 'NO_SHOW_CONSUMER',
    PROVIDER_NO_SHOW: 'NO_SHOW_PROVIDER',
    DISPUTE_RAISED: 'DISPUTED',
  },
  CANCELLED_BY_CONSUMER: {
    REFUND_PROCESSED: 'REFUNDED',
  },
  CANCELLED_BY_PROVIDER: {
    REFUND_PROCESSED: 'REFUNDED',
  },
  COMPLETED: {
    DISPUTE_RAISED: 'DISPUTED',
  },
  NO_SHOW_CONSUMER: {
    DISPUTE_RAISED: 'DISPUTED',
  },
  NO_SHOW_PROVIDER: {
    REFUND_PROCESSED: 'REFUNDED',
    DISPUTE_RAISED: 'DISPUTED',
  },
  DISPUTED: {
    REFUND_PROCESSED: 'REFUNDED',
    SESSION_ATTENDED: 'COMPLETED',
  },
  REFUNDED: {},
};

export class BookingStateMachine {
  /**
   * Determine the next valid state or throw an IllegalStateTransitionException
   */
  static getNextState(
    currentState: BookingStatus,
    event: BookingEvent,
    bookingId?: string,
  ): BookingStatus {
    const stateTransitions = BOOKING_TRANSITIONS[currentState];
    if (!stateTransitions) {
      throw new IllegalStateTransitionException(currentState, event, bookingId);
    }

    const nextState = stateTransitions[event];
    if (!nextState) {
      throw new IllegalStateTransitionException(currentState, event, bookingId);
    }

    return nextState;
  }

  /**
   * Validate if a transition is legal without throwing
   */
  static canTransition(currentState: BookingStatus, event: BookingEvent): boolean {
    const stateTransitions = BOOKING_TRANSITIONS[currentState];
    if (!stateTransitions) return false;
    return !!stateTransitions[event];
  }
}
