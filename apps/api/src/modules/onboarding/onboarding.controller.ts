import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole, ProviderProfile, Service } from '@project-nirvana/db';
import {
  OnboardingStep1BasicInfoInput,
  OnboardingStep2CategoriesInput,
  PresignCredentialUploadInput,
  CreateCredentialInput,
  OnboardingStep4MediaAndServiceInput,
  OnboardingStep5PayoutInput,
  OnboardingStep6SubmitInput,
} from '@project-nirvana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RazorpayLinkedAccountResult } from '../payout/razorpay-route.service';
import { OnboardingService } from './onboarding.service';

@ApiTags('Provider Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER, UserRole.ADMIN)
@Controller('provider/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'Get current provider onboarding state and draft progress' })
  async getOnboardingState(@CurrentUser('id') userId: string) {
    return this.onboardingService.getOnboardingState(userId);
  }

  @Put('step/1')
  @ApiOperation({ summary: 'Save Step 1: Basic Information' })
  async saveStep1(
    @CurrentUser('id') userId: string,
    @Body() body: OnboardingStep1BasicInfoInput,
  ): Promise<ProviderProfile> {
    return this.onboardingService.saveStep1(userId, body);
  }

  @Put('step/2')
  @ApiOperation({ summary: 'Save Step 2: Categories and Modality Specialties' })
  async saveStep2(@CurrentUser('id') userId: string, @Body() body: OnboardingStep2CategoriesInput) {
    return this.onboardingService.saveStep2(userId, body);
  }

  @Post('step/3/presign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate presigned S3 upload URL for certificates/licences' })
  async presignCredential(
    @CurrentUser('id') userId: string,
    @Body() body: PresignCredentialUploadInput,
  ) {
    return this.onboardingService.presignCredential(userId, body);
  }

  @Post('step/3/credential')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register uploaded credential with virus scanner check' })
  async createCredential(@CurrentUser('id') userId: string, @Body() body: CreateCredentialInput) {
    return this.onboardingService.createCredential(userId, body);
  }

  @Delete('step/3/credential/:id')
  @ApiOperation({ summary: 'Delete an uploaded credential' })
  async deleteCredential(@CurrentUser('id') userId: string, @Param('id') credentialId: string) {
    return this.onboardingService.deleteCredential(userId, credentialId);
  }

  @Get('credentials/:id/download-url')
  @ApiOperation({
    summary: 'Generate secure temporary download URL for a credential (owner or admin only)',
  })
  async getCredentialDownloadUrl(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Param('id') credentialId: string,
  ) {
    return this.onboardingService.getCredentialDownloadUrl(userId, userRole, credentialId);
  }

  @Put('step/4')
  @ApiOperation({ summary: 'Save Step 4: Intro Video and Sample Service (Licence Gated)' })
  async saveStep4(
    @CurrentUser('id') userId: string,
    @Body() body: OnboardingStep4MediaAndServiceInput,
  ): Promise<{ profile: ProviderProfile; service: Service | null }> {
    return this.onboardingService.saveStep4(userId, body);
  }

  @Post('step/5/payout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save Step 5: Configure Razorpay Route Payout Account' })
  async saveStep5(
    @CurrentUser('id') userId: string,
    @Body() body: OnboardingStep5PayoutInput,
  ): Promise<{ profile: ProviderProfile; payoutAccount: RazorpayLinkedAccountResult }> {
    return this.onboardingService.saveStep5(userId, body);
  }

  @Post('step/6/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 6: Submit completed profile for administrative verification' })
  async submitForVerification(
    @CurrentUser('id') userId: string,
    @Body() body: OnboardingStep6SubmitInput,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return this.onboardingService.submitForVerification(userId, body, ip, userAgent);
  }
}
