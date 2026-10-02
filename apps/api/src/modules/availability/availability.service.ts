import { Injectable, NotFoundException, BadRequestException, Logger, Inject } from '@nestjs/common';
import { DateTime } from 'luxon';
import { prisma, AvailabilityRule, AvailabilityException } from '@project-nirvana/db';
import {
  SetAvailabilityRulesInput,
  CreateAvailabilityExceptionInput,
  UpdateAvailabilityConfigInput,
  GetAvailableSlotsQueryInput,
  AvailableSlot,
} from '@project-nirvana/shared';
import { RedisCacheService } from './services/redis-cache.service';
import { AvailabilityEngineService } from './services/availability-engine.service';
import { ICalendarSyncService, CALENDAR_SYNC_SERVICE } from './interfaces/calendar-sync.interface';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly availabilityEngine: AvailabilityEngineService,
    @Inject(CALENDAR_SYNC_SERVICE)
    private readonly calendarSyncService: ICalendarSyncService,
  ) {}

  private async getProviderProfileOrThrow(userId: string) {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(
        'Provider profile not found. Please complete basic onboarding first.',
      );
    }
    return profile;
  }

  // ==========================================================================
  // RULES MANAGEMENT
  // ==========================================================================

  async getRules(userId: string): Promise<AvailabilityRule[]> {
    const provider = await this.getProviderProfileOrThrow(userId);

    return prisma.availabilityRule.findMany({
      where: { providerId: provider.id },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setRules(userId: string, input: SetAvailabilityRulesInput): Promise<AvailabilityRule[]> {
    const provider = await this.getProviderProfileOrThrow(userId);

    const defaultZone = input.providerTimeZone || 'Asia/Kolkata';

    // Validate that time zone is valid IANA
    if (!DateTime.local().setZone(defaultZone).isValid) {
      throw new BadRequestException(`Invalid IANA time zone: "${defaultZone}"`);
    }

    // Atomic replacement in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({
        where: { providerId: provider.id },
      });

      if (input.rules.length > 0) {
        await tx.availabilityRule.createMany({
          data: input.rules.map((rule) => ({
            providerId: provider.id,
            weekday: rule.weekday,
            startTime: rule.startTime,
            endTime: rule.endTime,
            providerTimeZone: rule.providerTimeZone || defaultZone,
            isActive: rule.isActive ?? true,
          })),
        });
      }
    });

    // Invalidate slot cache for provider
    await this.redisCacheService.invalidateProviderSlots(provider.id);

    return prisma.availabilityRule.findMany({
      where: { providerId: provider.id },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  // ==========================================================================
  // EXCEPTIONS (DAYS OFF / EXTRA SLOTS)
  // ==========================================================================

  async getExceptions(userId: string): Promise<AvailabilityException[]> {
    const provider = await this.getProviderProfileOrThrow(userId);

    return prisma.availabilityException.findMany({
      where: { providerId: provider.id },
      orderBy: { startAt: 'asc' },
    });
  }

  async createException(
    userId: string,
    input: CreateAvailabilityExceptionInput,
  ): Promise<AvailabilityException> {
    const provider = await this.getProviderProfileOrThrow(userId);

    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);

    if (startAt >= endAt) {
      throw new BadRequestException('startAt must be strictly before endAt.');
    }

    const exception = await prisma.availabilityException.create({
      data: {
        providerId: provider.id,
        startAt,
        endAt,
        isBlocked: input.isBlocked,
        reason: input.reason,
      },
    });

    // Invalidate slot cache for provider
    await this.redisCacheService.invalidateProviderSlots(provider.id);

    return exception;
  }

  async deleteException(userId: string, exceptionId: string): Promise<{ success: boolean }> {
    const provider = await this.getProviderProfileOrThrow(userId);

    const exception = await prisma.availabilityException.findFirst({
      where: { id: exceptionId, providerId: provider.id },
    });

    if (!exception) {
      throw new NotFoundException(`Availability exception ${exceptionId} not found.`);
    }

    await prisma.availabilityException.delete({
      where: { id: exceptionId },
    });

    // Invalidate slot cache for provider
    await this.redisCacheService.invalidateProviderSlots(provider.id);

    return { success: true };
  }

  // ==========================================================================
  // CONFIG (BUFFER & MIN NOTICE)
  // ==========================================================================

  async getConfig(userId: string) {
    const provider = await this.getProviderProfileOrThrow(userId);
    return {
      bufferMinutes: provider.bufferMinutes,
      minNoticeHours: provider.minNoticeHours,
    };
  }

  async updateConfig(userId: string, input: UpdateAvailabilityConfigInput) {
    const provider = await this.getProviderProfileOrThrow(userId);

    const updated = await prisma.providerProfile.update({
      where: { id: provider.id },
      data: {
        ...(input.bufferMinutes !== undefined && { bufferMinutes: input.bufferMinutes }),
        ...(input.minNoticeHours !== undefined && { minNoticeHours: input.minNoticeHours }),
      },
    });

    // Invalidate slot cache for provider
    await this.redisCacheService.invalidateProviderSlots(provider.id);

    return {
      bufferMinutes: updated.bufferMinutes,
      minNoticeHours: updated.minNoticeHours,
    };
  }

  // ==========================================================================
  // SLOT GENERATION ENGINE
  // ==========================================================================

  async getAvailableSlots(
    providerIdOrSlug: string,
    query: GetAvailableSlotsQueryInput,
  ): Promise<{
    slots: AvailableSlot[];
    cached: boolean;
    provider: { id: string; displayName: string; timeZone: string };
    service: { id: string; title: string; durationMin: number; priceAmount: number };
    totalSlots: number;
  }> {
    // 1. Locate provider profile
    const provider = await prisma.providerProfile.findFirst({
      where: {
        OR: [{ id: providerIdOrSlug }, { slug: providerIdOrSlug }],
      },
      include: {
        user: { select: { id: true, timeZone: true } },
      },
    });

    if (!provider) {
      throw new NotFoundException(`Practitioner "${providerIdOrSlug}" not found.`);
    }

    // 2. Locate service
    const service = await prisma.service.findFirst({
      where: {
        id: query.serviceId,
        providerId: provider.id,
        isActive: true,
      },
    });

    if (!service) {
      throw new NotFoundException(
        `Active service "${query.serviceId}" not found for this practitioner.`,
      );
    }

    // Validate viewer timezone
    const viewerZone = query.viewerTimeZone || 'UTC';
    if (!DateTime.local().setZone(viewerZone).isValid) {
      throw new BadRequestException(`Invalid viewer time zone: "${viewerZone}"`);
    }

    // Check Redis cache first
    const cacheKey = `slots:${provider.id}:${service.id}:${query.startDate}:${query.endDate}:${viewerZone}`;
    const cachedSlots = await this.redisCacheService.get(cacheKey);

    if (cachedSlots) {
      try {
        const parsed: AvailableSlot[] = JSON.parse(cachedSlots);
        return {
          slots: parsed,
          cached: true,
          provider: {
            id: provider.id,
            displayName: provider.displayName,
            timeZone: provider.user.timeZone,
          },
          service: {
            id: service.id,
            title: service.title,
            durationMin: service.durationMin,
            priceAmount: service.priceAmount,
          },
          totalSlots: parsed.length,
        };
      } catch {
        // Fall through to live generation if cached payload corrupted
      }
    }

    // 3. Fetch rules, exceptions, and existing bookings
    const [rules, exceptions, bookings] = await Promise.all([
      prisma.availabilityRule.findMany({
        where: { providerId: provider.id, isActive: true },
      }),
      prisma.availabilityException.findMany({
        where: { providerId: provider.id },
      }),
      prisma.booking.findMany({
        where: {
          providerId: provider.userId,
          status: {
            notIn: ['CANCELLED_BY_CONSUMER', 'CANCELLED_BY_PROVIDER', 'REFUNDED'],
          },
        },
      }),
    ]);

    // Query external calendar busy times
    const rangeStartUtc = DateTime.fromISO(query.startDate, { zone: 'utc' }).minus({ days: 1 });
    const rangeEndUtc = DateTime.fromISO(query.endDate, { zone: 'utc' }).plus({ days: 2 });
    const calendarBusyTimes = await this.calendarSyncService.getBusyTimes(
      provider.id,
      rangeStartUtc,
      rangeEndUtc,
    );

    // 4. Run AvailabilityEngine
    const slots = this.availabilityEngine.generateSlots({
      providerTimeZone: provider.user.timeZone || 'Asia/Kolkata',
      rules,
      exceptions,
      bookings,
      calendarBusyTimes,
      serviceDurationMin: service.durationMin,
      bufferMinutes: provider.bufferMinutes,
      minNoticeHours: provider.minNoticeHours,
      startDate: query.startDate,
      endDate: query.endDate,
      viewerTimeZone: viewerZone,
    });

    // 5. Cache result in Redis (TTL: 600 seconds = 10 minutes)
    await this.redisCacheService.set(cacheKey, JSON.stringify(slots), 600);

    return {
      slots,
      cached: false,
      provider: {
        id: provider.id,
        displayName: provider.displayName,
        timeZone: provider.user.timeZone,
      },
      service: {
        id: service.id,
        title: service.title,
        durationMin: service.durationMin,
        priceAmount: service.priceAmount,
      },
      totalSlots: slots.length,
    };
  }
}
