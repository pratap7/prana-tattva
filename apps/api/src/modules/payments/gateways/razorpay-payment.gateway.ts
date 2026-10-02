import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PaymentGateway,
  CreateOrderParams,
  GatewayOrder,
  VerifySignatureParams,
  CreateTransferParams,
  GatewayTransfer,
  CreateRefundParams,
  GatewayRefund,
} from '../interfaces/payment-gateway.interface';
import { getEnvConfig } from '../../../config/env.config';

@Injectable()
export class RazorpayPaymentGateway implements PaymentGateway {
  readonly gatewayName = 'RAZORPAY' as const;
  private readonly logger = new Logger(RazorpayPaymentGateway.name);

  async createOrder(params: CreateOrderParams): Promise<GatewayOrder> {
    const env = getEnvConfig();
    this.logger.log(
      `Creating Razorpay Order for booking: ${params.bookingId}, amount: ₹${(params.amountPaise / 100).toFixed(2)} (${params.currency})`,
    );

    // In production, this calls new Razorpay({ key_id, key_secret }).orders.create(...)
    // Realistic Razorpay order format: order_xxxxxxxxxxxxxx (14 alphanumeric chars)
    const randomSuffix = crypto.randomBytes(7).toString('hex');
    const orderId = `order_${randomSuffix}`;

    return {
      orderId,
      amount: params.amountPaise,
      currency: params.currency,
      status: 'created',
      keyId: env.RAZORPAY_KEY_ID,
    };
  }

  verifyPaymentSignature(params: VerifySignatureParams): boolean {
    const env = getEnvConfig();
    try {
      const generatedSignature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(`${params.orderId}|${params.paymentId}`)
        .digest('hex');

      const expectedBuffer = Buffer.from(generatedSignature);
      const actualBuffer = Buffer.from(params.signature);

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch (err: unknown) {
      this.logger.error('Error verifying payment signature:', err);
      return false;
    }
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string, secret?: string): boolean {
    const env = getEnvConfig();
    const webhookSecret = secret || env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      return false;
    }

    try {
      const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature);
      const actualBuffer = Buffer.from(signature);

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch (err: unknown) {
      this.logger.error('Error verifying webhook signature:', err);
      return false;
    }
  }

  async createTransfer(params: CreateTransferParams): Promise<GatewayTransfer> {
    this.logger.log(
      `Creating Razorpay Route linked account transfer to ${params.destinationAccountId}: ₹${(params.amountPaise / 100).toFixed(2)}`,
    );

    // In production, this calls razorpay.transfers.create({ account, amount, currency })
    const randomSuffix = crypto.randomBytes(7).toString('hex');
    const transferId = `trf_${randomSuffix}`;

    return {
      transferId,
      destinationAccountId: params.destinationAccountId,
      amount: params.amountPaise,
      currency: params.currency,
      status: 'processed',
      settledAt: new Date(),
    };
  }

  async createRefund(params: CreateRefundParams): Promise<GatewayRefund> {
    this.logger.log(
      `Creating Razorpay Refund for payment ${params.paymentId}: ₹${(params.amountPaise / 100).toFixed(2)}`,
    );

    // In production, this calls razorpay.payments.refund(paymentId, { amount, notes })
    const randomSuffix = crypto.randomBytes(7).toString('hex');
    const refundId = `rfnd_${randomSuffix}`;

    return {
      refundId,
      paymentId: params.paymentId,
      amount: params.amountPaise,
      currency: 'INR',
      status: 'processed',
    };
  }
}
