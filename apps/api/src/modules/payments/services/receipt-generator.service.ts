import { Injectable } from '@nestjs/common';
import { GstBreakdown } from '@project-nirvana/shared';

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  bookingId: string;
  paymentId: string;
  paymentMethod: string;
  seekerName: string;
  seekerEmail: string;
  providerName: string;
  providerCity: string;
  providerCountry: string;
  serviceTitle: string;
  serviceDurationMin: number;
  serviceMode: string;
  sessionDate: string;
  sessionTime: string;
  taxBreakdown: GstBreakdown;
  cancellationPolicy: string;
}

@Injectable()
export class ReceiptGeneratorService {
  /**
   * Generates a fully formatted, valid PDF document buffer for a consumer payment receipt.
   * Includes Sanctuary branding, seeker & provider metadata, and Indian GST breakdown (SAC 998399).
   */
  generateReceiptPdf(data: ReceiptData): Buffer {
    const totalRupees = (data.taxBreakdown.totalAmount / 100).toFixed(2);
    const baseRupees = (data.taxBreakdown.baseAmount / 100).toFixed(2);
    const cgstRupees = (data.taxBreakdown.cgst / 100).toFixed(2);
    const sgstRupees = (data.taxBreakdown.sgst / 100).toFixed(2);

    // Build human-readable structured PDF stream text
    const lines = [
      'PROJECT NIRVANA - SANCTUARY PAYMENT RECEIPT',
      '================================================================================',
      `Receipt No:       ${data.receiptNumber}`,
      `Date Issued:      ${data.date}`,
      `Payment ID:       ${data.paymentId}`,
      `Booking Ref:      ${data.bookingId}`,
      `Payment Method:   Razorpay Route (${data.paymentMethod})`,
      '--------------------------------------------------------------------------------',
      'SEEKER INFORMATION:',
      `Name:             ${data.seekerName}`,
      `Email:            ${data.seekerEmail}`,
      '--------------------------------------------------------------------------------',
      'PRACTITIONER INFORMATION:',
      `Practitioner:     ${data.providerName}`,
      `Sanctuary City:   ${data.providerCity}, ${data.providerCountry}`,
      '--------------------------------------------------------------------------------',
      'SESSION DETAILS:',
      `Service:          ${data.serviceTitle} (${data.serviceDurationMin} mins)`,
      `Modality Mode:    ${data.serviceMode}`,
      `Appointment Time: ${data.sessionDate} at ${data.sessionTime}`,
      `Cancellation:     ${data.cancellationPolicy} Policy`,
      '================================================================================',
      'TAX & CHARGES BREAKDOWN (GST SAC 998399):',
      `Base Professional Fee:              INR ${baseRupees.padStart(10, ' ')}`,
      `CGST (Central Tax @ 9.0%):          INR ${cgstRupees.padStart(10, ' ')}`,
      `SGST (State Tax @ 9.0%):            INR ${sgstRupees.padStart(10, ' ')}`,
      '--------------------------------------------------------------------------------',
      `TOTAL AMOUNT PAID (INCL. GST):       INR ${totalRupees.padStart(10, ' ')}`,
      '================================================================================',
      '',
      'ESCROW & SANCTUARY GUARANTEE:',
      'Your payment is safely held in trust via Razorpay Route escrow and will be released',
      'to the practitioner only after the session has been successfully completed.',
      'In the event of practitioner cancellation or no-show, a 100% full refund is guaranteed.',
      '',
      'DISCLAIMER:',
      'Project Nirvana facilitates complementary wellness and traditional spiritual support.',
      'Sessions do not substitute licensed medical or clinical psychological therapy.',
      '================================================================================',
      'Thank you for walking the sacred path of wellness with Project Nirvana.',
    ];

    return this.buildStandardPdf(lines);
  }

  /**
   * Constructs a compliant binary PDF-1.4 file buffer containing the formatted text lines.
   */
  private buildStandardPdf(textLines: string[]): Buffer {
    let textStream = 'BT\n/F1 10 Tf\n40 760 Td\n15 TL\n';
    for (const line of textLines) {
      // Escape PDF characters: \, (, )
      const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      textStream += `(${escaped}) Tj T*\n`;
    }
    textStream += 'ET';

    const textStreamBytes = Buffer.from(textStream, 'utf-8');

    const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
    const obj3 =
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n';
    const obj4 = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n';
    const obj5 = `5 0 obj\n<< /Length ${textStreamBytes.length} >>\nstream\n${textStream}\nendstream\nendobj\n`;

    const header = '%PDF-1.4\n';
    const headerBytes = Buffer.from(header, 'utf-8');

    const offset1 = headerBytes.length;
    const offset2 = offset1 + Buffer.byteLength(obj1, 'utf-8');
    const offset3 = offset2 + Buffer.byteLength(obj2, 'utf-8');
    const offset4 = offset3 + Buffer.byteLength(obj3, 'utf-8');
    const offset5 = offset4 + Buffer.byteLength(obj4, 'utf-8');
    const xrefOffset = offset5 + Buffer.byteLength(obj5, 'utf-8');

    const padOffset = (n: number) => String(n).padStart(10, '0');

    const xref =
      `xref\n` +
      `0 6\n` +
      `0000000000 65535 f \n` +
      `${padOffset(offset1)} 00000 n \n` +
      `${padOffset(offset2)} 00000 n \n` +
      `${padOffset(offset3)} 00000 n \n` +
      `${padOffset(offset4)} 00000 n \n` +
      `${padOffset(offset5)} 00000 n \n`;

    const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    const pdfContent = header + obj1 + obj2 + obj3 + obj4 + obj5 + xref + trailer;
    return Buffer.from(pdfContent, 'utf-8');
  }
}
