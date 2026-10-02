import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { prisma, BookingStatus, ServiceMode, ConsentType, Session } from '@project-nirvana/db';
import {
  JoinSessionResponse,
  SessionStatusResponse,
  InPersonSessionDetails,
} from '@project-nirvana/shared';
import {
  DAILY_VIDEO_PROVIDER,
  DailyVideoProvider,
} from '../interfaces/daily-video-provider.interface';
import { AuditService } from '../../audit/audit.service';
import { getEnvConfig } from '../../../config/env.config';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @Inject(DAILY_VIDEO_PROVIDER)
    private readonly dailyProvider: DailyVideoProvider,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Generates a cryptographically random room name (never exposes booking ID).
   */
  generateRandomRoomName(): string {
    const randomHex = crypto.randomBytes(8).toString('hex');
    return `nirvana-${randomHex}`;
  }

  /**
   * Checks if a service category represents Psychotherapy or mental health sessions,
   * where recording is legally/ethically prohibited.
   */
  isPsychotherapySession(categoryName?: string | null, categorySlug?: string | null): boolean {
    const name = (categoryName || '').toLowerCase();
    const slug = (categorySlug || '').toLowerCase();
    return (
      name.includes('psychotherapy') ||
      name.includes('psycho') ||
      name.includes('mental health') ||
      slug.includes('psychotherapy') ||
      slug.includes('psycho')
    );
  }

  /**
   * Provisions a private Daily.co video room when a booking is confirmed.
   * Scheduled window: valid from 10 minutes before start to 30 minutes after end.
   */
  async provisionRoomForBooking(bookingId: string): Promise<Session | null> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          include: { category: true },
        },
        session: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    // Only ONLINE sessions require a Daily.co video room
    if (booking.service.mode !== ServiceMode.ONLINE) {
      this.logger.log(
        `Booking ${bookingId} is ${booking.service.mode}, skipping video room provisioning`,
      );
      return null;
    }

    // Reuse existing room if already generated
    if (booking.session?.videoRoomName) {
      return booking.session;
    }

    const startAtEpoch = Math.floor(new Date(booking.startAt).getTime() / 1000);
    const endAtEpoch = Math.floor(new Date(booking.endAt).getTime() / 1000);

    // 10 minutes before to 30 minutes after
    const nbf = startAtEpoch - 10 * 60;
    const exp = endAtEpoch + 30 * 60;

    // Cryptographically random room name - NEVER derived from booking ID!
    const roomName = this.generateRandomRoomName();

    const roomInfo = await this.dailyProvider.createRoom({
      name: roomName,
      nbf,
      exp,
      privacy: 'private',
      enableKnocking: true,
      enableScreenshare: true,
    });

    const session = await prisma.session.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        videoRoomName: roomInfo.name,
        videoRoomUrl: roomInfo.url,
        recordingStatus: 'DISABLED',
      },
      update: {
        videoRoomName: roomInfo.name,
        videoRoomUrl: roomInfo.url,
      },
    });

    this.logger.log(`Provisioned Daily.co private room ${roomInfo.name} for booking ${bookingId}`);
    return session;
  }

  /**
   * Validates join permissions and time window, and generates an on-demand meeting token.
   */
  async joinSession(userId: string, bookingId: string): Promise<JoinSessionResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          include: { category: true },
        },
        consumer: true,
        provider: {
          include: { providerProfile: true },
        },
        session: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    // 1. Ownership & Authorization Check
    const isConsumer = booking.consumerId === userId;
    const isProvider = booking.providerId === userId;

    if (!isConsumer && !isProvider) {
      throw new ForbiddenException('Access denied: You are not a participant of this booking');
    }

    // 2. Booking State Check
    if (booking.status !== BookingStatus.CONFIRMED) {
      if (booking.status === BookingStatus.PENDING_PAYMENT) {
        throw new BadRequestException('Cannot join session: Payment is pending');
      }
      if (
        booking.status === BookingStatus.CANCELLED_BY_CONSUMER ||
        booking.status === BookingStatus.CANCELLED_BY_PROVIDER ||
        booking.status === BookingStatus.NO_SHOW_CONSUMER ||
        booking.status === BookingStatus.NO_SHOW_PROVIDER
      ) {
        throw new BadRequestException(
          'Cannot join session: Appointment has been cancelled or marked no-show',
        );
      }
      if (booking.status === BookingStatus.COMPLETED) {
        throw new BadRequestException('Cannot join session: Session has already ended');
      }
      throw new BadRequestException(`Cannot join session in status ${booking.status}`);
    }

    // 3. Time Window Validation
    const now = Date.now();
    const startMs = new Date(booking.startAt).getTime();
    const endMs = new Date(booking.endAt).getTime();
    const extendedMs = (booking.session?.extendedMinutes || 0) * 60 * 1000;

    const windowStartMs = startMs - 10 * 60 * 1000; // 10 minutes before
    const windowEndMs = endMs + 30 * 60 * 1000 + extendedMs; // 30 minutes after + extension

    if (now < windowStartMs) {
      const opensAtIso = new Date(windowStartMs).toISOString();
      throw new BadRequestException(
        `Session window opens 10 minutes before start time at ${opensAtIso}`,
      );
    }

    if (now > windowEndMs) {
      const expiredAtIso = new Date(windowEndMs).toISOString();
      throw new BadRequestException(`Session window expired at ${expiredAtIso}`);
    }

    // Ensure session room exists (provision on demand if not yet provisioned)
    let session = booking.session;
    if (!session || !session.videoRoomName) {
      session = await this.provisionRoomForBooking(booking.id);
    }

    const roomName = session?.videoRoomName || this.generateRandomRoomName();
    const env = getEnvConfig();
    const domain = env.DAILY_DOMAIN || 'pranatattva';
    const roomUrl = session?.videoRoomUrl || `https://${domain}.daily.co/${roomName}`;

    // 4. Token Configuration
    const isOwner = isProvider;
    const providerDisplayName = booking.provider.providerProfile?.displayName || 'Practitioner';
    const consumerDisplayName = booking.consumer.email.split('@')[0];
    const participantName = isOwner ? providerDisplayName : consumerDisplayName;
    const expiryEpochSec = Math.floor(windowEndMs / 1000);

    const token = await this.dailyProvider.createMeetingToken({
      roomName,
      isOwner,
      userId,
      userName: participantName,
      expiryEpochSec,
      enableScreenshare: isOwner, // Screen share allowed exclusively for provider
    });

    // 5. Psychotherapy & Recording Restrictions
    const isPsychotherapy = this.isPsychotherapySession(
      booking.service.category.name,
      booking.service.category.slug,
    );
    const recordingAllowed = !isPsychotherapy;

    // Check consents
    const consents = (session?.recordingConsents as Record<string, unknown>) || {};
    const consumerConsented = !!consents[booking.consumerId];
    const providerConsented = !!consents[booking.providerId];

    const partner = isConsumer
      ? {
          id: booking.provider.id,
          name: providerDisplayName,
          role: 'PROVIDER',
          avatarUrl: booking.provider.providerProfile?.avatarUrl || null,
        }
      : {
          id: booking.consumer.id,
          name: consumerDisplayName,
          role: 'CONSUMER',
          avatarUrl: null,
        };

    return {
      token,
      roomUrl,
      roomName,
      isOwner,
      sessionStartAt: booking.startAt.toISOString(),
      sessionEndAt: booking.endAt.toISOString(),
      windowExpiresAt: new Date(windowEndMs).toISOString(),
      mode: booking.service.mode,
      serviceTitle: booking.service.title,
      partner,
      recordingAllowed,
      isPsychotherapy,
      recordingStatus:
        (session?.recordingStatus as 'DISABLED' | 'CONSENT_PENDING' | 'RECORDING' | 'COMPLETED') ||
        'DISABLED',
      recordingConsents: {
        consumer: consumerConsented,
        provider: providerConsented,
      },
    };
  }

  /**
   * Retrieves current session status, timing, partner presence, and in-person details.
   */
  async getSessionStatus(userId: string, bookingId: string): Promise<SessionStatusResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          include: { category: true },
        },
        session: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    if (booking.consumerId !== userId && booking.providerId !== userId) {
      throw new ForbiddenException('Access denied: You are not a participant of this booking');
    }

    const now = Date.now();
    const startMs = new Date(booking.startAt).getTime();
    const endMs = new Date(booking.endAt).getTime();
    const extendedMs = (booking.session?.extendedMinutes || 0) * 60 * 1000;

    const windowStartMs = startMs - 10 * 60 * 1000;
    const windowEndMs = endMs + 30 * 60 * 1000 + extendedMs;

    const isWindowOpen = now >= windowStartMs && now <= windowEndMs;
    const canJoin = isWindowOpen && booking.status === BookingStatus.CONFIRMED;

    const isPsychotherapy = this.isPsychotherapySession(
      booking.service.category.name,
      booking.service.category.slug,
    );

    const consents = (booking.session?.recordingConsents as Record<string, unknown>) || {};
    const consumerConsented = !!consents[booking.consumerId];
    const providerConsented = !!consents[booking.providerId];

    // In-Person Location Details (Masked until CONFIRMED)
    let inPersonDetails: InPersonSessionDetails | undefined = undefined;
    if (booking.service.mode === ServiceMode.IN_PERSON) {
      const isConfirmed =
        booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.COMPLETED;

      inPersonDetails = {
        address: isConfirmed
          ? booking.service.locationAddress || 'Sanctuary Address Provided'
          : 'Exact address unlocked upon booking confirmation',
        city: booking.service.locationCity || 'Rishikesh',
        instructions: isConfirmed ? booking.service.locationInstructions || null : null,
        coordinates: isConfirmed
          ? (booking.service.locationCoordinates as { lat: number; lng: number }) || null
          : null,
      };
    }

    return {
      bookingId: booking.id,
      status: booking.status,
      mode: booking.service.mode,
      windowOpensAt: new Date(windowStartMs).toISOString(),
      windowClosesAt: new Date(windowEndMs).toISOString(),
      isWindowOpen,
      canJoin,
      roomName: booking.session?.videoRoomName || null,
      joinedByConsumerAt: booking.session?.joinedByConsumerAt?.toISOString() || null,
      joinedByProviderAt: booking.session?.joinedByProviderAt?.toISOString() || null,
      startedAt: booking.session?.startedAt?.toISOString() || null,
      endedAt: booking.session?.endedAt?.toISOString() || null,
      isProviderPresent: !!booking.session?.joinedByProviderAt,
      recordingStatus:
        (booking.session?.recordingStatus as
          'DISABLED' | 'CONSENT_PENDING' | 'RECORDING' | 'COMPLETED') || 'DISABLED',
      recordingConsents: {
        consumer: consumerConsented,
        provider: providerConsented,
      },
      recordingAllowed: !isPsychotherapy,
      isPsychotherapy,
      extendedMinutes: booking.session?.extendedMinutes || 0,
      inPersonDetails,
    };
  }

  /**
   * Handles Daily.co webhooks with signature verification.
   * Updates joinedAt/endedAt timestamps, and feeds completion and no-show logic.
   */
  async handleDailyWebhook(
    rawBody: string,
    signature: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
  ): Promise<{ status: string; event: string }> {
    // 1. Verify Webhook Signature
    const isValid = this.dailyProvider.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn('Daily webhook received with invalid signature');
      throw new ForbiddenException('Invalid Daily webhook signature');
    }

    const event = payload.event || payload.type;
    const roomName =
      payload.room || payload.room_name || payload.payload?.room || payload.payload?.room_name;

    if (!roomName) {
      return { status: 'ignored', event: event || 'unknown' };
    }

    const session = await prisma.session.findFirst({
      where: { videoRoomName: roomName },
      include: {
        booking: {
          include: {
            consumer: true,
            provider: { include: { providerProfile: true } },
          },
        },
      },
    });

    if (!session) {
      this.logger.warn(`No session found for Daily room name: ${roomName}`);
      return { status: 'ignored', event };
    }

    const booking = session.booking;
    const now = new Date();

    // 2. Participant Joined Event
    if (event === 'participant.joined' || event === 'participant-joined') {
      const participant = payload.participant || payload.payload?.participant || {};
      const participantUserId = participant.user_id;
      const isOwner = participant.owner === true;

      const isProvider = isOwner || participantUserId === booking.providerId;
      const isConsumer = !isOwner && (participantUserId === booking.consumerId || !isProvider);

      const updateData: Record<string, unknown> = {};

      if (isProvider && !session.joinedByProviderAt) {
        updateData.joinedByProviderAt = now;
      }
      if (isConsumer && !session.joinedByConsumerAt) {
        updateData.joinedByConsumerAt = now;
      }

      // If both participants have now joined, set startedAt and emit session.started
      const hasConsumer = session.joinedByConsumerAt || isConsumer;
      const hasProvider = session.joinedByProviderAt || isProvider;
      if (hasConsumer && hasProvider && !session.startedAt) {
        updateData.startedAt = now;
        this.eventEmitter.emit('session.started', { bookingId: booking.id });
      }

      await prisma.session.update({
        where: { id: session.id },
        data: updateData,
      });

      return { status: 'processed', event };
    }

    // 3. Meeting / Session Ended Event (Feeds Completion and No-Show Logic)
    if (event === 'meeting.ended' || event === 'session.ended' || event === 'meeting-ended') {
      await prisma.session.update({
        where: { id: session.id },
        data: { endedAt: now },
      });

      const joinedProvider = session.joinedByProviderAt;
      const joinedConsumer = session.joinedByConsumerAt;

      // Evaluation Case A: Both parties attended -> Mark COMPLETED
      if (joinedProvider && joinedConsumer) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.COMPLETED },
        });

        // Increment provider's completed session count
        if (booking.provider.providerProfile) {
          await prisma.providerProfile.update({
            where: { id: booking.provider.providerProfile.id },
            data: { completedSessions: { increment: 1 } },
          });
        }

        // Emits booking.completed to trigger EscrowService release & Route payout scheduling
        this.eventEmitter.emit('booking.completed', {
          bookingId: booking.id,
          providerId: booking.providerId,
          consumerId: booking.consumerId,
          completedAt: now,
        });

        await this.auditService.record({
          userId: null,
          action: 'SESSION_COMPLETED',
          entityType: 'Booking',
          entityId: booking.id,
          metadata: {
            durationMinutes: session.startedAt
              ? Math.round((now.getTime() - session.startedAt.getTime()) / 60000)
              : 0,
          },
        });

        return { status: 'completed', event };
      }

      // Evaluation Case B: Provider NEVER joined -> Provider NO-SHOW
      if (!joinedProvider && joinedConsumer) {
        this.logger.warn(`Provider NO-SHOW detected for booking ${booking.id}`);

        // Add reliability strike to provider
        if (booking.provider.providerProfile) {
          await prisma.providerProfile.update({
            where: { id: booking.provider.providerProfile.id },
            data: { reliabilityStrikes: { increment: 1 } },
          });
        }

        // Cancel booking and issue 100% refund to consumer
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.CANCELLED_BY_PROVIDER,
            refundAmount: booking.priceSnapshot,
            refundReason: 'Provider no-show for scheduled appointment',
            cancelledAt: now,
          },
        });

        this.eventEmitter.emit('booking.cancelled', {
          bookingId: booking.id,
          cancelledBy: 'PROVIDER',
          refundAmount: booking.priceSnapshot,
          reason: 'Provider no-show',
        });

        await this.auditService.record({
          userId: booking.providerId,
          action: 'PROVIDER_NO_SHOW_PENALTY',
          entityType: 'Booking',
          entityId: booking.id,
          metadata: { refundIssued: booking.priceSnapshot, strikeAdded: true },
        });

        return { status: 'provider_no_show', event };
      }

      // Evaluation Case C: Consumer NEVER joined -> Consumer NO-SHOW
      if (joinedProvider && !joinedConsumer) {
        this.logger.warn(`Consumer NO-SHOW detected for booking ${booking.id}`);

        // Mark COMPLETED without refund (practitioner still gets paid for reserved slot)
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.COMPLETED,
            refundAmount: 0,
            refundReason: 'Consumer no-show',
          },
        });

        this.eventEmitter.emit('booking.completed', {
          bookingId: booking.id,
          providerId: booking.providerId,
          consumerId: booking.consumerId,
          completedAt: now,
          isConsumerNoShow: true,
        });

        await this.auditService.record({
          userId: booking.consumerId,
          action: 'CONSUMER_NO_SHOW',
          entityType: 'Booking',
          entityId: booking.id,
          metadata: { refundIssued: 0, providerPaid: true },
        });

        return { status: 'consumer_no_show', event };
      }

      return { status: 'unattended', event };
    }

    return { status: 'received', event };
  }

  /**
   * Explicit recording consent engine.
   * Recording is OFF by default. Strictly prohibited for psychotherapy.
   * Requires explicit consent from both parties.
   */
  async grantRecordingConsent(
    userId: string,
    bookingId: string,
    clientIp?: string,
  ): Promise<{
    status: string;
    recordingAllowed: boolean;
    consents: { consumer: boolean; provider: boolean };
  }> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          include: { category: true },
        },
        session: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    if (booking.consumerId !== userId && booking.providerId !== userId) {
      throw new ForbiddenException('Access denied: You are not a participant of this booking');
    }

    // STRICT REGULATORY CHECK: Psychotherapy sessions can NEVER be recorded
    const isPsychotherapy = this.isPsychotherapySession(
      booking.service.category.name,
      booking.service.category.slug,
    );

    if (isPsychotherapy) {
      throw new ForbiddenException(
        'Recording is strictly prohibited for psychotherapy and mental health sessions by regulation and platform policy',
      );
    }

    // Record consent in ConsentRecord table
    await prisma.consentRecord.create({
      data: {
        userId,
        consentType: ConsentType.SESSION_RECORDING,
        version: '1.0',
        ipAddress: clientIp || '127.0.0.1',
      },
    });

    const session = booking.session || (await this.provisionRoomForBooking(booking.id));
    const currentConsents = (session?.recordingConsents as Record<string, unknown>) || {};
    const updatedConsents = {
      ...currentConsents,
      [userId]: {
        grantedAt: new Date().toISOString(),
        ip: clientIp || null,
      },
    };

    const consumerConsented = !!updatedConsents[booking.consumerId];
    const providerConsented = !!updatedConsents[booking.providerId];
    const bothConsented = consumerConsented && providerConsented;

    const newRecordingStatus = bothConsented ? 'CONSENT_GRANTED' : 'CONSENT_PENDING';

    if (session) {
      await prisma.session.update({
        where: { id: session.id },
        data: {
          recordingConsents: JSON.parse(JSON.stringify(updatedConsents)),
          recordingStatus: newRecordingStatus,
        },
      });
    }

    return {
      status: newRecordingStatus,
      recordingAllowed: true,
      consents: {
        consumer: consumerConsented,
        provider: providerConsented,
      },
    };
  }

  /**
   * Starts cloud recording on Daily.co room IF AND ONLY IF both parties have granted explicit consent
   * and the session is not psychotherapy.
   */
  async startRecording(userId: string, bookingId: string): Promise<{ recordingId: string }> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          include: { category: true },
        },
        session: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    if (booking.consumerId !== userId && booking.providerId !== userId) {
      throw new ForbiddenException('Access denied: You are not a participant of this booking');
    }

    // 1. Strict Psychotherapy Prohibition
    const isPsychotherapy = this.isPsychotherapySession(
      booking.service.category.name,
      booking.service.category.slug,
    );
    if (isPsychotherapy) {
      throw new ForbiddenException(
        'Recording is strictly prohibited for psychotherapy and mental health sessions by regulation and platform policy',
      );
    }

    // 2. Both Parties Explicit Consent Check
    const session = booking.session;
    const consents = (session?.recordingConsents as Record<string, unknown>) || {};
    const consumerConsented = !!consents[booking.consumerId];
    const providerConsented = !!consents[booking.providerId];

    if (!consumerConsented || !providerConsented) {
      throw new BadRequestException(
        'Recording requires explicit consent from both the consumer and the practitioner before it can begin',
      );
    }

    if (!session?.videoRoomName) {
      throw new BadRequestException('Session video room has not been initialized');
    }

    const res = await this.dailyProvider.startRecording(session.videoRoomName);

    await prisma.session.update({
      where: { id: session.id },
      data: { recordingStatus: 'RECORDING' },
    });

    await this.auditService.record({
      userId,
      action: 'SESSION_RECORDING_STARTED',
      entityType: 'Session',
      entityId: session.id,
      metadata: {
        recordingId: res.recordingId,
        consentedBy: [booking.consumerId, booking.providerId],
      },
    });

    return { recordingId: res.recordingId };
  }

  /**
   * Automatic and manual session extension.
   * Extends Daily room expiration and booking end time if no conflict exists.
   */
  async extendSession(
    userId: string,
    bookingId: string,
    minutes: number,
  ): Promise<{ extendedMinutes: number; newEndAt: string }> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { session: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    // Provider or Admin can trigger an extension
    if (booking.providerId !== userId) {
      throw new ForbiddenException('Only the practitioner can request a session time extension');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(`Cannot extend session in status ${booking.status}`);
    }

    const currentExt = booking.session?.extendedMinutes || 0;
    if (currentExt + minutes > 30) {
      throw new BadRequestException('Session cannot be extended by more than 30 minutes in total');
    }

    // Check collision: Does the provider have an appointment in the extended window?
    const currentEnd = new Date(booking.endAt).getTime();
    const newEndMs = currentEnd + (currentExt + minutes) * 60 * 1000;
    const newEnd = new Date(newEndMs);

    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        providerId: booking.providerId,
        id: { not: booking.id },
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT] },
        startAt: { lt: newEnd },
        endAt: { gt: new Date(booking.endAt) },
      },
    });

    if (conflictingBooking) {
      throw new ConflictException('Cannot extend session: Overlaps with an upcoming appointment');
    }

    // Extend Daily.co room expiration
    if (booking.session?.videoRoomName) {
      const newExpEpochSec = Math.floor(newEndMs / 1000) + 30 * 60; // +30 min buffer
      await this.dailyProvider.extendRoom(booking.session.videoRoomName, newExpEpochSec);
    }

    const totalExt = currentExt + minutes;
    await prisma.session.update({
      where: { bookingId: booking.id },
      data: { extendedMinutes: totalExt },
    });

    await this.auditService.record({
      userId,
      action: 'SESSION_EXTENDED',
      entityType: 'Session',
      entityId: booking.id,
      metadata: {
        addedMinutes: minutes,
        totalExtendedMinutes: totalExt,
        newEndAt: newEnd.toISOString(),
      },
    });

    return {
      extendedMinutes: totalExt,
      newEndAt: newEnd.toISOString(),
    };
  }
}
