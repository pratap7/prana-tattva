import { Module, Global } from '@nestjs/common';
import { RazorpayRouteService } from './razorpay-route.service';

@Global()
@Module({
  providers: [RazorpayRouteService],
  exports: [RazorpayRouteService],
})
export class PayoutModule {}
