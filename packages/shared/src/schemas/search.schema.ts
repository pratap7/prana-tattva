import { z } from 'zod';
import {
  SERVICE_MODES,
  ServiceMode,
  VERIFICATION_TIERS,
  VerificationTier,
} from '../constants/index.js';

export const SORT_OPTIONS = [
  'RELEVANCE',
  'RATING',
  'PRICE_ASC',
  'PRICE_DESC',
  'SOONEST_AVAILABILITY',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const AVAILABILITY_FILTERS = ['TODAY', 'THIS_WEEK'] as const;
export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

export const providerSearchQuerySchema = z.object({
  q: z.string().optional().describe('Text search across name, headline, specialties, and bio'),
  category: z.string().optional().describe('Category slug or category ID'),
  subcategories: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }),
  minPrice: z.coerce
    .number()
    .nonnegative()
    .optional()
    .describe('Minimum starting price in rupees or paise'),
  maxPrice: z.coerce
    .number()
    .positive()
    .optional()
    .describe('Maximum starting price in rupees or paise'),
  language: z.string().optional().describe('Practitioner spoken language code (e.g. en, hi, sa)'),
  mode: z.enum(SERVICE_MODES).optional().describe('Session delivery format'),
  city: z.string().optional().describe('In-person sanctuary city location'),
  minRating: z.coerce.number().min(0).max(5).optional().describe('Minimum star rating floor'),
  verificationTier: z.enum(VERIFICATION_TIERS).optional().describe('Sanctuary verification tier'),
  availability: z
    .enum(AVAILABILITY_FILTERS)
    .optional()
    .describe('Immediate availability window (TODAY or THIS_WEEK)'),
  sortBy: z
    .enum(SORT_OPTIONS)
    .default('RELEVANCE')
    .optional()
    .describe('Search ranking / sorting criteria'),
  limit: z.coerce.number().int().min(1).max(50).default(12).optional(),
  cursor: z.string().optional().describe('Opaque cursor token for cursor-based pagination'),
});

export type ProviderSearchQueryDto = z.infer<typeof providerSearchQuerySchema>;

export interface ProviderSearchResultItem {
  id: string;
  userId: string;
  displayName: string;
  slug: string;
  headline: string;
  bio: string;
  avatarUrl: string | null;
  city: string;
  country: string;
  languages: string[];
  verificationTier: VerificationTier;
  ratingAvg: number;
  ratingCount: number;
  completedSessions: number;
  responseRate: number;
  categories: {
    id: string;
    name: string;
    slug: string;
    isPrimary: boolean;
    requiresLicense: boolean;
  }[];
  startingPricePaise: number;
  startingPriceRupees: number;
  currency: string;
  modes: ServiceMode[];
  nextAvailableSlot: {
    startAt: string;
    localDisplay: string;
    localDate: string;
  } | null;
  score?: number;
}

export interface SearchFacets {
  categories: { id: string; name: string; slug: string; count: number }[];
  cities: { name: string; count: number }[];
  languages: { code: string; count: number }[];
  priceRange: { min: number; max: number };
}

export interface ProviderSearchResponse {
  items: ProviderSearchResultItem[];
  nextCursor: string | null;
  totalCount: number;
  facets: SearchFacets;
}
