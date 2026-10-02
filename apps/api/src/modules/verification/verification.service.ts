import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import {
  prisma,
  ApprovalStatus,
  CredentialStatus,
  VerificationTier,
  ProviderProfile,
} from '@project-nirvana/db';
import {
  AdminApproveProviderInput,
  AdminRejectProviderInput,
  AdminRequestInfoInput,
  AdminReviewCredentialInput,
  AdminSetTierInput,
} from '@project-nirvana/shared';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * List pending or filtered verification queue applications
   */
  async listQueue(status?: ApprovalStatus) {
    const filterStatus = status || ApprovalStatus.PENDING;

    const applications = await prisma.providerProfile.findMany({
      where: { approvalStatus: filterStatus },
      include: {
        user: {
          select: { id: true, email: true, phone: true, createdAt: true },
        },
        categories: {
          include: { category: true },
        },
        credentials: true,
        services: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return applications.map((app) => ({
      id: app.id,
      userId: app.userId,
      user: app.user,
      displayName: app.displayName,
      slug: app.slug,
      headline: app.headline,
      bio: app.bio,
      avatarUrl: app.avatarUrl,
      introVideoUrl: app.introVideoUrl,
      yearsExperience: app.yearsExperience,
      city: app.city,
      country: app.country,
      approvalStatus: app.approvalStatus,
      verificationTier: app.verificationTier,
      rejectionReason: app.rejectionReason,
      payoutAccountId: app.payoutAccountId,
      kycStatus: app.kycStatus,
      categories: app.categories.map((c) => ({
        id: c.category.id,
        name: c.category.name,
        slug: c.category.slug,
        isPrimary: c.isPrimary,
        requiresLicense: c.category.requiresLicense,
      })),
      credentialsCount: app.credentials.length,
      verifiedCredentialsCount: app.credentials.filter(
        (c) => c.status === CredentialStatus.VERIFIED,
      ).length,
      servicesCount: app.services.length,
      updatedAt: app.updatedAt,
      createdAt: app.createdAt,
    }));
  }

  /**
   * Returns complete verification dossier including presigned document download URLs for reviewer
   */
  async getDossier(providerId: string) {
    const profile = await prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        },
        categories: { include: { category: true } },
        credentials: true,
        services: { include: { category: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException(`Provider profile ${providerId} not found.`);
    }

    // Attach signed download URLs for all uploaded credentials so admin can view them securely
    const credentialsWithSignedUrls = await Promise.all(
      profile.credentials.map(async (c) => {
        let downloadUrl = '';
        try {
          downloadUrl = await this.storageService.generatePresignedDownloadUrl(c.documentUrl);
        } catch {
          downloadUrl = c.documentUrl;
        }
        return {
          ...c,
          downloadUrl,
        };
      }),
    );

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
        city: profile.city,
        country: profile.country,
        approvalStatus: profile.approvalStatus,
        verificationTier: profile.verificationTier,
        rejectionReason: profile.rejectionReason,
        payoutAccountId: profile.payoutAccountId,
        kycStatus: profile.kycStatus,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      user: profile.user,
      categories: profile.categories.map((c) => ({
        id: c.category.id,
        name: c.category.name,
        slug: c.category.slug,
        isPrimary: c.isPrimary,
        requiresLicense: c.category.requiresLicense,
      })),
      credentials: credentialsWithSignedUrls,
      services: profile.services,
    };
  }

  /**
   * Approve provider application: sets status APPROVED, assigns tier, records audit, sends notification
   */
  async approveProvider(
    adminId: string,
    providerId: string,
    input: AdminApproveProviderInput,
    ip?: string,
    userAgent?: string,
  ): Promise<ProviderProfile> {
    const profile = await prisma.providerProfile.findUnique({
      where: { id: providerId },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');

    const updated = await prisma.providerProfile.update({
      where: { id: providerId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        verificationTier:
          (input.verificationTier as VerificationTier) || VerificationTier.CREDENTIAL_VERIFIED,
        rejectionReason: null,
      },
    });

    await this.auditService.record({
      userId: adminId,
      action: 'PROVIDER_VERIFICATION_APPROVED',
      entityType: 'ProviderProfile',
      entityId: providerId,
      ipAddress: ip,
      userAgent,
      metadata: {
        adminId,
        tier: updated.verificationTier,
        adminNotes: input.adminNotes,
      },
    });

    await this.notificationService.send({
      userId: profile.userId,
      type: 'VERIFICATION_APPROVED',
      title: 'Sanctuary Verification Approved! 🌟',
      body: `Congratulations! Your practitioner profile has been approved with tier "${updated.verificationTier}". Your sanctuary storefront and live services are now publicly visible.`,
      data: { providerId, tier: updated.verificationTier },
    });

    this.logger.log(
      `Admin ${adminId} approved provider ${providerId} (Tier: ${updated.verificationTier})`,
    );

    return updated;
  }

  /**
   * Reject provider application: sets status REJECTED, stores reason, records audit, sends notification
   */
  async rejectProvider(
    adminId: string,
    providerId: string,
    input: AdminRejectProviderInput,
    ip?: string,
    userAgent?: string,
  ): Promise<ProviderProfile> {
    const profile = await prisma.providerProfile.findUnique({
      where: { id: providerId },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');

    const updated = await prisma.providerProfile.update({
      where: { id: providerId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: input.reason,
      },
    });

    await this.auditService.record({
      userId: adminId,
      action: 'PROVIDER_VERIFICATION_REJECTED',
      entityType: 'ProviderProfile',
      entityId: providerId,
      ipAddress: ip,
      userAgent,
      metadata: {
        adminId,
        reason: input.reason,
      },
    });

    await this.notificationService.send({
      userId: profile.userId,
      type: 'VERIFICATION_REJECTED',
      title: 'Practitioner Application Notice',
      body: `Your practitioner profile could not be approved at this time. Feedback from our medical review team: "${input.reason}"`,
      data: { providerId, reason: input.reason },
    });

    this.logger.log(`Admin ${adminId} rejected provider ${providerId}: ${input.reason}`);

    return updated;
  }

  /**
   * Request more info: transitions status back to DRAFT with guidance message
   */
  async requestMoreInfo(
    adminId: string,
    providerId: string,
    input: AdminRequestInfoInput,
    ip?: string,
    userAgent?: string,
  ): Promise<ProviderProfile> {
    const profile = await prisma.providerProfile.findUnique({
      where: { id: providerId },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');

    const updated = await prisma.providerProfile.update({
      where: { id: providerId },
      data: {
        approvalStatus: ApprovalStatus.DRAFT,
        rejectionReason: input.message,
      },
    });

    await this.auditService.record({
      userId: adminId,
      action: 'PROVIDER_VERIFICATION_INFO_REQUESTED',
      entityType: 'ProviderProfile',
      entityId: providerId,
      ipAddress: ip,
      userAgent,
      metadata: {
        adminId,
        message: input.message,
      },
    });

    await this.notificationService.send({
      userId: profile.userId,
      type: 'VERIFICATION_INFO_REQUESTED',
      title: 'Action Required: Additional Information Needed',
      body: `Please update your practitioner application: "${input.message}". Once adjusted, you may resubmit your profile.`,
      data: { providerId, message: input.message },
    });

    this.logger.log(`Admin ${adminId} requested more info from provider ${providerId}`);

    return updated;
  }

  /**
   * Review an individual credential (VERIFIED or REJECTED)
   */
  async reviewCredential(
    adminId: string,
    credentialId: string,
    input: AdminReviewCredentialInput,
    ip?: string,
    userAgent?: string,
  ) {
    const cred = await prisma.credential.findUnique({
      where: { id: credentialId },
      include: { provider: true },
    });
    if (!cred) throw new NotFoundException('Credential record not found');

    const updated = await prisma.credential.update({
      where: { id: credentialId },
      data: {
        status: input.status as CredentialStatus,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.auditService.record({
      userId: adminId,
      action: `CREDENTIAL_${input.status}`,
      entityType: 'Credential',
      entityId: credentialId,
      ipAddress: ip,
      userAgent,
      metadata: {
        adminId,
        providerId: cred.providerId,
        title: cred.title,
        status: input.status,
        notes: input.notes,
      },
    });

    return updated;
  }

  /**
   * Set verification tier directly
   */
  async setTier(
    adminId: string,
    providerId: string,
    input: AdminSetTierInput,
    ip?: string,
    userAgent?: string,
  ): Promise<ProviderProfile> {
    const updated = await prisma.providerProfile.update({
      where: { id: providerId },
      data: {
        verificationTier: input.verificationTier as VerificationTier,
      },
    });

    await this.auditService.record({
      userId: adminId,
      action: 'PROVIDER_TIER_UPDATED',
      entityType: 'ProviderProfile',
      entityId: providerId,
      ipAddress: ip,
      userAgent,
      metadata: {
        adminId,
        tier: input.verificationTier,
      },
    });

    return updated;
  }
}
