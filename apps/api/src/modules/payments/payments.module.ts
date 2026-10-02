import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './services/payments.service';
import { LedgerService } from './services/ledger.service';
import { EscrowService } from './services/escrow.service';
import { ReceiptGeneratorService } from './services/receipt-generator.service';
import { PAYMENT_GATEWAY } from './interfaces/payment-gateway.interface';
import { RazorpayPaymentGateway } from './gateways/razorpay-payment.gateway';
import { AuditModule } from '../audit/audit.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [AuditModule, forwardRef(() => BookingsModule)],
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useClass: RazorpayPaymentGateway,
    },
    RazorpayPaymentGateway,
    PaymentsService,
    LedgerService,
    EscrowService,
    ReceiptGeneratorService,
  ],
  exports: [
    PAYMENT_GATEWAY,
    PaymentsService,
    LedgerService,
    EscrowService,
    ReceiptGeneratorService,
  ],
})
export class PaymentsModule {}
