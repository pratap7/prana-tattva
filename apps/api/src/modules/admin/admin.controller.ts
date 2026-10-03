import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { UserRole } from '@project-nirvana/db';
import {
  adminUserQuerySchema,
  adminUserStatusUpdateSchema,
  adminBookingQuerySchema,
  adminBookingCancelRefundSchema,
  adminBookingForceCompleteSchema,
  adminDisputesQuerySchema,
  adminDisputeResolutionSchema,
  adminChatLogAccessSchema,
  adminLedgerQuerySchema,
  adminPayoutRetrySchema,
  adminCategoryUpsertSchema,
  adminFeaturedProviderSchema,
  adminReviewModerationActionSchema,
  adminReportActionSchema,
  adminSettingsSchema,
} from '@project-nirvana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminPermissionsGuard } from './guards/admin-permissions.guard';
import { RequireAdminPermissions } from './decorators/admin-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/policies/policy.service';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminBookingsService } from './services/admin-bookings.service';
import { AdminDisputesService } from './services/admin-disputes.service';
import { AdminPaymentsService } from './services/admin-payments.service';
import { AdminContentService } from './services/admin-content.service';
import { AdminSettingsService } from './services/admin-settings.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly usersService: AdminUsersService,
    private readonly bookingsService: AdminBookingsService,
    private readonly disputesService: AdminDisputesService,
    private readonly paymentsService: AdminPaymentsService,
    private readonly contentService: AdminContentService,
    private readonly settingsService: AdminSettingsService,
  ) {}

  // ==========================================================================
  // 1. DASHBOARD
  // ==========================================================================
  @Get('dashboard')
  @RequireAdminPermissions('SUPPORT', 'FINANCE', 'TRUST_SAFETY', 'SUPER_ADMIN')
  async getDashboard() {
    return this.dashboardService.getMetrics();
  }

  // ==========================================================================
  // 2. USERS & PROVIDERS
  // ==========================================================================
  @Get('users')
  @RequireAdminPermissions('SUPPORT', 'TRUST_SAFETY', 'SUPER_ADMIN')
  async listUsers(
    @Query(new ZodValidationPipe(adminUserQuerySchema)) query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.usersService.listUsers(query);
    if ('csv' in result) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.csv);
    }
    return result;
  }

  @Patch('users/:id/status')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async updateUserStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') userId: string,
    @Body(new ZodValidationPipe(adminUserStatusUpdateSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.usersService.updateUserStatus(
      adminUser,
      userId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('users/:id/view-as')
  @RequireAdminPermissions('SUPPORT', 'SUPER_ADMIN')
  async viewAsUser(@Req() req: AuthenticatedRequest, @Param('id') userId: string) {
    const adminUser = req.user as AuthenticatedUser;
    return this.usersService.viewAsUser(adminUser, userId, req.ip, req.headers['user-agent']);
  }

  @Get('users/:id/audit-trail')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async getUserAuditTrail(@Param('id') userId: string) {
    return this.usersService.getUserAuditTrail(userId);
  }

  // ==========================================================================
  // 3. BOOKINGS
  // ==========================================================================
  @Get('bookings')
  @RequireAdminPermissions('SUPPORT', 'FINANCE', 'SUPER_ADMIN')
  async listBookings(
    @Query(new ZodValidationPipe(adminBookingQuerySchema)) query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.bookingsService.listBookings(query);
    if ('csv' in result) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.csv);
    }
    return result;
  }

  @Get('bookings/:id/timeline')
  @RequireAdminPermissions('SUPPORT', 'FINANCE', 'SUPER_ADMIN')
  async getBookingTimeline(@Param('id') bookingId: string) {
    return this.bookingsService.getBookingTimeline(bookingId);
  }

  @Post('bookings/:id/cancel-refund')
  @RequireAdminPermissions('SUPPORT', 'FINANCE', 'SUPER_ADMIN')
  async manualCancelRefund(
    @Req() req: AuthenticatedRequest,
    @Param('id') bookingId: string,
    @Body(new ZodValidationPipe(adminBookingCancelRefundSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.bookingsService.manualCancelAndRefund(
      adminUser,
      bookingId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('bookings/:id/force-complete')
  @RequireAdminPermissions('SUPPORT', 'SUPER_ADMIN')
  async forceCompleteBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id') bookingId: string,
    @Body(new ZodValidationPipe(adminBookingForceCompleteSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.bookingsService.forceCompleteBooking(
      adminUser,
      bookingId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // ==========================================================================
  // 4. DISPUTES & CHAT LOG ACCESS
  // ==========================================================================
  @Get('disputes')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async listDisputes(
    @Query(new ZodValidationPipe(adminDisputesQuerySchema)) query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.disputesService.listDisputes(query);
    if ('csv' in result) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.csv);
    }
    return result;
  }

  @Get('disputes/:id/evidence')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async getDisputeEvidence(@Param('id') disputeId: string) {
    return this.disputesService.getDisputeEvidence(disputeId);
  }

  @Post('disputes/:id/chat-logs')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async accessDisputeChatLogs(
    @Req() req: AuthenticatedRequest,
    @Param('id') disputeId: string,
    @Body(new ZodValidationPipe(adminChatLogAccessSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.disputesService.accessDisputeChatLogs(
      adminUser,
      disputeId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('disputes/:id/resolve')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async resolveDispute(
    @Req() req: AuthenticatedRequest,
    @Param('id') disputeId: string,
    @Body(new ZodValidationPipe(adminDisputeResolutionSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.disputesService.resolveDispute(
      adminUser,
      disputeId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // ==========================================================================
  // 5. PAYMENTS & PAYOUTS
  // ==========================================================================
  @Get('payments/ledger')
  @RequireAdminPermissions('FINANCE', 'SUPER_ADMIN')
  async listLedgerEntries(
    @Query(new ZodValidationPipe(adminLedgerQuerySchema)) query: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.paymentsService.listLedgerEntries(query);
    if ('csv' in result) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.csv);
    }
    return result;
  }

  @Get('payments/payouts/failed')
  @RequireAdminPermissions('FINANCE', 'SUPER_ADMIN')
  async listFailedPayouts(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.paymentsService.listFailedPayouts(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('payments/payouts/retry')
  @RequireAdminPermissions('FINANCE', 'SUPER_ADMIN')
  async retryPayout(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(adminPayoutRetrySchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.paymentsService.retryPayout(adminUser, dto, req.ip, req.headers['user-agent']);
  }

  @Get('payments/reconciliation')
  @RequireAdminPermissions('FINANCE', 'SUPER_ADMIN')
  async getReconciliation() {
    return this.paymentsService.getReconciliationReport();
  }

  // ==========================================================================
  // 6. CONTENT, CATEGORIES & MODERATION
  // ==========================================================================
  @Get('content/categories')
  @RequireAdminPermissions('SUPPORT', 'SUPER_ADMIN')
  async listCategories() {
    return this.contentService.listCategories();
  }

  @Post('content/categories')
  @RequireAdminPermissions('SUPER_ADMIN')
  async createCategory(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(adminCategoryUpsertSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.contentService.upsertCategory(
      adminUser,
      dto,
      undefined,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Patch('content/categories/:id')
  @RequireAdminPermissions('SUPER_ADMIN')
  async updateCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id') categoryId: string,
    @Body(new ZodValidationPipe(adminCategoryUpsertSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.contentService.upsertCategory(
      adminUser,
      dto,
      categoryId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('content/providers/featured')
  @RequireAdminPermissions('SUPPORT', 'SUPER_ADMIN')
  async listFeaturedProviders() {
    return this.contentService.listFeaturedProviders();
  }

  @Patch('content/providers/featured')
  @RequireAdminPermissions('SUPER_ADMIN')
  async toggleFeaturedProvider(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(adminFeaturedProviderSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.contentService.toggleFeaturedProvider(
      adminUser,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('content/reviews')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async listReviewsForModeration(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contentService.listReviewsForModeration(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch('content/reviews/:id/moderate')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async moderateReview(
    @Req() req: AuthenticatedRequest,
    @Param('id') reviewId: string,
    @Body(new ZodValidationPipe(adminReviewModerationActionSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.contentService.moderateReview(
      adminUser,
      reviewId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('content/reports')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async listReports(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contentService.listReports(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch('content/reports/:id/action')
  @RequireAdminPermissions('TRUST_SAFETY', 'SUPER_ADMIN')
  async actionReport(
    @Req() req: AuthenticatedRequest,
    @Param('id') reportId: string,
    @Body(new ZodValidationPipe(adminReportActionSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.contentService.actionReport(
      adminUser,
      reportId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // ==========================================================================
  // 7. SETTINGS
  // ==========================================================================
  @Get('settings')
  @RequireAdminPermissions('SUPER_ADMIN')
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Put('settings')
  @RequireAdminPermissions('SUPER_ADMIN')
  async updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(adminSettingsSchema)) dto: any,
  ) {
    const adminUser = req.user as AuthenticatedUser;
    return this.settingsService.updateSettings(adminUser, dto, req.ip, req.headers['user-agent']);
  }
}
