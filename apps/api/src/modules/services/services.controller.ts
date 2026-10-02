import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole, Service } from '@project-nirvana/db';
import { CreateServiceInput, UpdateServiceInput } from '@project-nirvana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ServicesService } from './services.service';

@ApiTags('Provider Services Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROVIDER, UserRole.ADMIN)
@Controller('provider/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new service offering' })
  async createService(
    @CurrentUser('id') userId: string,
    @Body() body: CreateServiceInput,
  ): Promise<Service> {
    return this.servicesService.createService(userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List all services offered by current practitioner' })
  async getProviderServices(@CurrentUser('id') userId: string): Promise<Service[]> {
    return this.servicesService.getProviderServices(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single service offering by ID' })
  async getServiceById(
    @CurrentUser('id') userId: string,
    @Param('id') serviceId: string,
  ): Promise<Service> {
    return this.servicesService.getServiceById(userId, serviceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update service offering configuration' })
  async updateService(
    @CurrentUser('id') userId: string,
    @Param('id') serviceId: string,
    @Body() body: UpdateServiceInput,
  ): Promise<Service> {
    return this.servicesService.updateService(userId, serviceId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Delete service offering (soft-deactivates if bookings exist to preserve financial integrity)',
  })
  async deleteService(@CurrentUser('id') userId: string, @Param('id') serviceId: string) {
    return this.servicesService.deleteService(userId, serviceId);
  }
}
