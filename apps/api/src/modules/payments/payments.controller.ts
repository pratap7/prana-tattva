import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { Response, Request } from 'express';
import {
  createPaymentOrderSchema,
  CreatePaymentOrderDto,
  verifyPaymentSignatureSchema,
  VerifyPaymentSignatureDto,
  adminRefundSchema,
  AdminRefundDto,
  reconcileLedgerSchema,
  ReconcileLedgerDto,
  PaymentOrderResponse,
  ProviderEarningsResponse,
  LedgerReconciliationResult,
} from '@project-nirvana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './services/payments.service';
import { LedgerService } from './services/ledger.service';
import { EscrowService } from './services/escrow.service';

interface UserJwtPayload {
  id?: string;
  userId?: string;
  email: string;
  role: string;
}

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ledgerService: LedgerService,
    private readonly escrowService: EscrowService,
  ) {}

  @Post('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CONSUMER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create payment order from server-side price snapshot',
    description:
      'Creates a Razorpay Order using the immutable booking price snapshot. Never accepts amount from client.',
  })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  async createOrder(
    @CurrentUser() user: UserJwtPayload,
    @Body(new ZodValidationPipe(createPaymentOrderSchema)) dto: CreatePaymentOrderDto,
  ): Promise<PaymentOrderResponse> {
    const userId = user.id || user.userId || '';
    return this.paymentsService.createPaymentOrder(userId, dto.bookingId);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CONSUMER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify Razorpay checkout signature server-side',
    description:
      'Verifies HMAC-SHA256 signature, transitions payment to CAPTURED, confirms booking, and writes ledger entries.',
  })
  @ApiResponse({ status: 200, description: 'Signature verified and payment captured' })
  @HttpCode(HttpStatus.OK)
  async verifySignature(
    @CurrentUser() user: UserJwtPayload,
    @Body(new ZodValidationPipe(verifyPaymentSignatureSchema)) dto: VerifyPaymentSignatureDto,
  ): Promise<{ success: boolean; bookingId: string }> {
    const userId = user.id || user.userId || '';
    return this.paymentsService.verifyPaymentSignature(userId, dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Isolated payment gateway webhook with raw-body signature verification',
    description:
      'Handles payment.captured, payment.failed, refund.processed, transfer.settled with idempotency checking.',
  })
  @ApiHeader({ name: 'x-razorpay-signature', required: true })
  async handleWebhook(
    @Req() req: RequestWithRawBody,
    @Headers('x-razorpay-signature') signature: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Body() payload: any,
  ): Promise<{ status: string; alreadyProcessed?: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing x-razorpay-signature header');
    }

    // Extract raw body for HMAC-SHA256 verification
    const rawBody = req.rawBody || JSON.stringify(payload);
    const result = await this.paymentsService.handleWebhook(rawBody, signature, payload);
    return { status: 'ok', alreadyProcessed: result.alreadyProcessed };
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin-initiated full or partial refund',
    description:
      'Issues refund through gateway, adjusts escrow, and records double-entry ledger entries.',
  })
  @ApiResponse({ status: 200, description: 'Refund processed successfully' })
  @HttpCode(HttpStatus.OK)
  async processRefund(
    @CurrentUser() user: UserJwtPayload,
    @Param('id') paymentId: string,
    @Body(new ZodValidationPipe(adminRefundSchema)) dto: AdminRefundDto,
  ): Promise<{ refundId: string; amountRefunded: number }> {
    const userId = user.id || user.userId || '';
    return this.paymentsService.processAdminRefund(userId, {
      ...dto,
      paymentId,
    });
  }

  @Get(':id/receipt')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download compliant PDF invoice/receipt with Indian GST breakdown (SAC 998399)',
  })
  async downloadReceipt(
    @CurrentUser() user: UserJwtPayload,
    @Param('id') paymentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = user.id || user.userId || '';
    const pdfBuffer = await this.paymentsService.generateReceiptPdf(userId, user.role, paymentId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sanctuary-receipt-${paymentId.slice(0, 8)}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  @Get('provider/earnings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Practitioner earnings dashboard (pending escrow, available, paid out)',
  })
  async getProviderEarnings(
    @CurrentUser() user: UserJwtPayload,
  ): Promise<ProviderEarningsResponse> {
    const userId = user.id || user.userId || '';
    return this.escrowService.getProviderEarnings(userId);
  }

  @Post('ledger/reconcile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Execute daily financial ledger reconciliation audit',
    description: 'Verifies Total Debits === Total Credits and matches gateway settlement records.',
  })
  @ApiResponse({ status: 200, description: 'Reconciliation completed' })
  @HttpCode(HttpStatus.OK)
  async reconcileLedger(
    @Body(new ZodValidationPipe(reconcileLedgerSchema)) dto: ReconcileLedgerDto,
  ): Promise<LedgerReconciliationResult> {
    return this.ledgerService.reconcileLedger(dto.targetDate);
  }

  @Post('payouts/process')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Process due practitioner payouts whose dispute hold has matured',
  })
  @HttpCode(HttpStatus.OK)
  async processDuePayouts(): Promise<{ processedCount: number }> {
    const count = await this.escrowService.processDuePayouts();
    return { processedCount: count };
  }
}
