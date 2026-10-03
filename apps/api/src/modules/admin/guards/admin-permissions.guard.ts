import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { prisma, UserRole } from '@project-nirvana/db';
import { AdminPermission, hasAdminPermission } from '@project-nirvana/shared';
import { ADMIN_PERMISSIONS_KEY } from '../decorators/admin-permissions.decorator';
import { AuthenticatedUser } from '../../auth/policies/policy.service';

@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<AdminPermission[]>(
      ADMIN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('User context missing');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Forbidden: Administrator role required');
    }

    // If no specific permissions are requested on the route, having ADMIN role is sufficient
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Fetch user's granular permissions from DB
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { adminPermissions: true },
    });

    const userPermissions = (dbUser?.adminPermissions as AdminPermission[]) || [];

    // If an admin has no explicit permissions configured, treat them as full access SUPER_ADMIN
    if (userPermissions.length === 0 || userPermissions.includes('SUPER_ADMIN')) {
      return true;
    }

    const hasAnyRequired = requiredPermissions.some((perm) =>
      hasAdminPermission(userPermissions, perm),
    );

    if (!hasAnyRequired) {
      throw new ForbiddenException(
        `Forbidden: Requires one of [${requiredPermissions.join(', ')}] permissions. Current: [${userPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
