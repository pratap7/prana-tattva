export const DEFAULT_PLATFORM_COMMISSION_PERCENT = 15;
export const DEFAULT_PLATFORM_COMMISSION_BPS = 1500; // 1500 bps = 15.00%

export const SERVICE_CATEGORIES = [
  'YOGA',
  'REIKI_HEALING',
  'PSYCHOTHERAPY',
  'PRANIC_HEALING',
  'ASTROLOGY',
  'SPIRITUALITY',
  'SOUND_HEALING',
  'MEDITATION',
  'LIFE_COACHING',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_MODES = ['ONLINE', 'IN_PERSON', 'BOTH'] as const;
export type ServiceMode = (typeof SERVICE_MODES)[number];

export const SESSION_FORMATS = ['VIDEO', 'IN_PERSON'] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const CANCELLATION_POLICIES = ['FLEXIBLE', 'MODERATE', 'STRICT'] as const;
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];

export const SUPPORTED_CURRENCIES = ['INR', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const USER_ROLES = ['CONSUMER', 'PROVIDER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const VERIFICATION_TIERS = [
  'UNVERIFIED',
  'ID_VERIFIED',
  'CREDENTIAL_VERIFIED',
  'BACKGROUND_CHECKED',
] as const;
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

export const APPROVAL_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED_BY_CONSUMER',
  'CANCELLED_BY_PROVIDER',
  'NO_SHOW_CONSUMER',
  'NO_SHOW_PROVIDER',
  'DISPUTED',
  'REFUNDED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYOUT_STATUSES = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const CONSENT_TYPES = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'DATA_PROCESSING',
  'HEALTH_DATA_CONSENT',
  'MARKETING',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CREDENTIAL_TYPES = [
  'DEGREE',
  'CERTIFICATION',
  'LICENSE',
  'ACCREDITATION',
  'IDENTITY_DOCUMENT',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SERVICE_DURATION_LIMITS = {
  MIN_MINUTES: 15,
  MAX_MINUTES: 180,
  DEFAULT_MINUTES: 60,
  ALLOWED_DURATIONS: [15, 30, 45, 60, 75, 90, 120, 150, 180] as const,
} as const;

export const SERVICE_PRICE_LIMITS = {
  MIN_PAISE: 5000, // ₹50
  MAX_PAISE: 10000000, // ₹1,00,000
} as const;

export const AVAILABILITY_LIMITS = {
  DEFAULT_BUFFER_MINUTES: 15,
  MIN_BUFFER_MINUTES: 0,
  MAX_BUFFER_MINUTES: 60,
  DEFAULT_MIN_NOTICE_HOURS: 4,
  MIN_NOTICE_HOURS: 0,
  MAX_NOTICE_HOURS: 168, // 7 days
} as const;
