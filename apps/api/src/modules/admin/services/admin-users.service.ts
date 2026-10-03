import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma, UserStatus, UserRole, ApprovalStatus } from '@project-nirvana/db';
import {
  AdminUserQuery,
  AdminUserStatusUpdate,
  AdminUserListItem,
  AdminPermission,
} from '@project-nirvana/shared';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/policies/policy.service';

@Injectable()
export class AdminUsersService {
  constructor(private readonly auditService: AuditService) {}

  async listUsers(query: AdminUserQuery) {
    const {
      search,
      role,
      status,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      exportCsv,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role as UserRole;
    }

    if (status) {
      where.status = status as UserStatus;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { providerProfile: { displayName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (exportCsv) {
      const allUsers = await prisma.user.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        include: {
          providerProfile: {
            select: {
              displayName: true,
              verificationTier: true,
              approvalStatus: true,
            },
          },
          _count: {
            select: {
              consumerBookings: true,
              providerBookings: true,
            },
          },
        },
      });

      const header =
        'ID,Email,Phone,Role,Status,DisplayName,Tier,Approval,BookingsCount,CreatedAt\n';
      const rows = allUsers
        .map((u) => {
          const name = u.providerProfile?.displayName ? `"${u.providerProfile.displayName}"` : '';
          const tier = u.providerProfile?.verificationTier || '';
          const approval = u.providerProfile?.approvalStatus || '';
          const count =
            u.role === 'PROVIDER' ? u._count.providerBookings : u._count.consumerBookings;
          return `${u.id},"${u.email}","${u.phone || ''}",${u.role},${u.status},${name},${tier},${approval},${count},${u.createdAt.toISOString()}`;
        })
        .join('\n');

      return { csv: header + rows, filename: `users-export-${Date.now()}.csv` };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          providerProfile: {
            select: {
              id: true,
              displayName: true,
              slug: true,
              approvalStatus: true,
              verificationTier: true,
              ratingAvg: true,
              ratingCount: true,
              isFeatured: true,
            },
          },
          _count: {
            select: {
              consumerBookings: true,
              providerBookings: true,
            },
          },
        },
      }),
    ]);

    const formattedUsers: AdminUserListItem[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      adminPermissions: (u.adminPermissions as AdminPermission[]) || [],
      createdAt: u.createdAt.toISOString(),
      providerProfile: u.providerProfile
        ? {
            id: u.providerProfile.id,
            displayName: u.providerProfile.displayName,
            slug: u.providerProfile.slug,
            approvalStatus: u.providerProfile.approvalStatus,
            verificationTier: u.providerProfile.verificationTier,
            ratingAvg: Number(u.providerProfile.ratingAvg),
            ratingCount: u.providerProfile.ratingCount,
            isFeatured: u.providerProfile.isFeatured,
          }
        : null,
      bookingsCount: u.role === 'PROVIDER' ? u._count.providerBookings : u._count.consumerBookings,
    }));

    return {
      users: formattedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUserStatus(
    adminUser: AuthenticatedUser,
    userId: string,
    dto: AdminUserStatusUpdate,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (adminUser.id === userId && dto.status === 'SUSPENDED') {
      throw new BadRequestException('Administrators cannot suspend their own account.');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { providerProfile: true },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const beforeState = {
      status: targetUser.status,
      approvalStatus: targetUser.providerProfile?.approvalStatus,
    };

    const newApprovalStatus =
      dto.status === 'SUSPENDED'
        ? ApprovalStatus.SUSPENDED
        : targetUser.providerProfile?.approvalStatus === ApprovalStatus.SUSPENDED
          ? ApprovalStatus.APPROVED
          : targetUser.providerProfile?.approvalStatus;

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: dto.status as UserStatus },
      }),
      ...(targetUser.providerProfile && newApprovalStatus
        ? [
            prisma.providerProfile.update({
              where: { id: targetUser.providerProfile.id },
              data: { approvalStatus: newApprovalStatus },
            }),
          ]
        : []),
    ]);

    const afterState = {
      status: updatedUser.status,
      approvalStatus: newApprovalStatus,
    };

    await this.auditService.record({
      userId: adminUser.id,
      action: dto.status === 'SUSPENDED' ? 'ADMIN_USER_SUSPENDED' : 'ADMIN_USER_REINSTATED',
      entityType: 'User',
      entityId: userId,
      reason: dto.reason,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
      metadata: { targetEmail: targetUser.email, targetRole: targetUser.role },
    });

    return {
      success: true,
      message: `User status changed to ${dto.status}`,
      user: { id: updatedUser.id, status: updatedUser.status },
    };
  }

  async viewAsUser(
    adminUser: AuthenticatedUser,
    targetUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        providerProfile: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_USER_VIEW_AS_READ_ONLY',
      entityType: 'User',
      entityId: targetUserId,
      reason: 'Administrator read-only impersonation-free inspection',
      ipAddress,
      userAgent,
      metadata: {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        adminEmail: adminUser.email,
      },
    });

    return {
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        status: targetUser.status,
        providerProfile: targetUser.providerProfile
          ? {
              id: targetUser.providerProfile.id,
              displayName: targetUser.providerProfile.displayName,
              slug: targetUser.providerProfile.slug,
              approvalStatus: targetUser.providerProfile.approvalStatus,
              verificationTier: targetUser.providerProfile.verificationTier,
            }
          : null,
      },
      readOnly: true,
      adminInspectorId: adminUser.id,
    };
  }

  async getUserAuditTrail(userId: string) {
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [{ userId }, { entityId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    return logs;
  }
}
