import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { prisma, Service, CredentialStatus } from '@project-nirvana/db';
import {
  CreateServiceInput,
  UpdateServiceInput,
  SERVICE_DURATION_LIMITS,
  SERVICE_PRICE_LIMITS,
} from '@project-nirvana/shared';
import { RedisCacheService } from '../availability/services/redis-cache.service';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly redisCacheService: RedisCacheService) {}

  /**
   * Helper to verify provider profile exists and belongs to the authenticated user
   */
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

  /**
   * Validate price floor/ceiling and duration constraints
   */
  private validateServiceConstraints(durationMin?: number, priceAmount?: number) {
    if (durationMin !== undefined) {
      if (
        durationMin < SERVICE_DURATION_LIMITS.MIN_MINUTES ||
        durationMin > SERVICE_DURATION_LIMITS.MAX_MINUTES
      ) {
        throw new BadRequestException(
          `Service duration must be between ${SERVICE_DURATION_LIMITS.MIN_MINUTES} and ${SERVICE_DURATION_LIMITS.MAX_MINUTES} minutes.`,
        );
      }
    }

    if (priceAmount !== undefined) {
      if (
        priceAmount < SERVICE_PRICE_LIMITS.MIN_PAISE ||
        priceAmount > SERVICE_PRICE_LIMITS.MAX_PAISE
      ) {
        throw new BadRequestException(
          `Service price must be between ₹${SERVICE_PRICE_LIMITS.MIN_PAISE / 100} and ₹${SERVICE_PRICE_LIMITS.MAX_PAISE / 100}.`,
        );
      }
    }
  }

  /**
   * Validate license requirements if the category requires it
   */
  private async validateCategoryLicensing(providerId: string, categoryId: string) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found.`);
    }

    if (category.requiresLicense) {
      const verifiedLicense = await prisma.credential.findFirst({
        where: {
          providerId,
          status: CredentialStatus.VERIFIED,
          type: { in: ['LICENSE', 'CERTIFICATION', 'DEGREE'] },
        },
      });

      if (!verifiedLicense) {
        throw new ForbiddenException(
          `The modality "${category.name}" requires a verified professional license before services can be published. Please submit your credential in Onboarding for verification.`,
        );
      }
    }
  }

  /**
   * Create a new service offering
   */
  async createService(userId: string, input: CreateServiceInput): Promise<Service> {
    const provider = await this.getProviderProfileOrThrow(userId);

    this.validateServiceConstraints(input.durationMin, input.priceAmount);
    await this.validateCategoryLicensing(provider.id, input.categoryId);

    const service = await prisma.service.create({
      data: {
        providerId: provider.id,
        categoryId: input.categoryId,
        title: input.title,
        description: input.description,
        durationMin: input.durationMin,
        priceAmount: input.priceAmount,
        currency: input.currency,
        mode: input.mode,
        isGroup: input.isGroup,
        maxParticipants: input.maxParticipants,
        cancellationPolicy: input.cancellationPolicy,
        isActive: true,
      },
    });

    // Invalidate slot cache for this provider
    await this.redisCacheService.invalidateProviderSlots(provider.id);

    return service;
  }

  /**
   * List all services for the provider (both active and inactive)
   */
  async getProviderServices(userId: string): Promise<Service[]> {
    const provider = await this.getProviderProfileOrThrow(userId);

    return prisma.service.findMany({
      where: { providerId: provider.id },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get single service by ID
   */
  async getServiceById(userId: string, serviceId: string): Promise<Service> {
    const provider = await this.getProviderProfileOrThrow(userId);

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        providerId: provider.id,
      },
      include: {
        category: true,
      },
    });

    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found.`);
    }

    return service;
  }

  /**
   * Update service offering
   */
  async updateService(
    userId: string,
    serviceId: string,
    input: UpdateServiceInput,
  ): Promise<Service> {
    const provider = await this.getProviderProfileOrThrow(userId);

    const existing = await prisma.service.findFirst({
      where: { id: serviceId, providerId: provider.id },
    });

    if (!existing) {
      throw new NotFoundException(`Service ${serviceId} not found.`);
    }

    this.validateServiceConstraints(input.durationMin, input.priceAmount);

    if (input.categoryId && input.categoryId !== existing.categoryId) {
      await this.validateCategoryLicensing(provider.id, input.categoryId);
    }

    const updated = await prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.durationMin !== undefined && { durationMin: input.durationMin }),
        ...(input.priceAmount !== undefined && { priceAmount: input.priceAmount }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.mode !== undefined && { mode: input.mode }),
        ...(input.isGroup !== undefined && { isGroup: input.isGroup }),
        ...(input.maxParticipants !== undefined && { maxParticipants: input.maxParticipants }),
        ...(input.cancellationPolicy !== undefined && {
          cancellationPolicy: input.cancellationPolicy,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    // Invalidate slot cache for this provider
    await this.redisCacheService.invalidateProviderSlots(provider.id);

    return updated;
  }

  /**
   * Delete or soft-deactivate service.
   * CRITICAL REQUIREMENT: Soft-deactivate rather than delete when bookings exist.
   */
  async deleteService(
    userId: string,
    serviceId: string,
  ): Promise<{ deleted: boolean; softDeactivated: boolean; message: string }> {
    const provider = await this.getProviderProfileOrThrow(userId);

    const service = await prisma.service.findFirst({
      where: { id: serviceId, providerId: provider.id },
    });

    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found.`);
    }

    const bookingCount = await prisma.booking.count({
      where: { serviceId },
    });

    if (bookingCount > 0) {
      // Soft-deactivate
      await prisma.service.update({
        where: { id: serviceId },
        data: { isActive: false },
      });

      await this.redisCacheService.invalidateProviderSlots(provider.id);

      return {
        deleted: false,
        softDeactivated: true,
        message: `Service has ${bookingCount} existing booking(s). It has been deactivated to preserve booking history and financial ledger integrity.`,
      };
    }

    // Hard-delete if no bookings ever made
    await prisma.service.delete({
      where: { id: serviceId },
    });

    await this.redisCacheService.invalidateProviderSlots(provider.id);

    return {
      deleted: true,
      softDeactivated: false,
      message: 'Service permanently deleted.',
    };
  }
}
