import { BookingStateMachine, IllegalStateTransitionException } from './booking-state-machine';
import { BookingStatus, BookingEvent } from '@project-nirvana/shared';

describe('BookingStateMachine', () => {
  describe('Valid State Transitions', () => {
    const validCases: Array<{
      current: BookingStatus;
      event: BookingEvent;
      expectedNext: BookingStatus;
    }> = [
      // From PENDING_PAYMENT
      { current: 'PENDING_PAYMENT', event: 'PAYMENT_SUCCESS', expectedNext: 'CONFIRMED' },
      {
        current: 'PENDING_PAYMENT',
        event: 'PAYMENT_FAILED',
        expectedNext: 'CANCELLED_BY_CONSUMER',
      },
      { current: 'PENDING_PAYMENT', event: 'LOCK_EXPIRED', expectedNext: 'CANCELLED_BY_CONSUMER' },
      {
        current: 'PENDING_PAYMENT',
        event: 'CANCEL_BY_CONSUMER',
        expectedNext: 'CANCELLED_BY_CONSUMER',
      },

      // From CONFIRMED
      { current: 'CONFIRMED', event: 'RESCHEDULE', expectedNext: 'CONFIRMED' },
      { current: 'CONFIRMED', event: 'CANCEL_BY_CONSUMER', expectedNext: 'CANCELLED_BY_CONSUMER' },
      { current: 'CONFIRMED', event: 'CANCEL_BY_PROVIDER', expectedNext: 'CANCELLED_BY_PROVIDER' },
      { current: 'CONFIRMED', event: 'SESSION_ATTENDED', expectedNext: 'COMPLETED' },
      { current: 'CONFIRMED', event: 'CONSUMER_NO_SHOW', expectedNext: 'NO_SHOW_CONSUMER' },
      { current: 'CONFIRMED', event: 'PROVIDER_NO_SHOW', expectedNext: 'NO_SHOW_PROVIDER' },
      { current: 'CONFIRMED', event: 'DISPUTE_RAISED', expectedNext: 'DISPUTED' },

      // From CANCELLED states to REFUNDED
      { current: 'CANCELLED_BY_CONSUMER', event: 'REFUND_PROCESSED', expectedNext: 'REFUNDED' },
      { current: 'CANCELLED_BY_PROVIDER', event: 'REFUND_PROCESSED', expectedNext: 'REFUNDED' },

      // From COMPLETED to DISPUTED
      { current: 'COMPLETED', event: 'DISPUTE_RAISED', expectedNext: 'DISPUTED' },

      // From NO_SHOW states
      { current: 'NO_SHOW_CONSUMER', event: 'DISPUTE_RAISED', expectedNext: 'DISPUTED' },
      { current: 'NO_SHOW_PROVIDER', event: 'REFUND_PROCESSED', expectedNext: 'REFUNDED' },
      { current: 'NO_SHOW_PROVIDER', event: 'DISPUTE_RAISED', expectedNext: 'DISPUTED' },

      // From DISPUTED
      { current: 'DISPUTED', event: 'REFUND_PROCESSED', expectedNext: 'REFUNDED' },
      { current: 'DISPUTED', event: 'SESSION_ATTENDED', expectedNext: 'COMPLETED' },
    ];

    test.each(validCases)(
      'should transition from $current via $event to $expectedNext',
      ({ current, event, expectedNext }) => {
        expect(BookingStateMachine.canTransition(current, event)).toBe(true);
        const next = BookingStateMachine.getNextState(current, event, 'booking-123');
        expect(next).toBe(expectedNext);
      },
    );
  });

  describe('Illegal State Transitions (Must throw)', () => {
    const invalidCases: Array<{
      current: BookingStatus;
      event: BookingEvent;
    }> = [
      // Cannot pay for already completed or cancelled bookings
      { current: 'COMPLETED', event: 'PAYMENT_SUCCESS' },
      { current: 'CANCELLED_BY_CONSUMER', event: 'PAYMENT_SUCCESS' },
      { current: 'CANCELLED_BY_PROVIDER', event: 'PAYMENT_SUCCESS' },
      { current: 'REFUNDED', event: 'PAYMENT_SUCCESS' },

      // Cannot cancel an already completed booking
      { current: 'COMPLETED', event: 'CANCEL_BY_CONSUMER' },
      { current: 'COMPLETED', event: 'CANCEL_BY_PROVIDER' },

      // Cannot attend or reschedule before payment
      { current: 'PENDING_PAYMENT', event: 'SESSION_ATTENDED' },
      { current: 'PENDING_PAYMENT', event: 'RESCHEDULE' },
      { current: 'PENDING_PAYMENT', event: 'CONSUMER_NO_SHOW' },

      // Terminal state REFUNDED cannot transition
      { current: 'REFUNDED', event: 'RESCHEDULE' },
      { current: 'REFUNDED', event: 'CANCEL_BY_CONSUMER' },
      { current: 'REFUNDED', event: 'SESSION_ATTENDED' },
      { current: 'REFUNDED', event: 'DISPUTE_RAISED' },

      // Cannot expire lock on confirmed or completed booking
      { current: 'CONFIRMED', event: 'LOCK_EXPIRED' },
      { current: 'COMPLETED', event: 'LOCK_EXPIRED' },
    ];

    test.each(invalidCases)(
      'should throw IllegalStateTransitionException when applying $event to $current',
      ({ current, event }) => {
        expect(BookingStateMachine.canTransition(current, event)).toBe(false);
        expect(() => {
          BookingStateMachine.getNextState(current, event, 'booking-test');
        }).toThrow(IllegalStateTransitionException);
      },
    );

    it('should include error details in the thrown exception', () => {
      try {
        BookingStateMachine.getNextState('COMPLETED', 'CANCEL_BY_CONSUMER', 'booking-xyz');
        fail('Should have thrown an exception');
      } catch (err) {
        expect(err).toBeInstanceOf(IllegalStateTransitionException);
        const ex = err as IllegalStateTransitionException;
        expect(ex.currentState).toBe('COMPLETED');
        expect(ex.event).toBe('CANCEL_BY_CONSUMER');
        expect(ex.bookingId).toBe('booking-xyz');
      }
    });
  });
});
