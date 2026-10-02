import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtTokenPayload } from '../services/token.service';
import { AuthenticatedUser } from '../policies/policy.service';
import { getEnvConfig } from '../../../config/env.config';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return true;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return true;
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
    } catch {
      // Ignore token verification errors for optional auth
    }

    return true;
  }
}
