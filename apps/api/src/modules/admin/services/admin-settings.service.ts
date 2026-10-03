import { Injectable } from '@nestjs/common';
import { prisma } from '@project-nirvana/db';
import { AdminSettings } from '@project-nirvana/shared';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/policies/policy.service';

const DEFAULT_SETTINGS: AdminSettings = {
  featureFlags: {
    dailyVideoEnabled: true,
    antiLeakageStrict: true,
    escrowAutoRelease: true,
    newPractitionerApplications: true,
    audioOnlyFallback: true,
  },
  platformFeeBps: 1500, // 15%
  escrowHoldHours: 24,
  cancellationDefaults: {
    flexibleNoticeHours: 24,
    moderateNoticeHours: 48,
    strictNoticeHours: 72,
  },
  disclaimers: {
    healthDataNotice:
      'Project Nirvana connects seekers with authentic wellness wisdom. Guidance provided does not constitute registered clinical diagnosis.',
    emergencyCrisisNotice:
      'For acute emotional or psychiatric crisis, please call emergency services (112) or the Vandrevala Foundation (9999 666 555).',
  },
  reason: 'Default platform initialization',
};

@Injectable()
export class AdminSettingsService {
  constructor(private readonly auditService: AuditService) {}

  async getSettings(): Promise<AdminSettings> {
    const settingRecord = await prisma.platformSetting.findUnique({
      where: { key: 'global_config' },
    });

    if (!settingRecord) {
      return DEFAULT_SETTINGS;
    }

    return settingRecord.value as unknown as AdminSettings;
  }

  async updateSettings(
    adminUser: AuthenticatedUser,
    dto: AdminSettings,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const existing = await prisma.platformSetting.findUnique({
      where: { key: 'global_config' },
    });

    const beforeState = existing ? existing.value : DEFAULT_SETTINGS;

    const updated = await prisma.platformSetting.upsert({
      where: { key: 'global_config' },
      create: {
        key: 'global_config',
        value: dto as any,
        description: 'Global system configuration',
        updatedBy: adminUser.email,
      },
      update: {
        value: dto as any,
        updatedBy: adminUser.email,
      },
    });

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_PLATFORM_SETTINGS_UPDATED',
      entityType: 'PlatformSetting',
      entityId: 'global_config',
      reason: dto.reason,
      beforeState: beforeState as any,
      afterState: updated.value as any,
      ipAddress,
      userAgent,
      metadata: { adminEmail: adminUser.email },
    });

    return {
      success: true,
      message: 'Platform settings updated successfully',
      settings: updated.value,
    };
  }
}
