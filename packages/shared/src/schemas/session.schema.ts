import { z } from 'zod';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

export const recordingConsentSchema = z.object({
  consentGranted: z.boolean().refine((val) => val === true, {
    message: 'Explicit consent must be granted to enable recording',
  }),
});

export type RecordingConsentDto = z.infer<typeof recordingConsentSchema>;

export const extendSessionSchema = z.object({
  minutes: z
    .number()
    .int()
    .min(5, { message: 'Extension must be at least 5 minutes' })
    .max(30, { message: 'Extension cannot exceed 30 minutes' })
    .default(15),
  reason: z.string().max(500).optional(),
});

export type ExtendSessionDto = z.infer<typeof extendSessionSchema>;

export const dailyWebhookSchema = z.object({
  event: z.string(),
  id: z.string().optional(),
  room: z.string().optional(),
  session_id: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  participant: z
    .object({
      session_id: z.string().optional(),
      user_name: z.string().optional(),
      user_id: z.string().optional(),
      owner: z.boolean().optional(),
      joined_at: z.number().optional(),
    })
    .optional(),
});

export type DailyWebhookDto = z.infer<typeof dailyWebhookSchema>;

// ============================================================================
// RESPONSE MODELS & INTERFACES
// ============================================================================

export interface SessionPartnerDetails {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

export interface InPersonSessionDetails {
  address: string;
  city: string;
  instructions: string | null;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  mapEmbedUrl?: string;
  googleMapsUrl?: string;
}

export interface JoinSessionResponse {
  token: string;
  roomUrl: string;
  roomName: string;
  isOwner: boolean;
  sessionStartAt: string;
  sessionEndAt: string;
  windowExpiresAt: string;
  mode: 'ONLINE' | 'IN_PERSON' | 'BOTH' | string;
  serviceTitle: string;
  partner: SessionPartnerDetails;
  recordingAllowed: boolean;
  isPsychotherapy: boolean;
  recordingStatus: 'DISABLED' | 'CONSENT_PENDING' | 'RECORDING' | 'COMPLETED';
  recordingConsents: {
    consumer: boolean;
    provider: boolean;
  };
}

export interface SessionStatusResponse {
  bookingId: string;
  status: string;
  mode: 'ONLINE' | 'IN_PERSON' | 'BOTH' | string;
  windowOpensAt: string;
  windowClosesAt: string;
  isWindowOpen: boolean;
  canJoin: boolean;
  roomName: string | null;
  joinedByConsumerAt: string | null;
  joinedByProviderAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  isProviderPresent: boolean;
  recordingStatus: 'DISABLED' | 'CONSENT_PENDING' | 'RECORDING' | 'COMPLETED';
  recordingConsents: {
    consumer: boolean;
    provider: boolean;
  };
  recordingAllowed: boolean;
  isPsychotherapy: boolean;
  extendedMinutes: number;
  inPersonDetails?: InPersonSessionDetails;
}
