import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, UserRole, BookingStatus, DisputeStatus, PayoutStatus } from '@project-nirvana/db';
import { AdminUsersService } from './admin-users.service';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminDisputesService } from './admin-disputes.service';
import { AdminPaymentsService } from './admin-payments.service';
import { AdminPermissionsGuard } from '../guards/admin-permissions.guard';
import { Reflector } from '@nestjs/core';

describe('Admin Services and Trust Controls', () => {
  let mockAuditService: { record: jest.Mock };
  let mockEncryptionService: { encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(() => {
    mockAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    mockEncryptionService = {
      encrypt: jest.fn().mockReturnValue({ ciphertext: 'c', iv: 'i', authTag: 'a', keyVersion: 1 }),
      decrypt: jest.fn().mockReturnValue('Decrypted test message content'),
    };
    jest.clearAllMocks();
  });

  describe('AdminPermissionsGuard', () => {
    it('should allow access when user is ADMIN and has required permission', async () => {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['FINANCE']);
      const guard = new AdminPermissionsGuard(reflector);

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'admin-1',
        adminPermissions: ['FINANCE'],
      } as any);

      const mockContext: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'admin-1', role: UserRole.ADMIN, email: 'admin@nirvana.test' },
          }),
        }),
      };

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should allow SUPER_ADMIN access to any permission protected route', async () => {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['FINANCE']);
      const guard = new AdminPermissionsGuard(reflector);

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'admin-super',
        adminPermissions: ['SUPER_ADMIN'],
      } as any);

      const mockContext: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'admin-super', role: UserRole.ADMIN, email: 'super@nirvana.test' },
          }),
        }),
      };

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should reject non-ADMIN role even if permissions exist', async () => {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SUPPORT']);
      const guard = new AdminPermissionsGuard(reflector);

      const mockContext: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-1', role: UserRole.CONSUMER, email: 'user@nirvana.test' },
          }),
        }),
      };

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });

    it('should reject when admin lacks required granular permission', async () => {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['FINANCE']);
      const guard = new AdminPermissionsGuard(reflector);

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'admin-support',
        adminPermissions: ['SUPPORT'],
      } as any);

      const mockContext: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'admin-support', role: UserRole.ADMIN, email: 'support@nirvana.test' },
          }),
        }),
      };

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('AdminUsersService', () => {
    it('should suspend user and record audit log with before/after state and reason', async () => {
      const service = new AdminUsersService(mockAuditService as any);

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'target-1',
        email: 'badactor@nirvana.test',
        role: UserRole.PROVIDER,
        status: 'ACTIVE',
        providerProfile: { id: 'p-1', approvalStatus: 'APPROVED' },
      } as any);

      jest.spyOn(prisma, '$transaction').mockResolvedValue([
        { id: 'target-1', status: 'SUSPENDED' },
        { id: 'p-1', approvalStatus: 'SUSPENDED' },
      ] as any);

      const res = await service.updateUserStatus(
        { id: 'admin-1', email: 'admin@nirvana.test', role: UserRole.ADMIN, timeZone: 'UTC' },
        'target-1',
        { status: 'SUSPENDED', reason: 'Unethical practices reported by 3 seekers' },
      );

      expect(res.success).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'ADMIN_USER_SUSPENDED',
          entityType: 'User',
          entityId: 'target-1',
          reason: 'Unethical practices reported by 3 seekers',
          beforeState: { status: 'ACTIVE', approvalStatus: 'APPROVED' },
          afterState: { status: 'SUSPENDED', approvalStatus: 'SUSPENDED' },
        }),
      );
    });

    it('should reject self-suspension by administrator', async () => {
      const service = new AdminUsersService(mockAuditService as any);

      await expect(
        service.updateUserStatus(
          { id: 'admin-1', email: 'admin@nirvana.test', role: UserRole.ADMIN, timeZone: 'UTC' },
          'admin-1',
          { status: 'SUSPENDED', reason: 'Attempt self suspend' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('AdminDisputesService - Chat Log Access & Auditing', () => {
    it('should audit-log chat log access with mandatory recorded reason before decrypting', async () => {
      const service = new AdminDisputesService(
        mockAuditService as any,
        mockEncryptionService as any,
      );

      jest.spyOn(prisma.dispute, 'findUnique').mockResolvedValue({
        id: 'disp-1',
        bookingId: 'book-1',
        booking: {
          consumerId: 'c-1',
          provider: { userId: 'p-user-1' },
        },
      } as any);

      jest.spyOn(prisma.conversation, 'findFirst').mockResolvedValue({
        id: 'conv-1',
      } as any);

      jest.spyOn(prisma.message, 'findMany').mockResolvedValue([
        {
          id: 'msg-1',
          senderId: 'c-1',
          sender: { id: 'c-1', email: 'seeker@test.com', role: UserRole.CONSUMER },
          ciphertext: 'cipher',
          iv: 'iv',
          authTag: 'tag',
          keyVersion: 1,
          createdAt: new Date(),
        },
      ] as any);

      const result = await service.accessDisputeChatLogs(
        { id: 'admin-1', email: 'admin@nirvana.test', role: UserRole.ADMIN, timeZone: 'UTC' },
        'disp-1',
        { reason: 'Investigating claims of verbal harassment during scheduled session' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'ADMIN_DISPUTE_CHAT_LOGS_ACCESSED',
          entityType: 'Dispute',
          entityId: 'disp-1',
          reason: 'Investigating claims of verbal harassment during scheduled session',
        }),
      );

      expect(mockEncryptionService.decrypt).toHaveBeenCalled();
      expect(result.messages[0].content).toBe('Decrypted test message content');
    });

    it('should resolve dispute with full refund, adjust ledger, and audit log', async () => {
      const service = new AdminDisputesService(
        mockAuditService as any,
        mockEncryptionService as any,
      );

      jest.spyOn(prisma.dispute, 'findUnique').mockResolvedValue({
        id: 'disp-1',
        status: DisputeStatus.OPEN,
        bookingId: 'book-1',
        booking: {
          id: 'book-1',
          priceSnapshot: 500000,
          providerId: 'p-1',
          payments: [{ status: 'CAPTURED' }],
        },
      } as any);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb({
            booking: { update: jest.fn() },
            ledgerEntry: { createMany: jest.fn() },
            providerProfile: { update: jest.fn() },
            dispute: { update: jest.fn() },
          });
        }
        return Promise.all(cb);
      });

      const res = await service.resolveDispute(
        { id: 'admin-1', email: 'admin@nirvana.test', role: UserRole.ADMIN, timeZone: 'UTC' },
        'disp-1',
        {
          action: 'REFUND_FULL',
          reason: 'Practitioner did not attend session as verified by Daily room logs',
          strikePenalty: true,
        },
      );

      expect(res.success).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADMIN_DISPUTE_RESOLVED',
          entityId: 'disp-1',
          reason: 'Practitioner did not attend session as verified by Daily room logs',
        }),
      );
    });
  });

  describe('AdminBookingsService', () => {
    it('should force complete a booking, release escrow to provider payable, and record audit log', async () => {
      const service = new AdminBookingsService(mockAuditService as any);

      jest.spyOn(prisma.booking, 'findUnique').mockResolvedValue({
        id: 'book-1',
        status: BookingStatus.CONFIRMED,
        priceSnapshot: 400000,
        commissionBps: 1500,
        providerId: 'p-1',
        payments: [{ status: 'CAPTURED' }],
      } as any);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb({
            booking: { update: jest.fn() },
            providerProfile: { update: jest.fn() },
            ledgerEntry: { createMany: jest.fn() },
          });
        }
        return Promise.all(cb);
      });

      const res = await service.forceCompleteBooking(
        { id: 'admin-1', email: 'admin@nirvana.test', role: UserRole.ADMIN, timeZone: 'UTC' },
        'book-1',
        { reason: 'Confirmed offline session finished per client feedback', releaseEscrow: true },
      );

      expect(res.success).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADMIN_BOOKING_FORCE_COMPLETED',
          entityId: 'book-1',
          reason: 'Confirmed offline session finished per client feedback',
        }),
      );
    });
  });

  describe('AdminPaymentsService - Reconciliation', () => {
    it('should compute financial reconciliation balances and identify discrepancies', async () => {
      const service = new AdminPaymentsService(mockAuditService as any);

      jest.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
        _sum: { amount: 1000000 },
      } as any);

      jest.spyOn(prisma.ledgerEntry, 'groupBy').mockResolvedValue([
        { accountType: 'PLATFORM_ESCROW', entryType: 'CREDIT', _sum: { amount: 800000 } },
        { accountType: 'PLATFORM_REVENUE', entryType: 'CREDIT', _sum: { amount: 150000 } },
        { accountType: 'PROVIDER_PAYABLE', entryType: 'CREDIT', _sum: { amount: 50000 } },
      ] as any);

      jest.spyOn(prisma.payout, 'aggregate').mockResolvedValue({
        _sum: { amount: 0 },
      } as any);

      jest.spyOn(prisma.payout, 'count').mockResolvedValue(0);

      const report = await service.getReconciliationReport();
      expect(report.gatewayCapturedPaise).toBe(1000000);
      expect(report.ledgerEscrowBalancePaise).toBe(800000);
      expect(report.isReconciled).toBe(true);
      expect(report.discrepancies.length).toBe(0);
    });
  });
});
