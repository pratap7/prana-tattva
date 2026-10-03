import { SetMetadata } from '@nestjs/common';
import { AdminPermission } from '@project-nirvana/shared';

export const ADMIN_PERMISSIONS_KEY = 'admin_permissions';
export const RequireAdminPermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);
