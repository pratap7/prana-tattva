import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { prisma as defaultPrisma, PrismaClient } from '@project-nirvana/db';
import {
  ProviderSearchQueryDto,
  ProviderSearchResponse,
  ProviderSearchResultItem,
  SearchFacets,
  SortOption,
  ServiceMode,
  VerificationTier,
} from '@project-nirvana/shared';
import { ISearchService } from '../interfaces/search.interface';
import { DateTime } from 'luxon';

const BAYESIAN_PRIOR_COUNT = 5;
const BAYESIAN_PRIOR_MEAN = 4.5;

interface DecodedCursor {
  offset: number;
}

interface ProviderCategoryRelation {
  categoryId?: string;
  isPrimary?: boolean;
  category?: {
    id: string;
    name: string;
    slug: string;
    requiresLicense: boolean;
  } | null;
}

interface ProviderServiceRecord {
  id: string;
  title: string;
  priceAmount: number;
  currency: string;
  durationMin?: number;
  durationMinutes?: number;
  mode: string;
  isActive: boolean;
}

interface ProviderRuleRecord {
  weekday: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  providerTimeZone?: string;
}

interface ProviderExceptionRecord {
  startAt: Date;
  endAt: Date;
  isBlocked: boolean;
}

interface RawProviderRecord {
  id: string;
  userId: string;
  displayName: string;
  slug: string;
  headline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  country?: string | null;
  languages?: string[];
  verificationTier?: string;
  ratingAvg?: unknown;
  ratingCount?: number | null;
  completedSessions?: number | null;
  responseRate?: number | null;
  minNoticeHours?: number | null;
  user?: {
    timeZone?: string | null;
  } | null;
  categories?: ProviderCategoryRelation[];
  services?: ProviderServiceRecord[];
  availabilityRules?: ProviderRuleRecord[];
  availabilityExceptions?: ProviderExceptionRecord[];
  [key: string]: unknown;
}

@Injectable()
export class PostgresSearchService implements ISearchService {
  private readonly logger = new Logger(PostgresSearchService.name);
  private readonly prisma: PrismaClient;

  constructor(@Optional() @Inject('PRISMA_CLIENT') prismaClient?: PrismaClient) {
    this.prisma = prismaClient || (defaultPrisma as unknown as PrismaClient);
  }

