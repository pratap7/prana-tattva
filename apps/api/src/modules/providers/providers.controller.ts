import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/decorators/public.decorator';
import { ProvidersService } from './providers.service';

@ApiTags('Public Providers & Discovery')
@Controller()
export class ProvidersController {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly jwtService: JwtService,
  ) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'List all active categories with license requirement indicators' })
  async getCategories() {
    return this.providersService.getCategories();
  }

  @Public()
  @Get('providers/public/:slug')
  @ApiOperation({
    summary: 'Get public practitioner profile (only accessible when approvalStatus = APPROVED)',
  })
  async getPublicProfile(@Param('slug') slug: string, @Req() req: Request) {
    // Optionally extract user if present in Authorization header
    let viewerUserId: string | undefined;
    let viewerRole: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = this.jwtService.decode(token) as { sub?: string; role?: string } | null;
        if (payload?.sub) {
          viewerUserId = payload.sub;
          viewerRole = payload.role;
        }
      } catch {
        // Ignore invalid bearer token for public read
      }
    }

    return this.providersService.getPublicProfile(slug, viewerUserId, viewerRole);
  }
}
