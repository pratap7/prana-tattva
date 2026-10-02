export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CreateOrderParams {
  bookingId: string;
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface GatewayOrder {
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  keyId?: string;
}

export interface VerifySignatureParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface CreateTransferParams {
  paymentId: string;
  destinationAccountId: string;
  amountPaise: number;
  currency: string;
  notes?: Record<string, string>;
}

export interface GatewayTransfer {
  transferId: string;
  destinationAccountId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processed' | 'failed';
  settledAt?: Date;
}

export interface CreateRefundParams {
  paymentId: string;
  amountPaise: number;
  reason?: string;
  notes?: Record<string, string>;
}

export interface GatewayRefund {
  refundId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processed' | 'failed';
}

export interface PaymentGateway {
  readonly gatewayName: 'RAZORPAY' | 'STRIPE';

  createOrder(params: CreateOrderParams): Promise<GatewayOrder>;
  verifyPaymentSignature(params: VerifySignatureParams): boolean;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string, secret?: string): boolean;
  createTransfer(params: CreateTransferParams): Promise<GatewayTransfer>;
  createRefund(params: CreateRefundParams): Promise<GatewayRefund>;
}
