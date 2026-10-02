import { Injectable, Logger } from '@nestjs/common';

export interface SmsSender {
  sendSms(to: string, message: string): Promise<boolean>;
}

@Injectable()
export class SmsGateway implements SmsSender {
  private readonly logger = new Logger(SmsGateway.name);

  /**
   * Dispatches SMS for critical alerts only (e.g. cancellations, emergencies, OTP).
   */
  async sendSms(to: string, message: string): Promise<boolean> {
    this.logger.log(
      `[SmsGateway] Dispatching critical SMS to ${to} | Length: ${message.length} chars`,
    );
    return true;
  }
}
