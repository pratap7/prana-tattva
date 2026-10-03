import { Injectable, Logger } from '@nestjs/common';
import { prisma, Prisma } from '@project-nirvana/db';

export interface AuditLogParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async record(params: AuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: params.userId ?? null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
          reason: params.reason ?? null,
          beforeState: params.beforeState ?? Prisma.DbNull,
          afterState: params.afterState ?? Prisma.DbNull,
          metadata: params.metadata ?? Prisma.DbNull,
        },
      });
    } catch (err) {
      // Never crash the primary business transaction if audit logging encounters a database issue
      this.logger.error(`Failed to record audit log for action ${params.action}:`, err);
    }
  }
}
