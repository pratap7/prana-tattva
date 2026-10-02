import { Injectable } from '@nestjs/common';
import { NotificationType } from '@project-nirvana/shared';

export interface RenderedNotification {
  title: string;
  body: string;
  emailSubject: string;
  emailHtml: string;
  smsText?: string;
  actionUrl?: string;
}

@Injectable()
export class NotificationTemplatesService {
  /**
   * Generates localized titles, bodies, and responsive HTML emails (React Email style)
   * for all Sanctuary event-driven notifications.
   */
  render(
    type: NotificationType | string,
    data: Record<string, unknown>,
    locale = 'en-US',
  ): RenderedNotification {
    const isHindi = locale.startsWith('hi');

    switch (type) {
      case 'BOOKING_CONFIRMED': {
        const serviceTitle = String(data.serviceTitle || 'Wellness Session');
        const providerName = String(data.providerName || 'Practitioner');
        const sessionTime = String(data.sessionTime || 'Scheduled Time');
        const bookingId = String(data.bookingId || '');

        const title = isHindi
          ? `सत्र पक्का हुआ: ${serviceTitle}`
          : `Session Confirmed: ${serviceTitle}`;
        const body = isHindi
          ? `${providerName} के साथ आपका सत्र ${sessionTime} पर निश्चित है।`
          : `Your sacred appointment with ${providerName} is secured for ${sessionTime}.`;

        const actionUrl = `https://pranatattva.com/sessions/${bookingId}`;
        const emailHtml = this.generateEmailWrapper({
          previewText: `Your appointment with ${providerName} is confirmed`,
          heading: 'Your Sanctuary Session is Secured',
          paragraphs: [
            `Greetings,`,
            `Your booking for <strong>${serviceTitle}</strong> with <strong>${providerName}</strong> has been successfully confirmed.`,
            `<strong>Scheduled Date & Time:</strong> ${sessionTime}`,
            `Payment is protected in Razorpay Route escrow and will only be released after your session completes.`,
          ],
          buttonText: 'Enter Video Sanctuary / View Details',
          buttonUrl: actionUrl,
        });

        return {
          title,
          body,
          emailSubject: `Confirmed: ${serviceTitle} with ${providerName}`,
          emailHtml,
          smsText: `Sanctuary: Your session (${serviceTitle}) with ${providerName} is confirmed for ${sessionTime}. Link: ${actionUrl}`,
          actionUrl,
        };
      }

      case 'BOOKING_RESCHEDULED': {
        const serviceTitle = String(data.serviceTitle || 'Wellness Session');
        const providerName = String(data.providerName || 'Practitioner');
        const newTime = String(data.newTime || 'New Time');
        const bookingId = String(data.bookingId || '');

        const title = isHindi
          ? `सत्र का समय बदला गया: ${serviceTitle}`
          : `Session Rescheduled: ${serviceTitle}`;
        const body = isHindi
          ? `आपका सत्र अब ${newTime} पर पुनर्निर्धारित किया गया है।`
          : `Your session with ${providerName} has been rescheduled to ${newTime}.`;

        const actionUrl = `https://pranatattva.com/sessions/${bookingId}`;
        const emailHtml = this.generateEmailWrapper({
          previewText: `Your session has been rescheduled to ${newTime}`,
          heading: 'Appointment Rescheduled',
          paragraphs: [
            `Your appointment for <strong>${serviceTitle}</strong> with <strong>${providerName}</strong> has been rescheduled.`,
            `<strong>New Appointment Time:</strong> ${newTime}`,
            `Your payment in escrow remains safely preserved.`,
          ],
          buttonText: 'View Updated Session Details',
          buttonUrl: actionUrl,
        });

        return {
          title,
          body,
          emailSubject: `Rescheduled: ${serviceTitle} - ${newTime}`,
          emailHtml,
          smsText: `Sanctuary: Your session with ${providerName} is now rescheduled to ${newTime}. Link: ${actionUrl}`,
          actionUrl,
        };
      }

      case 'BOOKING_CANCELLED': {
        const serviceTitle = String(data.serviceTitle || 'Wellness Session');
        const refundAmount = data.refundAmount
          ? `₹${(Number(data.refundAmount) / 100).toLocaleString('en-IN')}`
          : 'Full refund';
        const reason = String(data.reason || 'Requested by participant');

        const title = isHindi
          ? `सत्र रद्द हुआ: ${serviceTitle}`
          : `Session Cancelled: ${serviceTitle}`;
        const body = isHindi
          ? `सत्र रद्द कर दिया गया है। वापसी राशि: ${refundAmount}।`
          : `Your appointment for ${serviceTitle} has been cancelled. Refund initiated: ${refundAmount}.`;

        const actionUrl = 'https://pranatattva.com/bookings';
        const emailHtml = this.generateEmailWrapper({
          previewText: `Booking cancelled: Refund of ${refundAmount} initiated`,
          heading: 'Session Cancellation & Escrow Refund',
          paragraphs: [
            `Your appointment for <strong>${serviceTitle}</strong> has been cancelled.`,
            `<strong>Reason:</strong> ${reason}`,
            `<strong>Refund Entitlement:</strong> ${refundAmount} has been processed back to your original payment method per policy.`,
          ],
          buttonText: 'Review My Bookings',
          buttonUrl: actionUrl,
        });

        return {
          title,
          body,
          emailSubject: `Cancelled: ${serviceTitle} (Refund Processed)`,
          emailHtml,
          smsText: `Sanctuary: Your appointment for ${serviceTitle} has been cancelled. Refund of ${refundAmount} initiated.`,
          actionUrl,
        };
      }

      case 'SESSION_REMINDER_24H': {
        const serviceTitle = String(data.serviceTitle || 'Wellness Session');
        const providerName = String(data.providerName || 'Practitioner');
        const sessionTime = String(data.sessionTime || 'Tomorrow');
        const bookingId = String(data.bookingId || '');

        const title = isHindi ? `स्मरण पत्र: 24 घंटे में सत्र` : `Reminder: Session Tomorrow`;
        const body = isHindi
          ? `${providerName} के साथ आपका सत्र 24 घंटे में शुरू होगा (${sessionTime})।`
          : `Your session with ${providerName} begins in 24 hours (${sessionTime}).`;

        const actionUrl = `https://pranatattva.com/sessions/${bookingId}`;
        const emailHtml = this.generateEmailWrapper({
          previewText: `24-Hour Reminder for your session with ${providerName}`,
          heading: 'Your Session is Tomorrow',
          paragraphs: [
            `This is a gentle reminder that your <strong>${serviceTitle}</strong> session with <strong>${providerName}</strong> is scheduled in 24 hours.`,
            `<strong>Session Time:</strong> ${sessionTime}`,
            `<strong>Pre-session preparation:</strong> Please test your camera, microphone, and internet connection using our pre-join diagnostic tools.`,
          ],
          buttonText: 'Run Device Check & Prepare',
          buttonUrl: actionUrl,
        });

        return {
          title,
          body,
          emailSubject: `24h Reminder: ${serviceTitle} with ${providerName}`,
          emailHtml,
          actionUrl,
        };
      }

      case 'SESSION_REMINDER_1H': {
        const serviceTitle = String(data.serviceTitle || 'Wellness Session');
        const providerName = String(data.providerName || 'Practitioner');
        const bookingId = String(data.bookingId || '');

        const title = isHindi ? `1 घंटे में सत्र शुरू होगा!` : `Session Starting in 1 Hour`;
        const body = isHindi
          ? `${providerName} के साथ आपका सत्र 1 घंटे में शुरू होगा।`
          : `Your session with ${providerName} begins in 60 minutes. Enter your waiting lobby now.`;

        const actionUrl = `https://pranatattva.com/sessions/${bookingId}`;
        const emailHtml = this.generateEmailWrapper({
          previewText: `Your session starts in 1 hour`,
          heading: 'Session Starting Soon',
          paragraphs: [
            `Your sacred appointment for <strong>${serviceTitle}</strong> with <strong>${providerName}</strong> begins in 1 hour.`,
            `The waiting room lobby will open 10 minutes prior to session start.`,
          ],
          buttonText: 'Enter Video Lobby',
          buttonUrl: actionUrl,
        });

        return {
          title,
          body,
          emailSubject: `Starting in 1h: ${serviceTitle}`,
          emailHtml,
          smsText: `Sanctuary: Your session with ${providerName} starts in 1 hour. Enter room: ${actionUrl}`,
          actionUrl,
        };
      }

      case 'REVIEW_REQUEST': {
        const serviceTitle = String(data.serviceTitle || 'Wellness Session');
        const providerName = String(data.providerName || 'Practitioner');
        const bookingId = String(data.bookingId || '');

        const title = isHindi ? `सत्र कैसा रहा? अनुभव साझा करें` : `How was your session?`;
        const body = isHindi
          ? `${providerName} के साथ अपने सत्र का अनुभव साझा करें।`
          : `Share your sacred feedback for ${providerName} to help our community thrive.`;

        const actionUrl = `https://pranatattva.com/bookings/${bookingId}?review=true`;
        const emailHtml = this.generateEmailWrapper({
          previewText: `How was your session with ${providerName}?`,
          heading: 'Reflect on Your Healing Journey',
          paragraphs: [
            `We hope your session for <strong>${serviceTitle}</strong> with <strong>${providerName}</strong> brought clarity, balance, and peace.`,
            `Your honest feedback guides seekers in choosing authentic practitioners.`,
          ],
          buttonText: 'Leave a Review',
          buttonUrl: actionUrl,
        });

        return {
          title,
          body,
          emailSubject: `Share your review for ${providerName}`,
          emailHtml,
          actionUrl,
        };
      }

      case 'CHAT_MESSAGE': {
        const senderName = String(data.senderName || 'Practitioner');
        const conversationId = String(data.conversationId || '');

        const title = isHindi ? `नया संदेश: ${senderName}` : `New message from ${senderName}`;
        const body = isHindi
          ? `${senderName} ने आपको एक नया संदेश भेजा है।`
          : `${senderName} sent you a message on Sanctuary.`;

        const actionUrl = `https://pranatattva.com/messages?conv=${conversationId}`;
        const emailHtml = this.generateEmailWrapper({
          previewText: `New message from ${senderName}`,
          heading: 'You Have a New Message',
          paragraphs: [
            `<strong>${senderName}</strong> sent you a message regarding your appointment.`,
            `For your protection and privacy, message contents are encrypted at rest.`,
          ],
          buttonText: 'View & Reply to Message',
          buttonUrl: actionUrl,
        });

        return {
          title,
          body,
          emailSubject: `New message from ${senderName}`,
          emailHtml,
          actionUrl,
        };
      }

      default: {
        const title = String(data.title || 'Sanctuary Notification');
        const body = String(data.body || 'You have a new update.');
        return {
          title,
          body,
          emailSubject: title,
          emailHtml: this.generateEmailWrapper({
            previewText: title,
            heading: title,
            paragraphs: [body],
          }),
        };
      }
    }
  }

