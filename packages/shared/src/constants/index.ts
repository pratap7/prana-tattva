export const DEFAULT_PLATFORM_COMMISSION_PERCENT = 15;

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

export const SESSION_FORMATS = ['VIDEO', 'IN_PERSON'] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const SUPPORTED_CURRENCIES = ['INR', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const USER_ROLES = ['CONSUMER', 'PROVIDER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];
