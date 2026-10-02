import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@project-nirvana/db';
import {
  SetAvailabilityRulesInput,
  CreateAvailabilityExceptionInput,
  UpdateAvailabilityConfigInput,
  GetAvailableSlotsQueryInput,
} from '@project-nirvana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AvailabilityService } from './availability.service';

@ApiTags('Provider Availability & Slot Generation')
@Controller()
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ==========================================================================
  // PROVIDER AVAILABILITY RULES & CONFIG (PROTECTED)
  // ==========================================================================

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @Get('provider/availability/rules')
  @ApiOperation({ summary: 'Get practitioner weekly recurring availability rules' })
  async getRules(@CurrentUser('id') userId: string) {
    return this.availabilityService.getRules(userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @Put('provider/availability/rules')
  @ApiOperation({ summary: 'Set/replace practitioner weekly recurring availability rules' })
  async setRules(@CurrentUser('id') userId: string, @Body() body: SetAvailabilityRulesInput) {
    return this.availabilityService.setRules(userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @Get('provider/availability/exceptions')
  @ApiOperation({ summary: 'List availability exceptions (vacations, blocked days, extra slots)' })
  async getExceptions(@CurrentUser('id') userId: string) {
    return this.availabilityService.getExceptions(userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @Post('provider/availability/exceptions')
  @ApiOperation({ summary: 'Create an availability exception (e.g. time off or one-off slot)' })
  async createException(
    @CurrentUser('id') userId: string,
    @Body() body: CreateAvailabilityExceptionInput,
  ) {
    return this.availabilityService.createException(userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @Delete('provider/availability/exceptions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an availability exception' })
  async deleteException(@CurrentUser('id') userId: string, @Param('id') exceptionId: string) {
    return this.availabilityService.deleteException(userId, exceptionId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @Get('provider/availability/config')
  @ApiOperation({ summary: 'Get session buffer minutes and minimum booking notice hours' })
  async getConfig(@CurrentUser('id') userId: string) {
    return this.availabilityService.getConfig(userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @Put('provider/availability/config')
  @ApiOperation({ summary: 'Update session buffer minutes and minimum booking notice hours' })
  async updateConfig(
    @CurrentUser('id') userId: string,
    @Body() body: UpdateAvailabilityConfigInput,
  ) {
    return this.availabilityService.updateConfig(userId, body);
  }

  // ==========================================================================
  // PUBLIC / CONSUMER SLOT GENERATION (PUBLIC)
  // ==========================================================================

  @Public()
  @Get('providers/:providerId/slots')
  @ApiOperation({
    summary:
      'Get available slots for a practitioner and service, expanded across time zones with Redis caching',
  })
  async getAvailableSlots(
    @Param('providerId') providerId: string,
    @Query() query: GetAvailableSlotsQueryInput,
  ) {
    return this.availabilityService.getAvailableSlots(providerId, query);
  }
}
