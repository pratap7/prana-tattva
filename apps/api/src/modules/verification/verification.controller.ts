import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole, ApprovalStatus, ProviderProfile } from '@project-nirvana/db';
import {
  AdminApproveProviderInput,
  AdminRejectProviderInput,
  AdminRequestInfoInput,
  AdminReviewCredentialInput,
  AdminSetTierInput,
} from '@project-nirvana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerificationService } from './verification.service';

@ApiTags('Admin Verification Queue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get('queue')
  @ApiOperation({ summary: 'List provider onboarding verification queue (default: PENDING)' })
  async listQueue(@Query('status') status?: ApprovalStatus) {
    return this.verificationService.listQueue(status);
  }

  @Get('queue/:id')
  @ApiOperation({
    summary: 'Get complete verification dossier for a provider with signed download URLs',
  })
  async getDossier(@Param('id') providerId: string) {
    return this.verificationService.getDossier(providerId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve provider profile and assign verification tier' })
  async approveProvider(
    @CurrentUser('id') adminId: string,
    @Param('id') providerId: string,
    @Body() body: AdminApproveProviderInput,
    @Req() req: Request,
  ): Promise<ProviderProfile> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return this.verificationService.approveProvider(adminId, providerId, body, ip, userAgent);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject provider application with explicit reason' })
  async rejectProvider(
    @CurrentUser('id') adminId: string,
    @Param('id') providerId: string,
    @Body() body: AdminRejectProviderInput,
    @Req() req: Request,
  ): Promise<ProviderProfile> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return this.verificationService.rejectProvider(adminId, providerId, body, ip, userAgent);
  }

  @Post(':id/request-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request more information from applicant (reverts status to DRAFT with instructions)',
  })
  async requestMoreInfo(
    @CurrentUser('id') adminId: string,
    @Param('id') providerId: string,
    @Body() body: AdminRequestInfoInput,
    @Req() req: Request,
  ): Promise<ProviderProfile> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return this.verificationService.requestMoreInfo(adminId, providerId, body, ip, userAgent);
  }

  @Post(':id/credential/:credId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review and verify/reject an individual credential document' })
  async reviewCredential(
    @CurrentUser('id') adminId: string,
    @Param('credId') credId: string,
    @Body() body: AdminReviewCredentialInput,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return this.verificationService.reviewCredential(adminId, credId, body, ip, userAgent);
  }

  @Post(':id/tier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or update provider verification tier' })
  async setTier(
    @CurrentUser('id') adminId: string,
    @Param('id') providerId: string,
    @Body() body: AdminSetTierInput,
    @Req() req: Request,
  ): Promise<ProviderProfile> {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return this.verificationService.setTier(adminId, providerId, body, ip, userAgent);
  }
}
