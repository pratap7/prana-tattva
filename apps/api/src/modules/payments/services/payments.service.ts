import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { prisma, PaymentStatus, BookingStatus, PayoutStatus } from '@project-nirvana/db';
import {
  computeGstBreakdown,
  PaymentOrderResponse,
  VerifyPaymentSignatureDto,
  AdminRefundDto,
} from '@project-nirvana/shared';
import { PAYMENT_GATEWAY, PaymentGateway } from '../interfaces/payment-gateway.interface';
import { LedgerService } from './ledger.service';
import { ReceiptGeneratorService } from './receipt-generator.service';
import { AuditService } from '../../audit/audit.service';
import { BookingsService } from '../../bookings/services/bookings.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly ledgerService: LedgerService,
    private readonly receiptService: ReceiptGeneratorService,
    private readonly auditService: AuditService,
    private readonly bookingsService: BookingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Creates a payment order using the immutable server-side price snapshot.
   * NEVER accepts an amount from the client.
   */
  async createPaymentOrder(userId: string, bookingId: string): Promise<PaymentOrderResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    if (booking.consumerId !== userId) {
      throw new UnauthorizedException('You can only pay for your own bookings');
    }

    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `Cannot create payment order: Booking is already in state ${booking.status}`,
      );
    }

    const priceSnapshotPaise = booking.priceSnapshot;
    const taxBreakdown = computeGstBreakdown(priceSnapshotPaise);

    // Call payment gateway to create order
    const gatewayOrder = await this.gateway.createOrder({
      bookingId: booking.id,
      amountPaise: priceSnapshotPaise,
      currency: booking.currency,
      receipt: booking.id.substring(0, 40),
      notes: {
        bookingId: booking.id,
        serviceTitle: booking.service.title,
      },
    });

    // Upsert payment record in database
    await prisma.payment.upsert({
      where: { gatewayOrderId: gatewayOrder.orderId },
      create: {
        bookingId: booking.id,
        amount: priceSnapshotPaise,
        currency: booking.currency,
        gateway: 'RAZORPAY',
        gatewayOrderId: gatewayOrder.orderId,
        status: PaymentStatus.PENDING,
        taxBreakdown: JSON.parse(JSON.stringify(taxBreakdown)),
      },
      update: {
        amount: priceSnapshotPaise,
        taxBreakdown: JSON.parse(JSON.stringify(taxBreakdown)),
      },
    });

    return {
      orderId: gatewayOrder.orderId,
      amount: priceSnapshotPaise,
      currency: booking.currency,
      keyId: gatewayOrder.keyId || '',
      bookingId: booking.id,
      taxBreakdown,
    };
  }

  /**
   * Verifies client-side checkout signature server-side.
   * If valid, updates payment to CAPTURED, confirms booking, and writes ledger entries.
   */
  async verifyPaymentSignature(
    userId: string,
    dto: VerifyPaymentSignatureDto,
  ): Promise<{ success: boolean; bookingId: string }> {
    const booking = await prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { payments: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${dto.bookingId} not found`);
    }

    if (booking.consumerId !== userId) {
      throw new UnauthorizedException('Unauthorized payment verification');
    }

    // Server-side HMAC-SHA256 signature verification
    const isValid = this.gateway.verifyPaymentSignature({
      orderId: dto.razorpayOrderId,
      paymentId: dto.razorpayPaymentId,
      signature: dto.razorpaySignature,
    });

    if (!isValid) {
      this.logger.warn(
        `🚨 Invalid payment signature attempt for booking ${dto.bookingId}, order ${dto.razorpayOrderId}`,
      );
      throw new BadRequestException('Invalid payment signature verification failed');
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update or create payment record as CAPTURED
      const existingPayment = await tx.payment.findFirst({
        where: { gatewayOrderId: dto.razorpayOrderId },
      });

      if (existingPayment) {
        await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.CAPTURED,
            gatewayPaymentId: dto.razorpayPaymentId,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            gatewayOrderId: dto.razorpayOrderId,
            gatewayPaymentId: dto.razorpayPaymentId,
            amount: booking.priceSnapshot,
            currency: booking.currency,
            status: PaymentStatus.CAPTURED,
            taxBreakdown: JSON.parse(JSON.stringify(computeGstBreakdown(booking.priceSnapshot))),
          },
        });
      }

      // 2. Double-entry ledger: Debit CONSUMER_PAYMENT, Credit PLATFORM_ESCROW
      await this.ledgerService.recordCustomerPayment(
        booking.id,
        booking.priceSnapshot,
        booking.currency,
        tx,
      );
    });

    // 3. Confirm booking through booking lifecycle
    await this.bookingsService.handlePaymentWebhook({
      event: 'payment.captured',
      bookingId: booking.id,
      paymentId: dto.razorpayPaymentId,
      orderId: dto.razorpayOrderId,
      amount: booking.priceSnapshot,
      status: 'captured',
    });

    await this.auditService.record({
      userId,
      action: 'PAYMENT_VERIFIED_AND_CAPTURED',
      entityType: 'PAYMENT',
      entityId: dto.razorpayPaymentId,
      metadata: { bookingId: dto.bookingId, orderId: dto.razorpayOrderId },
    });

    return { success: true, bookingId: dto.bookingId };
  }

  /**
   * Isolated webhook handler with raw-body signature verification and event idempotency.
   */
  async handleWebhook(
    rawBody: Buffer | string,
    signature: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventPayload: any,
  ): Promise<{ success: boolean; alreadyProcessed?: boolean }> {
    // 1. Raw-body signature verification
    const isValid = this.gateway.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn('🚨 Unauthorized webhook request: Invalid signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    const eventName = eventPayload.event;
    // Construct unique event idempotency key
    const eventId =
      eventPayload.id ||
      `${eventName}_${eventPayload.payload?.payment?.entity?.id || eventPayload.payload?.refund?.entity?.id || Date.now()}`;

    // 2. Idempotency Check: prevent duplicate event processing
    const existingEvent = await prisma.processedWebhookEvent.findUnique({
      where: { eventId },
    });

    if (existingEvent) {
      this.logger.log(`Webhook event ${eventId} (${eventName}) already processed. Skipping.`);
      return { success: true, alreadyProcessed: true };
    }

    this.logger.log(`Processing incoming webhook event: ${eventName} (ID: ${eventId})`);

    // 3. Process specific domain events within DB transaction
    await prisma.$transaction(async (tx) => {
      if (eventName === 'payment.captured') {
        const paymentEntity = eventPayload.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;
        const amount = paymentEntity?.amount;

        const booking = await tx.booking.findFirst({
          where: {
            OR: [
              { payments: { some: { gatewayOrderId: orderId } } },
              { id: paymentEntity?.notes?.bookingId },
            ],
          },
        });

        if (booking) {
          await tx.payment.upsert({
            where: { gatewayPaymentId: paymentId },
            create: {
              bookingId: booking.id,
              gatewayOrderId: orderId,
              gatewayPaymentId: paymentId,
              amount: amount || booking.priceSnapshot,
              currency: booking.currency,
              status: PaymentStatus.CAPTURED,
              taxBreakdown: JSON.parse(
                JSON.stringify(computeGstBreakdown(amount || booking.priceSnapshot)),
              ),
            },
            update: {
              status: PaymentStatus.CAPTURED,
            },
          });

          await this.ledgerService.recordCustomerPayment(
            booking.id,
            amount || booking.priceSnapshot,
            booking.currency,
            tx,
          );

          if (booking.status === BookingStatus.PENDING_PAYMENT) {
            await this.bookingsService.handlePaymentWebhook({
              event: 'payment.captured',
              bookingId: booking.id,
              paymentId,
              orderId,
              amount: amount || booking.priceSnapshot,
              status: 'captured',
            });
          }
        }
      } else if (eventName === 'payment.failed') {
        const paymentEntity = eventPayload.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;

        if (orderId) {
          await tx.payment.updateMany({
            where: { gatewayOrderId: orderId },
            data: { status: PaymentStatus.FAILED },
          });

          const booking = await tx.booking.findFirst({
            where: { payments: { some: { gatewayOrderId: orderId } } },
          });
          if (booking && booking.status === BookingStatus.PENDING_PAYMENT) {
            await this.bookingsService.handlePaymentWebhook({
              event: 'payment.failed',
              bookingId: booking.id,
              paymentId: paymentEntity?.id || 'pay_failed',
              orderId,
              amount: booking.priceSnapshot,
              status: 'failed',
            });
          }
        }
      } else if (eventName === 'refund.processed') {
        const refundEntity = eventPayload.payload?.refund?.entity;
        const paymentId = refundEntity?.payment_id;
        const refundAmount = refundEntity?.amount;

        if (paymentId && refundAmount) {
          const payment = await tx.payment.findUnique({
            where: { gatewayPaymentId: paymentId },
          });

          if (payment) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                refundedAmount: { increment: refundAmount },
                status:
                  payment.amount <= (payment.refundedAmount || 0) + refundAmount
                    ? PaymentStatus.REFUNDED
                    : PaymentStatus.CAPTURED,
              },
            });

            await this.ledgerService.recordRefund(
              payment.bookingId,
              refundAmount,
              payment.currency,
              tx,
            );
          }
        }
      } else if (eventName === 'transfer.settled') {
        const transferEntity = eventPayload.payload?.transfer?.entity;
        const transferId = transferEntity?.id;

        if (transferId) {
          await tx.payout.updateMany({
            where: { gatewayTransferId: transferId },
            data: {
              status: PayoutStatus.PAID,
              processedAt: new Date(),
            },
          });
        }
      }

      // Record in ProcessedWebhookEvent table
      await tx.processedWebhookEvent.create({
        data: {
          eventId,
          eventType: eventName,
          gateway: 'RAZORPAY',
          payload: eventPayload,
        },
      });
    });

    return { success: true, alreadyProcessed: false };
  }

  /**
   * Admin-initiated refund (Full or Partial).
   */
  async processAdminRefund(
    adminUserId: string,
    dto: AdminRefundDto,
  ): Promise<{ refundId: string; amountRefunded: number }> {
    const payment = await prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: { booking: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${dto.paymentId} not found`);
    }

    if (payment.status !== PaymentStatus.CAPTURED) {
      throw new BadRequestException(`Cannot refund payment in status ${payment.status}`);
    }

    const availableToRefund = payment.amount - payment.refundedAmount;
    const amountToRefund = dto.amountPaise || availableToRefund;

    if (amountToRefund <= 0 || amountToRefund > availableToRefund) {
      throw new BadRequestException(
        `Refund amount ₹${(amountToRefund / 100).toFixed(2)} exceeds refundable balance ₹${(availableToRefund / 100).toFixed(2)}`,
      );
    }

    // Call payment gateway refund
    const refund = await this.gateway.createRefund({
      paymentId: payment.gatewayPaymentId || payment.id,
      amountPaise: amountToRefund,
      reason: dto.reason,
    });

    await prisma.$transaction(async (tx) => {
      // 1. Update payment record
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: { increment: amountToRefund },
          status:
            payment.refundedAmount + amountToRefund >= payment.amount
              ? PaymentStatus.REFUNDED
              : PaymentStatus.CAPTURED,
        },
      });

      // 2. Double-entry ledger: Debit PLATFORM_ESCROW, Credit REFUND_ESCROW
      await this.ledgerService.recordRefund(
        payment.bookingId,
        amountToRefund,
        payment.currency,
        tx,
      );
    });

    await this.auditService.record({
      userId: adminUserId,
      action: 'ADMIN_REFUND_PROCESSED',
      entityType: 'PAYMENT',
      entityId: payment.id,
      metadata: {
        refundId: refund.refundId,
        amountRefunded: amountToRefund,
        reason: dto.reason,
      },
    });

    return { refundId: refund.refundId, amountRefunded: amountToRefund };
  }

  /**
   * Generates a compliant PDF receipt document for consumer payment.
   */
  async generateReceiptPdf(userId: string, userRole: string, paymentId: string): Promise<Buffer> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: {
          include: {
            service: true,
            consumer: true,
            provider: {
              include: {
                providerProfile: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    if (userRole !== 'ADMIN' && payment.booking.consumerId !== userId) {
      throw new UnauthorizedException('You can only access receipts for your own bookings');
    }

    const b = payment.booking;
    const taxBreakdown =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payment.taxBreakdown as any) || computeGstBreakdown(payment.amount);

    return this.receiptService.generateReceiptPdf({
      receiptNumber: `REC-${payment.id.substring(0, 8).toUpperCase()}`,
      date: payment.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      bookingId: b.id,
      paymentId: payment.gatewayPaymentId || payment.id,
      paymentMethod: 'UPI / Cards / NetBanking',
      seekerName: b.consumer.email.split('@')[0],
      seekerEmail: b.consumer.email,
      providerName: b.provider.providerProfile?.displayName || 'Sanctuary Practitioner',
      providerCity: b.provider.providerProfile?.city || 'Rishikesh',
      providerCountry: b.provider.providerProfile?.country || 'India',
      serviceTitle: b.service.title,
      serviceDurationMin: b.service.durationMin,
      serviceMode: b.service.mode,
      sessionDate: b.startAt.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      sessionTime: b.startAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
      taxBreakdown,
      cancellationPolicy: b.service.cancellationPolicy,
    });
  }
}
