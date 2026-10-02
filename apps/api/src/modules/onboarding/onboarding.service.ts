import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import {
  prisma,
  ApprovalStatus,
  CredentialStatus,
  UserRole,
  ProviderProfile,
  Category,
  ProviderCategory,
  Credential,
  Service,
} from '@project-nirvana/db';
import {
  OnboardingStep1BasicInfoInput,
  OnboardingStep2CategoriesInput,
  PresignCredentialUploadInput,
  CreateCredentialInput,
  OnboardingStep4MediaAndServiceInput,
  OnboardingStep5PayoutInput,
  OnboardingStep6SubmitInput,
} from '@project-nirvana/shared';
import { StorageService } from '../storage/storage.service';
import { VIRUS_SCANNER, VirusScanner } from '../storage/virus-scanner.interface';
import {
  RazorpayRouteService,
  RazorpayLinkedAccountResult,
} from '../payout/razorpay-route.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';

export type FullProviderProfile = ProviderProfile & {
  categories: (ProviderCategory & { category: Category })[];
  credentials: Credential[];
  services: Service[];
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly storageService: StorageService,
    @Inject(VIRUS_SCANNER) private readonly virusScanner: VirusScanner,
    private readonly razorpayRouteService: RazorpayRouteService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Helper to ensure provider profile exists for the user
   */
  async getOrCreateProfile(userId: string): Promise<FullProviderProfile> {
    let profile = await prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        categories: { include: { category: true } },
        credentials: true,
        services: true,
      },
    });

    if (!profile) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      const name = user.email.split('@')[0];
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

      profile = await prisma.providerProfile.create({
        data: {
          userId,
          displayName: name,
          slug: uniqueSlug,
          headline: 'Holistic Practitioner',
          bio: 'Welcome to my sanctuary profile. I offer transformative live sessions.',
          city: 'Mumbai',
          country: 'IN',
          approvalStatus: ApprovalStatus.DRAFT,
          onboardingStep: 1,
        },
        include: {
          categories: { include: { category: true } },
          credentials: true,
          services: true,
        },
      });
    }

    return profile;
  }

  /**
   * Returns current onboarding state and progress
   */
  async getOnboardingState(userId: string) {
    const profile = await this.getOrCreateProfile(userId);

    const categoriesWithLicense = profile.categories.map((pc) => ({
      id: pc.category.id,
      name: pc.category.name,
      slug: pc.category.slug,
      isPrimary: pc.isPrimary,
      requiresLicense: pc.category.requiresLicense,
      commissionBps: pc.category.commissionBps,
    }));

    const sampleService = profile.services[0] || null;

    return {
      profile: {
        id: profile.id,
        userId: profile.userId,
        displayName: profile.displayName,
        slug: profile.slug,
        headline: profile.headline,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        introVideoUrl: profile.introVideoUrl,
        languages: profile.languages,
        yearsExperience: profile.yearsExperience,
        country: profile.country,
        city: profile.city,
        approvalStatus: profile.approvalStatus,
        rejectionReason: profile.rejectionReason,
        verificationTier: profile.verificationTier,
        onboardingStep: profile.onboardingStep,
        payoutAccountId: profile.payoutAccountId,
        kycStatus: profile.kycStatus,
      },
      categories: categoriesWithLicense,
      credentials: profile.credentials,
      sampleService,
    };
  }

  /**
   * Step 1: Basic Info (Display name, headline, bio, languages, location, photo)
   */
  async saveStep1(userId: string, input: OnboardingStep1BasicInfoInput): Promise<ProviderProfile> {
    const profile = await this.getOrCreateProfile(userId);

    const updated = await prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        displayName: input.displayName,
        headline: input.headline,
        bio: input.bio,
        languages: input.languages,
        country: input.country,
        city: input.city,
        yearsExperience: input.yearsExperience,
        avatarUrl: input.avatarUrl || null,
        onboardingStep: Math.max(profile.onboardingStep, 2),
      },
    });

    return updated;
  }

  /**
   * Step 2: Categories and Specialties
   */
  async saveStep2(userId: string, input: OnboardingStep2CategoriesInput) {
    const profile = await this.getOrCreateProfile(userId);

    // Verify all categories exist
    const categories = await prisma.category.findMany({
      where: { id: { in: input.categoryIds } },
    });

    if (categories.length !== input.categoryIds.length) {
      throw new BadRequestException('One or more selected categories do not exist.');
    }

    if (!input.categoryIds.includes(input.primaryCategoryId)) {
      throw new BadRequestException('Primary category must be included in selected categories.');
    }

    // Atomic update of provider categories
    await prisma.$transaction([
      prisma.providerCategory.deleteMany({
        where: { providerId: profile.id },
      }),
      prisma.providerCategory.createMany({
        data: input.categoryIds.map((catId) => ({
          providerId: profile.id,
          categoryId: catId,
          isPrimary: catId === input.primaryCategoryId,
        })),
      }),
      prisma.providerProfile.update({
        where: { id: profile.id },
        data: {
          onboardingStep: Math.max(profile.onboardingStep, 3),
        },
      }),
    ]);

    const licenseRequiredCategories = categories.filter((c) => c.requiresLicense);

    return {
      success: true,
      selectedCategories: categories,
      licenseRequiredCategories,
      requiresLicenseWarning: licenseRequiredCategories.length > 0,
    };
  }

  /**
   * Step 3: Presign upload URL for credentials
   */
  async presignCredential(userId: string, input: PresignCredentialUploadInput) {
    const profile = await this.getOrCreateProfile(userId);

    const presigned = await this.storageService.generatePresignedUploadUrl({
      folder: 'credentials',
      ownerId: profile.id,
      filename: input.filename,
      contentType: input.contentType,
      maxSizeBytes: input.fileSizeBytes,
      expiresInSeconds: 900,
    });

    return {
      uploadUrl: presigned.uploadUrl,
      documentUrl: presigned.fileKey,
      expiresAt: presigned.expiresAt,
    };
  }

  /**
   * Step 3: Register uploaded credential with virus scanner check
   */
  async createCredential(userId: string, input: CreateCredentialInput) {
    const profile = await this.getOrCreateProfile(userId);

    // Run virus scan hook
    const scanResult = await this.virusScanner.scanFile(input.documentUrl);
    if (!scanResult.isClean) {
      throw new BadRequestException(
        `Uploaded file failed security scan: ${scanResult.threatName || 'Suspicious payload'}`,
      );
    }

    const credential = await prisma.credential.create({
      data: {
        providerId: profile.id,
        type: input.type,
        title: input.title,
        issuer: input.issuer,
        documentUrl: input.documentUrl,
        status: CredentialStatus.PENDING,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    await prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        onboardingStep: Math.max(profile.onboardingStep, 4),
      },
    });

    return credential;
  }

  /**
   * Step 3: Delete credential
   */
  async deleteCredential(userId: string, credentialId: string) {
    const profile = await this.getOrCreateProfile(userId);

    const cred = await prisma.credential.findUnique({
      where: { id: credentialId },
    });

    if (!cred || cred.providerId !== profile.id) {
      throw new NotFoundException('Credential not found or not owned by you.');
    }

    await prisma.credential.delete({ where: { id: credentialId } });
    return { success: true };
  }

  /**
   * Step 3: Authorized download URL for credential document
   * CRITICAL SECURITY RULE: Only owner provider or ADMIN can generate this URL
   */
  async getCredentialDownloadUrl(userId: string, userRole: string, credentialId: string) {
    const credential = await prisma.credential.findUnique({
      where: { id: credentialId },
      include: { provider: true },
    });

    if (!credential) {
      throw new NotFoundException('Credential document not found');
    }

    // Authorization check
    const isOwner = credential.provider.userId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Forbidden: You are not authorized to access this private document.',
      );
    }

    const downloadUrl = await this.storageService.generatePresignedDownloadUrl(
      credential.documentUrl,
      900,
    );

    return {
      downloadUrl,
      expiresInSeconds: 900,
    };
  }

  /**
   * Step 4: Intro Video & Sample Service (with Licence-Gating enforcement)
   */
  async saveStep4(
    userId: string,
    input: OnboardingStep4MediaAndServiceInput,
  ): Promise<{ profile: ProviderProfile; service: Service | null }> {
    const profile = await this.getOrCreateProfile(userId);

    let createdOrUpdatedService: Service | null = null;

    if (input.sampleService) {
      const s = input.sampleService;

      // 1. Verify Category Exists
      const category = await prisma.category.findUnique({
        where: { id: s.categoryId },
      });
      if (!category) {
        throw new BadRequestException('Selected category does not exist.');
      }

      // 2. ENFORCE LICENCE-GATING LOGIC IN SERVICE LAYER
      if (category.requiresLicense) {
        const verifiedLicence = await prisma.credential.findFirst({
          where: {
            providerId: profile.id,
            status: CredentialStatus.VERIFIED,
            type: { in: ['LICENSE', 'CERTIFICATION', 'DEGREE'] },
          },
        });

        if (!verifiedLicence) {
          throw new ForbiddenException(
            `Licence Gating Enforcement: Publishing services under "${category.name}" requires a VERIFIED professional licence. Please submit your licence credential in Step 3 and await administrative verification.`,
          );
        }
      }

      // Check if a sample service already exists for this provider
      const existingService = await prisma.service.findFirst({
        where: { providerId: profile.id },
      });

      if (existingService) {
        createdOrUpdatedService = await prisma.service.update({
          where: { id: existingService.id },
          data: {
            title: s.title,
            description: s.description,
            categoryId: s.categoryId,
            durationMin: s.durationMin,
            priceAmount: s.priceAmount,
            mode: s.mode,
            isActive: true,
          },
        });
      } else {
        createdOrUpdatedService = await prisma.service.create({
          data: {
            providerId: profile.id,
            categoryId: s.categoryId,
            title: s.title,
            description: s.description,
            durationMin: s.durationMin,
            priceAmount: s.priceAmount,
            mode: s.mode,
            isActive: true,
          },
        });
      }
    }

    const updatedProfile = await prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        introVideoUrl: input.introVideoUrl || null,
        onboardingStep: Math.max(profile.onboardingStep, 5),
      },
    });

    return {
      profile: updatedProfile,
      service: createdOrUpdatedService,
    };
  }

  /**
   * Step 5: Payout Setup (Razorpay Route)
   */
  async saveStep5(
    userId: string,
    input: OnboardingStep5PayoutInput,
  ): Promise<{ profile: ProviderProfile; payoutAccount: RazorpayLinkedAccountResult }> {
    const profile = await this.getOrCreateProfile(userId);

    const linkedAccount = await this.razorpayRouteService.createLinkedAccount({
      providerId: profile.id,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      ifscCode: input.ifscCode,
      businessType: input.businessType,
      pan: input.pan || undefined,
    });

    const updatedProfile = await prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        payoutAccountId: linkedAccount.accountId,
        kycStatus: linkedAccount.kycStatus,
        onboardingStep: Math.max(profile.onboardingStep, 6),
      },
    });

    return {
      profile: updatedProfile,
      payoutAccount: linkedAccount,
    };
  }

  /**
   * Step 6: Review & Submit for Administrative Verification
   */
  async submitForVerification(
    userId: string,
    input: OnboardingStep6SubmitInput,
    ip?: string,
    userAgent?: string,
  ) {
    if (!input.confirmAccurate) {
      throw new BadRequestException('You must confirm the accuracy of your application.');
    }

    const profile = await this.getOrCreateProfile(userId);

    // Validation checks
    if (!profile.bio || profile.bio.length < 20) {
      throw new BadRequestException('Please complete your profile bio in Step 1.');
    }

    const categoriesCount = await prisma.providerCategory.count({
      where: { providerId: profile.id },
    });
    if (categoriesCount === 0) {
      throw new BadRequestException('Please select at least one healing modality in Step 2.');
    }

    const credentialsCount = await prisma.credential.count({
      where: { providerId: profile.id },
    });
    if (credentialsCount === 0) {
      throw new BadRequestException(
        'Please upload at least one verification credential in Step 3.',
      );
    }

    if (!profile.payoutAccountId) {
      throw new BadRequestException('Please connect your payout bank account in Step 5.');
    }

    // State transition to PENDING
    const updated = await prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        approvalStatus: ApprovalStatus.PENDING,
        rejectionReason: null, // Clear past rejection feedback
      },
    });

    // Write audit log
    await this.auditService.record({
      userId,
      action: 'PROVIDER_ONBOARDING_SUBMITTED',
      entityType: 'ProviderProfile',
      entityId: profile.id,
      ipAddress: ip,
      userAgent,
      metadata: {
        displayName: profile.displayName,
        categoriesCount,
        credentialsCount,
      },
    });

    // Trigger in-app notification
    await this.notificationService.send({
      userId,
      type: 'ONBOARDING_SUBMITTED',
      title: 'Application Submitted for Verification',
      body: 'Your practitioner credentials and sanctuary profile are now under administrative review. We typically process verifications within 24-48 hours.',
      data: { providerId: profile.id },
    });

    this.logger.log(`Provider profile ${profile.id} submitted for review (status: PENDING)`);

    return {
      success: true,
      approvalStatus: updated.approvalStatus,
      message: 'Your practitioner profile has been submitted for verification.',
    };
  }
}
