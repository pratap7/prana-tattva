import { Injectable, Logger } from '@nestjs/common';
import { prisma, ReviewModerationStatus } from '@project-nirvana/db';

export interface ScanResult {
  isFlagged: boolean;
  flagReasons: string[];
  moderationStatus: ReviewModerationStatus;
}

const PROFANITY_PATTERNS = [
  /\b(fuck|shit|asshole|bitch|bastard|scam|fraudster|motherfucker|cunt|dick|pussy)\b/i,
  /\b(chutiya|madarchod|bhenchod|harami|bhosdike|gandu|kutta)\b/i,
];

const EXTERNAL_LINK_PATTERNS = [
  /https?:\/\/[^\s]+/i,
  /www\.[^\s]+/i,
  /[a-z0-9_-]+\.(com|org|net|io|in|co|ai|me|info|biz)/i,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, // email address
  /\+?[0-9]{1,4}?[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/, // phone numbers
];

@Injectable()
export class ReviewModerationService {
  private readonly logger = new Logger(ReviewModerationService.name);

  /**
   * Scans a review or reply text for profanity, links, and suspected fake patterns
   */
  async scanReview(params: {
    comment?: string | null;
    consumerId?: string;
    providerId: string;
    clientIp?: string | null;
    deviceHash?: string | null;
  }): Promise<ScanResult> {
    const flagReasons: string[] = [];
    const text = params.comment?.trim() || '';

    // 1. Profanity Detection
    if (text) {
      for (const pattern of PROFANITY_PATTERNS) {
        if (pattern.test(text)) {
          flagReasons.push('PROFANITY');
          break;
        }
      }

      // 2. External Links / Phone / Email Detection
      for (const pattern of EXTERNAL_LINK_PATTERNS) {
        if (pattern.test(text)) {
          flagReasons.push('EXTERNAL_LINK');
          break;
        }
      }
    }

    // 3. Same IP or Device Check between Consumer and Provider
    if (params.consumerId && params.providerId && (params.clientIp || params.deviceHash)) {
      const isSameActor = await this.checkSameActorPattern(
        params.consumerId,
        params.providerId,
        params.clientIp,
        params.deviceHash,
      );
      if (isSameActor) {
        flagReasons.push('SAME_IP_OR_DEVICE');
      }
    }

    // 4. Burst Review Pattern
    if (params.consumerId) {
      const isBurst = await this.checkBurstReviews(params.consumerId, params.providerId);
      if (isBurst) {
        flagReasons.push('BURST_REVIEWS');
      }
    }

    const isFlagged = flagReasons.length > 0;
    const moderationStatus = isFlagged
      ? ReviewModerationStatus.FLAGGED
      : ReviewModerationStatus.PUBLISHED;

    if (isFlagged) {
      this.logger.warn(
        `Review flagged for moderation. Reasons: ${flagReasons.join(', ')} (providerId=${params.providerId})`,
      );
    }

    return {
      isFlagged,
      flagReasons,
      moderationStatus,
    };
  }

  /**
   * Checks if consumer and provider have matching IP address or deviceHash in recent activity
   */
  private async checkSameActorPattern(
    consumerId: string,
    providerId: string,
    clientIp?: string | null,
    deviceHash?: string | null,
  ): Promise<boolean> {
    if (consumerId === providerId) return true;

    try {
      // Check if provider has logged in or performed actions from this same IP or device
      const providerMatch = await prisma.auditLog.findFirst({
        where: {
          userId: providerId,
          OR: [
            clientIp ? { ipAddress: clientIp } : {},
            deviceHash ? { userAgent: deviceHash } : {},
          ].filter((c) => Object.keys(c).length > 0),
        },
      });

      return !!providerMatch;
    } catch {
      return false;
    }
  }

  /**
   * Checks for burst review anomalies (e.g. consumer submitting multiple reviews within minutes)
   */
  private async checkBurstReviews(consumerId: string, providerId: string): Promise<boolean> {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      // Check if consumer submitted another review within 15 minutes
      const recentConsumerReviews = await prisma.review.count({
        where: {
          consumerId,
          createdAt: { gte: fifteenMinutesAgo },
        },
      });

      if (recentConsumerReviews >= 2) return true;

      // Check if provider received sudden burst of reviews (>5 within 1 hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentProviderReviews = await prisma.review.count({
        where: {
          providerId,
          createdAt: { gte: oneHourAgo },
        },
      });

      if (recentProviderReviews >= 5) return true;

      return false;
    } catch {
      return false;
    }
  }
}
