import { Injectable } from '@nestjs/common';
import { AntiLeakageResult } from '@project-nirvana/shared';

@Injectable()
export class AntiLeakageService {
  // 1. Phone number patterns (handles Indian +91, international, spaced-out, and hyphenated digits)
  private readonly PHONE_PATTERNS: RegExp[] = [
    // Standard international / US / Indian format: +91 9876543210, +1 (555) 123-4567, 98765-43210
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/i,
    // Explicit Indian 10-digit mobile starting with 6-9
    /(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}/i,
    // Spaced-out / disguised digits: "9 8 7 6 5 4 3 2 1 0" or "98 76 54 32 10"
    /\b(?:\d[\s.-]?){10,12}\b/i,
  ];

  // 2. Email address patterns (including obfuscated formats like "john [at] gmail [dot] com")
  private readonly EMAIL_PATTERNS: RegExp[] = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
    /[a-zA-Z0-9._%+-]+\s*(?:\[at\]|@|\(at\)|at)\s*[a-zA-Z0-9.-]+\s*(?:\[dot\]|\.|\(dot\)|dot)\s*[a-zA-Z]{2,}/i,
  ];

  // 3. Off-platform keywords: WhatsApp, direct UPI, cash, off-platform payments
  private readonly OFF_PLATFORM_KEYWORD_PATTERNS: RegExp[] = [
    // WhatsApp
    /\b(?:whatsapp|whats\s*app|watsapp|wa\.me|ping\s+me\s+on\s+wa|msg\s+on\s+wa|dm\s+on\s+wa)\b/i,
    // Off-platform payment, bank transfers, bypassing platform
    /\b(?:pay\s+(?:outside|directly|offline|cash)|direct\s+pay(?:ment)?|gpay\s+(?:me|direct)|phonepe\s+(?:me|direct)|paytm\s+(?:me|direct)|send\s+(?:to\s+my\s+)?(?:upi|gpay|bank)|bank\s+transfer|wire\s+transfer|bypass\s+(?:the\s+)?platform|save\s+(?:the\s+)?commission|skip\s+(?:the\s+)?fee|cash\s+in\s+hand)\b/i,
    // UPI ID patterns (e.g. user@okhdfcbank, 9876543210@ybl, healer@paytm)
    /\b[a-zA-Z0-9.\-_]{2,64}@(okhdfcbank|okaxis|oksbi|okicici|paytm|ybl|ibl|axl|upi)\b/i,
  ];

  /**
   * Scans a message text for potential contact/payment leakage.
   * Does NOT block the message, but flags it and generates a friendly advisory warning.
   */
  inspectMessage(content: string): AntiLeakageResult {
    const leakageFlags: ('PHONE' | 'EMAIL' | 'OFF_PLATFORM_KEYWORD')[] = [];

    // Check Phone
    for (const pattern of this.PHONE_PATTERNS) {
      if (pattern.test(content)) {
        leakageFlags.push('PHONE');
        break;
      }
    }

    // Check Email
    for (const pattern of this.EMAIL_PATTERNS) {
      if (pattern.test(content)) {
        leakageFlags.push('EMAIL');
        break;
      }
    }

    // Check Off-Platform Contact & Payment Keywords
    for (const pattern of this.OFF_PLATFORM_KEYWORD_PATTERNS) {
      if (pattern.test(content)) {
        leakageFlags.push('OFF_PLATFORM_KEYWORD');
        break;
      }
    }

    const hasLeakage = leakageFlags.length > 0;

    let warningMessage: string | null = null;
    if (hasLeakage) {
      warningMessage =
        'Sanctuary Safety Notice: For your security, escrow dispute protection, and practitioner reliability guarantee, please keep all communications and payments inside Project Nirvana. Transactions conducted outside the platform are not protected.';
    }

    return {
      hasLeakage,
      leakageFlags,
      warningMessage,
    };
  }
}
