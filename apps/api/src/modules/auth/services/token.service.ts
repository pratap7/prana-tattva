import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma, UserRole } from '@project-nirvana/db';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface JwtTokenPayload {
  sub: string; // userId
  email: string;
  role: UserRole;
  timeZone: string;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 900 seconds (15 min)
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
  private readonly REFRESH_TOKEN_TTL_DAYS = 30; // 30 days

  constructor(private readonly jwtService: JwtService) {}

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  generateOpaqueToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    timeZone: string,
    existingFamilyId?: string,
  ): Promise<GeneratedTokens> {
    const payload: JwtTokenPayload = { sub: userId, email, role, timeZone };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.ACCESS_TOKEN_TTL_SECONDS,
    });

    const rawRefreshToken = this.generateOpaqueToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const familyId = existingFamilyId ?? uuidv4();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_TTL_DAYS);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId,
        isRevoked: false,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<GeneratedTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // 1. REUSE DETECTION: If token record exists but is already revoked,
    // an attacker or stale client is attempting to reuse an old token in the lineage!
    if (tokenRecord && tokenRecord.isRevoked) {
      this.logger.warn(
        `🚨 Refresh token reuse detected for user ${tokenRecord.userId} in family ${tokenRecord.familyId}. Revoking entire token family!`,
      );

      // Invalidate the ENTIRE token lineage immediately
      await prisma.refreshToken.updateMany({
        where: { familyId: tokenRecord.familyId },
        data: { isRevoked: true },
      });

      throw new UnauthorizedException(
        'Security violation: Refresh token reuse detected. Please log in again.',
      );
    }

    // 2. Token doesn't exist
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // 3. Token expired
    if (new Date() > tokenRecord.expiresAt) {
      await prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException('Refresh token has expired.');
    }

    // 4. Token is valid -> Revoke current token and generate new child token in the same family
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true },
    });

    return this.generateTokens(
      tokenRecord.user.id,
      tokenRecord.user.email,
      tokenRecord.user.role,
      tokenRecord.user.timeZone,
      tokenRecord.familyId,
    );
  }

  async revokeToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }
}
