import { Injectable, Logger } from '@nestjs/common';

export interface EmailSender {
  sendEmail(to: string, subject: string, html: string): Promise<boolean>;
}

@Injectable()
export class EmailGateway implements EmailSender {
  private readonly logger = new Logger(EmailGateway.name);

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    // In production, integration with SES / SendGrid / Resend via SMTP or REST
    // In dev / test, safely mock and log metadata
    this.logger.log(
      `[EmailGateway] Sending email to ${to} | Subject: "${subject}" (payload: ${html.length} chars)`,
    );
    return true;
  }
}