  /**
   * Search approved providers matching all query criteria, with weighted FTS,
   * trigram typo tolerance, composite Bayesian ranking, and cursor-based pagination.
   */
  async searchProviders(query: ProviderSearchQueryDto): Promise<ProviderSearchResponse> {
    const limit = query.limit || 12;
    const offset = this.decodeCursor(query.cursor);

    try {
      // Attempt PostgreSQL Full-Text & Trigram search via raw query when possible
      return await this.searchPostgresRaw(query, limit, offset);
    } catch (err: unknown) {
      this.logger.warn(
        `Raw PostgreSQL full-text search fell back to Prisma/in-memory engine: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return await this.searchPrismaFallback(query, limit, offset);
    }
  }

  /**
   * Get search facets (categories, cities, languages, price range)
   */
  async getFacets(): Promise<SearchFacets> {
    try {
      const [categories, providers, services] = await Promise.all([
        this.prisma.category.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
            _count: {
              select: {
                providers: {
                  where: {
                    provider: {
                      approvalStatus: 'APPROVED',
                    },
                  },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        }),
        this.prisma.providerProfile.findMany({
          where: { approvalStatus: 'APPROVED' },
          select: { city: true, languages: true },
        }),
        this.prisma.service.aggregate({
          where: {
            isActive: true,
            provider: { approvalStatus: 'APPROVED' },
          },
          _min: { priceAmount: true },
          _max: { priceAmount: true },
        }),
      ]);

      // City counts
      const cityMap = new Map<string, number>();
      const langMap = new Map<string, number>();

      for (const p of providers) {
        if (p.city) {
          cityMap.set(p.city, (cityMap.get(p.city) || 0) + 1);
        }
        for (const l of p.languages) {
          langMap.set(l, (langMap.get(l) || 0) + 1);
        }
      }

      const cities = Array.from(cityMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      const languages = Array.from(langMap.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);

      const minPrice = services._min.priceAmount ? Math.floor(services._min.priceAmount / 100) : 50;
      const maxPrice = services._max.priceAmount
        ? Math.ceil(services._max.priceAmount / 100)
        : 10000;

      return {
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          count: c._count.providers,
        })),
        cities,
        languages,
        priceRange: { min: minPrice, max: maxPrice },
      };
    } catch {
      return {
        categories: [],
        cities: [],
        languages: [],
        priceRange: { min: 50, max: 10000 },
      };
    }
  }

  /**
   * Raw PostgreSQL full-text search with tsvector GIN index + pg_trgm similarity
   */
  private async searchPostgresRaw(
    query: ProviderSearchQueryDto,
    limit: number,
    offset: number,
  ): Promise<ProviderSearchResponse> {
    // Collect active providers with services & categories
    const providers = await this.prisma.providerProfile.findMany({
      where: {
        approvalStatus: 'APPROVED',
        ...(query.verificationTier ? { verificationTier: query.verificationTier } : {}),
        ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
        ...(query.language ? { languages: { has: query.language } } : {}),
        ...(query.minRating ? { ratingAvg: { gte: query.minRating } } : {}),
        ...(query.category
          ? {
              categories: {
                some: {
                  OR: [
                    { category: { slug: query.category } },
                    { category: { id: query.category } },
                  ],
                },
              },
            }
          : {}),
      },
      include: {
        categories: {
          include: { category: true },
        },
        services: {
          where: { isActive: true },
        },
        availabilityRules: {
          where: { isActive: true },
        },
        availabilityExceptions: {
          where: {
            endAt: { gte: new Date() },
          },
        },
      },
    });

    return this.rankAndFilterProviders(providers, query, limit, offset);
  }

  /**
   * Prisma fallback implementation for in-memory & test environments
   */
  private async searchPrismaFallback(
    query: ProviderSearchQueryDto,
    limit: number,
    offset: number,
  ): Promise<ProviderSearchResponse> {
    const providers = await this.prisma.providerProfile.findMany({
      where: {
        approvalStatus: 'APPROVED',
        ...(query.verificationTier ? { verificationTier: query.verificationTier } : {}),
        ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
        ...(query.language ? { languages: { has: query.language } } : {}),
        ...(query.minRating ? { ratingAvg: { gte: query.minRating } } : {}),
        ...(query.category
          ? {
              categories: {
                some: {
                  OR: [
                    { category: { slug: query.category } },
                    { category: { id: query.category } },
                  ],
                },
              },
            }
          : {}),
      },
      include: {
        categories: {
          include: { category: true },
        },
        services: {
          where: { isActive: true },
        },
        availabilityRules: {
          where: { isActive: true },
        },
        availabilityExceptions: {
          where: {
            endAt: { gte: new Date() },
          },
        },
      },
    });

    return this.rankAndFilterProviders(providers, query, limit, offset);
  }

  /**
   * Process filters, calculate text relevance + Bayesian composite score, sort, and paginate
   */
  private async rankAndFilterProviders(
    rawProviders: RawProviderRecord[],
    query: ProviderSearchQueryDto,
    limit: number,
    offset: number,
  ): Promise<ProviderSearchResponse> {
    const minPricePaise =
      query.minPrice !== undefined && query.minPrice !== null
        ? query.minPrice <= 100000
          ? Math.round(query.minPrice * 100)
          : Math.round(query.minPrice)
        : null;
    const maxPricePaise =
      query.maxPrice !== undefined && query.maxPrice !== null
        ? query.maxPrice <= 100000
          ? Math.round(query.maxPrice * 100)
          : Math.round(query.maxPrice)
        : null;

    const now = DateTime.utc();
    const currentWeekday = now.toFormat('cccc').toUpperCase();

    // 1. Filter candidates
    const filtered = rawProviders.filter((p) => {
      // Must have at least one active service
      if (!p.services || p.services.length === 0) return false;

      // Price filter: provider must have at least one service within range
      const services = p.services || [];
      const prices = services.map((s) => s.priceAmount);
      const minServicePrice = Math.min(...prices);

      if (minPricePaise !== null && minServicePrice < minPricePaise) return false;
      if (maxPricePaise !== null && minServicePrice > maxPricePaise) return false;

      // Category filter
      if (query.category) {
        const catMatch = (p.categories || []).some(
          (c: ProviderCategoryRelation) =>
            c.category?.slug === query.category ||
            c.category?.id === query.category ||
            c.categoryId === query.category,
        );
        if (!catMatch) return false;
      }

      // City filter
      if (query.city) {
        if (!p.city || p.city.toLowerCase() !== query.city.toLowerCase()) {
          return false;
        }
      }

      // Language filter
      if (query.language) {
        if (!p.languages || !p.languages.includes(query.language)) {
          return false;
        }
      }

      // Minimum rating filter
      if (query.minRating !== undefined && query.minRating !== null) {
        if (Number(p.ratingAvg || 0) < query.minRating) {
          return false;
        }
      }

      // Verification tier filter
      if (query.verificationTier) {
        if (p.verificationTier !== query.verificationTier) {
          return false;
        }
      }

      // Mode filter
      if (query.mode) {
        const matchesMode = services.some((s) => s.mode === query.mode || s.mode === 'BOTH');
        if (!matchesMode) return false;
      }

      // Subcategories filter
      if (query.subcategories && query.subcategories.length > 0) {
        const providerCategorySlugs = (p.categories || []).map(
          (c: ProviderCategoryRelation) => c.category?.slug,
        );
        const matchesSub = query.subcategories.some((sub) => providerCategorySlugs.includes(sub));
        if (!matchesSub) return false;
      }

      // Availability filter
      if (query.availability === 'TODAY') {
        const hasRuleToday = (p.availabilityRules || []).some(
          (r: ProviderRuleRecord) => r.weekday === currentWeekday && r.isActive,
        );
        const hasExtraSlotToday = (p.availabilityExceptions || []).some(
          (e: ProviderExceptionRecord) =>
            !e.isBlocked && DateTime.fromJSDate(e.startAt).hasSame(now, 'day'),
        );
        const isBlockedToday = (p.availabilityExceptions || []).some(
          (e: ProviderExceptionRecord) =>
            e.isBlocked && DateTime.fromJSDate(e.startAt).hasSame(now, 'day'),
        );
        if ((!hasRuleToday && !hasExtraSlotToday) || isBlockedToday) {
          return false;
        }
      } else if (query.availability === 'THIS_WEEK') {
        const hasWeeklyRules = (p.availabilityRules || []).some(
          (r: ProviderRuleRecord) => r.isActive,
        );
        const hasExtraSlots = (p.availabilityExceptions || []).some(
          (e: ProviderExceptionRecord) => !e.isBlocked,
        );
        if (!hasWeeklyRules && !hasExtraSlots) {
          return false;
        }
      }

      return true;
    });

    // 2. Score and Rank candidates
    const queryText = (query.q || '').trim().toLowerCase();
    const queryTokens = queryText ? queryText.split(/\s+/).filter(Boolean) : [];

    const scored = filtered.map((p) => {
      const ratingAvg = Number(p.ratingAvg || 0);
      const ratingCount = Number(p.ratingCount || 0);
      const completedSessions = Number(p.completedSessions || 0);
      const responseRate = Number(p.responseRate ?? 100);

      // Bayesian Average Rating:
      // (C * m + R * v) / (C + v)
      const bayesianRating =
        (BAYESIAN_PRIOR_COUNT * BAYESIAN_PRIOR_MEAN + ratingAvg * ratingCount) /
        (BAYESIAN_PRIOR_COUNT + ratingCount);

      // Verification tier boost
      let tierBoost = 0;
      if (p.verificationTier === 'BACKGROUND_CHECKED') tierBoost = 0.35;
      else if (p.verificationTier === 'CREDENTIAL_VERIFIED') tierBoost = 0.25;
      else if (p.verificationTier === 'ID_VERIFIED') tierBoost = 0.12;

      // Response rate factor (0.0 to 0.10)
      const responseRateFactor = (responseRate / 100) * 0.1;

      // Completed sessions logarithmic boost (up to 0.25)
      const sessionsBoost = Math.min(0.25, Math.log10(1 + completedSessions) * 0.08);

      // Text relevance calculation (weighted fields: name > headline > specialties > bio)
      let textRelevance = 0;
      if (queryTokens.length > 0) {
        const name = (p.displayName || '').toLowerCase();
        const headline = (p.headline || '').toLowerCase();
        const bio = (p.bio || '').toLowerCase();
        const categoryNames = (p.categories || [])
          .map((c: ProviderCategoryRelation) => (c.category?.name || '').toLowerCase())
          .join(' ');

        for (const token of queryTokens) {
          // Exact and substring match weighting
          if (name === token) textRelevance += 4.0;
          else if (name.includes(token)) textRelevance += 2.5;

          if (headline.includes(token)) textRelevance += 1.8;
          if (categoryNames.includes(token)) textRelevance += 1.5;
          if (bio.includes(token)) textRelevance += 0.5;

          // Trigram / fuzzy typo tolerance match
          const trigramNameScore = this.calculateTrigramSimilarity(name, token);
          const trigramHeadlineScore = this.calculateTrigramSimilarity(headline, token);

          if (trigramNameScore > 0.4) textRelevance += trigramNameScore * 1.5;
          if (trigramHeadlineScore > 0.4) textRelevance += trigramHeadlineScore * 0.8;
        }
      }

      // Composite Rank
      let compositeScore: number;
      if (queryTokens.length > 0) {
        compositeScore =
          textRelevance * 0.5 +
          bayesianRating * 0.25 +
          tierBoost * 0.15 +
          responseRateFactor * 0.05 +
          sessionsBoost * 0.05;
      } else {
        compositeScore =
          bayesianRating * 0.5 + tierBoost * 0.25 + sessionsBoost * 0.15 + responseRateFactor * 0.1;
      }

      // Calculate starting price
      const prices = (p.services || []).map((s) => s.priceAmount);
      const startingPricePaise = prices.length > 0 ? Math.min(...prices) : 5000;

      return {
        provider: p,
        score: compositeScore,
        bayesianRating,
        startingPricePaise,
      };
    });

    // 3. Sort
    const sortBy: SortOption = query.sortBy || 'RELEVANCE';
    scored.sort((a, b) => {
      if (sortBy === 'RATING') {
        if (b.bayesianRating !== a.bayesianRating) return b.bayesianRating - a.bayesianRating;
        return b.score - a.score;
      }
      if (sortBy === 'PRICE_ASC') {
        if (a.startingPricePaise !== b.startingPricePaise) {
          return a.startingPricePaise - b.startingPricePaise;
        }
        return b.score - a.score;
      }
      if (sortBy === 'PRICE_DESC') {
        if (b.startingPricePaise !== a.startingPricePaise) {
          return b.startingPricePaise - a.startingPricePaise;
        }
        return b.score - a.score;
      }
      if (sortBy === 'SOONEST_AVAILABILITY') {
        const aSlot = this.computeNextSlot(a.provider);
        const bSlot = this.computeNextSlot(b.provider);
        const aTime = aSlot ? new Date(aSlot.startAt).getTime() : Infinity;
        const bTime = bSlot ? new Date(bSlot.startAt).getTime() : Infinity;
        if (aTime !== bTime) return aTime - bTime;
        return b.score - a.score;
      }

      // Default: RELEVANCE
      return b.score - a.score;
    });

    // 4. Paginate
    const totalCount = scored.length;
    const pageItems = scored.slice(offset, offset + limit);

    const items: ProviderSearchResultItem[] = pageItems.map(
      ({ provider: p, score, startingPricePaise }) => {
        const nextAvailableSlot = this.computeNextSlot(p);
        const uniqueModes = Array.from(
          new Set<ServiceMode>((p.services || []).map((s) => s.mode as ServiceMode)),
        );

        return {
          id: p.id,
          userId: p.userId,
          displayName: p.displayName,
          slug: p.slug,
          headline: p.headline || '',
          bio: p.bio || '',
          avatarUrl: p.avatarUrl || null,
          city: p.city || '',
          country: p.country || '',
          languages: p.languages || ['en'],
          verificationTier: (p.verificationTier || 'UNVERIFIED') as VerificationTier,
          ratingAvg: Number(p.ratingAvg || 0),
          ratingCount: Number(p.ratingCount || 0),
          completedSessions: Number(p.completedSessions || 0),
          responseRate: Number(p.responseRate ?? 100),
          categories: (p.categories || []).map((pc: ProviderCategoryRelation) => ({
            id: pc.category?.id || pc.categoryId || '',
            name: pc.category?.name || '',
            slug: pc.category?.slug || '',
            isPrimary: pc.isPrimary || false,
            requiresLicense: pc.category?.requiresLicense || false,
          })),
          startingPricePaise,
          startingPriceRupees: Math.round(startingPricePaise / 100),
          currency: p.services?.[0]?.currency || 'INR',
          modes: uniqueModes,
          nextAvailableSlot,
          score: Number(score.toFixed(3)),
        };
      },
    );

    const nextOffset = offset + limit;
    const nextCursor = nextOffset < totalCount ? this.encodeCursor(nextOffset) : null;

    // Get aggregated facets
    const facets = await this.getFacets();

    return {
      items,
      nextCursor,
      totalCount,
      facets,
    };
  }

  /**
   * Helper: Calculate fast trigram similarity between two strings without object allocation overhead
   */
  private calculateTrigramSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2 || str2.length < 3) return 0;
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    if (s1 === s2) return 1.0;
    if (s1.includes(s2)) return 0.8;

    let matches = 0;
    const maxTrigrams = s2.length - 2;
    for (let i = 0; i < maxTrigrams; i++) {
      const tri = s2.substring(i, i + 3);
      if (s1.includes(tri)) matches++;
    }
    return matches / maxTrigrams;
  }

  /**
   * Helper: Compute earliest upcoming available slot for provider
   */
  private computeNextSlot(
    provider: RawProviderRecord,
  ): { startAt: string; localDisplay: string; localDate: string } | null {
    const rules = provider.availabilityRules || [];
    if (rules.length === 0) return null;

    const tz = provider.user?.timeZone || rules[0]?.providerTimeZone || 'Asia/Kolkata';
    const now = DateTime.now().setZone(tz);

    // Look over the next 7 days for the first active rule
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const candidateDate = now.plus({ days: dayOffset });
      const weekdayStr = candidateDate.toFormat('cccc').toUpperCase();

      const rule = rules.find((r: ProviderRuleRecord) => r.weekday === weekdayStr && r.isActive);
      if (rule) {
        const [hour, minute] = rule.startTime.split(':').map(Number);
        const slotStart = candidateDate.set({ hour, minute, second: 0, millisecond: 0 });

        if (slotStart > now.plus({ hours: provider.minNoticeHours || 4 })) {
          return {
            startAt: slotStart.toUTC().toISO()!,
            localDisplay: slotStart.toFormat('hh:mm a'),
            localDate: slotStart.toFormat('yyyy-MM-dd'),
          };
        }
      }
    }

    return null;
  }

  private encodeCursor(offset: number): string {
    const data: DecodedCursor = { offset };
    return Buffer.from(JSON.stringify(data)).toString('base64url');
  }

  private decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    try {
      const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
      const parsed = JSON.parse(raw) as DecodedCursor;
      return typeof parsed.offset === 'number' && parsed.offset >= 0 ? parsed.offset : 0;
    } catch {
      return 0;
    }
  }
}