  /**
   * Generates a modern, responsive Sanctuary branded HTML email (React Email style).
   */
  private generateEmailWrapper(props: {
    previewText: string;
    heading: string;
    paragraphs: string[];
    buttonText?: string;
    buttonUrl?: string;
  }): string {
    const paragraphsHtml = props.paragraphs
      .map(
        (p) =>
          `<p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">${p}</p>`,
      )
      .join('');

    const buttonHtml =
      props.buttonText && props.buttonUrl
        ? `
        <div style="margin: 28px 0; text-align: center;">
          <a href="${props.buttonUrl}" style="background-color: #0d9488; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 9999px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(13,148,136,0.2);">
            ${props.buttonText}
          </a>
        </div>
      `
        : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${props.heading}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="display: none; max-height: 0px; overflow: hidden;">
    ${props.previewText}
  </div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); border: 1px solid #e2e8f0;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #047857 100%); padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-family: Georgia, serif; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">PROJECT NIRVANA</h1>
              <p style="margin: 6px 0 0; color: #ccfbf1; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Verified Holistic Healing Sanctuary</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="margin: 0 0 20px; font-family: Georgia, serif; color: #111827; font-size: 20px; font-weight: 600;">${props.heading}</h2>
              ${paragraphsHtml}
              ${buttonHtml}
              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0 20px;" />
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                Protected by Sanctuary Escrow and Reliability Guarantee. Never share personal passwords or payment details outside our verified portal.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #f1f5f9;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">© ${new Date().getFullYear()} Project Nirvana • Prana Tattva Sanctuary</p>
              <p style="margin: 6px 0 0; color: #94a3b8; font-size: 11px;">You are receiving this notification because of your active wellness appointment.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
