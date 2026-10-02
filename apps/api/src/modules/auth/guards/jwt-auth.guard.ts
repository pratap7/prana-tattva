import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtTokenPayload } from '../services/token.service';
import { AuthenticatedUser } from '../policies/policy.service';
import { getEnvConfig } from '../../../config/env.config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token missing or invalid');
    }

    try {
      const env = getEnvConfig();
      const payload = await this.jwtService.verifyAsync<JwtTokenPayload>(token, {
        secret: env.JWT_SECRET,
      });

      (request as unknown as { user: AuthenticatedUser & { userId: string } }).user = {
        id: payload.sub,
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        timeZone: payload.timeZone,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Token is invalid or expired');
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    // Fallback: check httpOnly cookie 'access_token'
    if (request.cookies && request.cookies['access_token']) {
      return request.cookies['access_token'];
    }

    return null;
  }
}
