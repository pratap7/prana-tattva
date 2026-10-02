import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheckResponse } from '@project-nirvana/shared';
import { getEnvConfig } from '../../config/env.config';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'API Health and Liveness status' })
  @ApiResponse({
    status: 200,
    description: 'System is operational and ready to receive traffic',
  })
  check(): HealthCheckResponse {
    const env = getEnvConfig();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
      version: '0.1.0',
    };
  }
}
