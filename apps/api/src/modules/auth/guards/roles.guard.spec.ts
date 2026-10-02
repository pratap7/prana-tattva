import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@project-nirvana/db';
import { AuthenticatedUser } from '../policies/policy.service';

describe('RolesGuard (RBAC Protection)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (user?: Partial<AuthenticatedUser>): ExecutionContext => {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access when no roles are specified on the handler or class', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ role: UserRole.CONSUMER });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should FORBID a CONSUMER from accessing a route protected with @Roles(UserRole.PROVIDER)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.PROVIDER]);

    const context = createMockContext({
      id: 'consumer-123',
      email: 'seeker@example.com',
      role: UserRole.CONSUMER,
      timeZone: 'Asia/Kolkata',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Forbidden resource: Required role [PROVIDER] but user has role [CONSUMER]',
    );
  });

  it('should FORBID a CONSUMER from accessing an ADMIN-only endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    const context = createMockContext({
      id: 'consumer-456',
      email: 'seeker@example.com',
      role: UserRole.CONSUMER,
      timeZone: 'Asia/Kolkata',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Forbidden resource: Required role [ADMIN] but user has role [CONSUMER]',
    );
  });

  it('should FORBID a PROVIDER from accessing an ADMIN-only endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    const context = createMockContext({
      id: 'provider-789',
      email: 'healer@example.com',
      role: UserRole.PROVIDER,
      timeZone: 'Asia/Kolkata',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should ALLOW a PROVIDER to access a @Roles(UserRole.PROVIDER) endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.PROVIDER]);

    const context = createMockContext({
      id: 'provider-789',
      email: 'healer@example.com',
      role: UserRole.PROVIDER,
      timeZone: 'Asia/Kolkata',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should ALLOW an ADMIN to access a multi-role @Roles(PROVIDER, ADMIN) endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.PROVIDER, UserRole.ADMIN]);

    const context = createMockContext({
      id: 'admin-001',
      email: 'admin@projectnirvana.internal',
      role: UserRole.ADMIN,
      timeZone: 'Asia/Kolkata',
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
