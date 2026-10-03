import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { prisma, UserRole, UserStatus, AuthTokenType } from '@project-nirvana/db';
import * as crypto from 'crypto';
import { PasswordService } from './services/password.service';
import { TokenService, GeneratedTokens } from './services/token.service';
import { RateLimitService } from './services/rate-limit.service';
import { OtpService } from './services/otp.service';
import { AuditService } from '../audit/audit.service';
import {
  SignupInput,
  LoginInput,
  VerifyEmailInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  AuthUserSummary,
} from '@project-nirvana/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly rateLimitService: RateLimitService,
    private readonly otpService: OtpService,
    private readonly auditService: AuditService,
  ) {}

  private mapUserSummary(user: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    timeZone: string;
    emailVerifiedAt: Date | null;
    adminPermissions?: string[] | null;
    providerProfile?: { slug: string; displayName: string } | null;
  }): AuthUserSummary {
    return {
      id: user.id,
      email: user.email,
      name: user.providerProfile?.displayName,
      role: user.role,
      status: user.status,
      timeZone: user.timeZone,
      isEmailVerified: user.emailVerifiedAt !== null,
      providerSlug: user.providerProfile?.slug,
      adminPermissions: (user.adminPermissions as string[]) || [],
    };
  }

  async signup(
    input: SignupInput,
    ip?: string,
    userAgent?: string,
  ): Promise<{ message: string; user: AuthUserSummary; tokens: GeneratedTokens }> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists.');
    }

    const passwordHash = await this.passwordService.hashPassword(input.password);
    const role = (input.role as UserRole) || UserRole.CONSUMER;

    // Create user and provider profile if registering as provider
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        role,
        status: UserStatus.ACTIVE,
        timeZone: input.timeZone || 'Asia/Kolkata',
        phone: input.phone,
        providerProfile:
          role === UserRole.PROVIDER
            ? {
                create: {
                  displayName: input.name,
                  slug: `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`,
                  headline: 'Wellness Practitioner',
                  bio: 'Guiding seekers toward inner balance and holistic wellness.',
                  city: 'Rishikesh',
                  country: 'IN',
                },
              }
            : undefined,
      },
      include: {
        providerProfile: true,
      },
    });

    // Generate email verification token (valid for 24 hours)
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: AuthTokenType.EMAIL_VERIFICATION,
        expiresAt,
      },
    });

    this.logger.log(
      `📧 [EMAIL DISPATCH] Verification link for ${user.email}: token=${rawVerificationToken}`,
    );

    // Audit log
    await this.auditService.record({
      userId: user.id,
      action: 'AUTH_SIGNUP',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
      metadata: { role: user.role, email: user.email },
    });

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.email,
      user.role,
      user.timeZone,
    );

    return {
      message: 'Account successfully registered. Please verify your email address.',
      user: this.mapUserSummary(user),
      tokens,
    };
  }

  async login(
    input: LoginInput,
    ip?: string,
    userAgent?: string,
  ): Promise<{ user: AuthUserSummary; tokens: GeneratedTokens }> {
    const email = input.email.toLowerCase();

    // 1. Check account lockout status
    const lockout = await this.rateLimitService.isAccountLocked(email);
    if (lockout.locked) {
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: `Account is temporarily locked due to excessive failed attempts. Try again in ${Math.ceil(lockout.remainingSeconds / 60)} minutes.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { providerProfile: true },
    });

    if (!user || !user.passwordHash) {
      const result = await this.rateLimitService.recordFailedLogin(email);
      await this.auditService.record({
        userId: user?.id,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: email,
        ipAddress: ip,
        userAgent,
        metadata: { reason: 'User not found or no password set' },
      });

      if (result.isLocked) {
        throw new HttpException(
          {
            code: 'ACCOUNT_LOCKED',
            message:
              'Account locked due to multiple consecutive failed attempts. Try again in 15 minutes.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account has been suspended. Please contact support.');
    }

    // 3. Verify password via Argon2id
    const isPasswordValid = await this.passwordService.verifyPassword(
      user.passwordHash,
      input.password,
    );

    if (!isPasswordValid) {
      const result = await this.rateLimitService.recordFailedLogin(email);
      await this.auditService.record({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ip,
        userAgent,
        metadata: { attemptsLeft: result.attemptsLeft },
      });

      if (result.isLocked) {
        throw new HttpException(
          {
            code: 'ACCOUNT_LOCKED',
            message:
              'Account locked due to multiple consecutive failed attempts. Try again in 15 minutes.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException('Invalid email or password.');
    }

    // 4. Successful login: reset failed counters
    await this.rateLimitService.resetFailedAttempts(email);

    // 5. Generate short-lived JWT + rotating refresh token
    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.email,
      user.role,
      user.timeZone,
    );

    // 6. Record successful login in audit log
    await this.auditService.record({
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return {
      user: this.mapUserSummary(user),
      tokens,
    };
  }

  async verifyEmail(
    input: VerifyEmailInput,
    ip?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

    const tokenRecord = await prisma.authToken.findFirst({
      where: {
        tokenHash,
        type: AuthTokenType.EMAIL_VERIFICATION,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired email verification link.');
    }

    await prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { emailVerifiedAt: new Date() },
    });

    await prisma.authToken.delete({
      where: { id: tokenRecord.id },
    });

    await this.auditService.record({
      userId: tokenRecord.userId,
      action: 'AUTH_EMAIL_VERIFIED',
      entityType: 'User',
      entityId: tokenRecord.userId,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'Your email address has been successfully verified.' };
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    // Prevent account enumeration by always returning success response
    if (!user) {
      return {
        message: 'If an account exists with this email, a password reset link has been dispatched.',
      };
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour validity

    await prisma.authToken.deleteMany({
      where: { userId: user.id, type: AuthTokenType.PASSWORD_RESET },
    });

    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: AuthTokenType.PASSWORD_RESET,
        expiresAt,
      },
    });

    this.logger.log(
      `🔑 [PASSWORD RESET] Dispatched link for ${user.email}: token=${rawResetToken}`,
    );

    return {
      message: 'If an account exists with this email, a password reset link has been dispatched.',
    };
  }

  async resetPassword(
    input: ResetPasswordInput,
    ip?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

    const tokenRecord = await prisma.authToken.findFirst({
      where: {
        tokenHash,
        type: AuthTokenType.PASSWORD_RESET,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    const newPasswordHash = await this.passwordService.hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate the reset token
    await prisma.authToken.delete({
      where: { id: tokenRecord.id },
    });

    // Revoke all existing sessions across all devices for security
    await this.tokenService.revokeAllUserSessions(tokenRecord.userId);

    await this.auditService.record({
      userId: tokenRecord.userId,
      action: 'AUTH_PASSWORD_RESET',
      entityType: 'User',
      entityId: tokenRecord.userId,
      ipAddress: ip,
      userAgent,
    });

    return {
      message: 'Password has been updated successfully. Please log in with your new password.',
    };
  }

  async refreshToken(rawRefreshToken: string): Promise<GeneratedTokens> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token missing.');
    }

    return this.tokenService.rotateRefreshToken(rawRefreshToken);
  }

  async logout(rawRefreshToken?: string, userId?: string): Promise<{ message: string }> {
    if (rawRefreshToken) {
      await this.tokenService.revokeToken(rawRefreshToken);
    }
    if (userId) {
      await this.auditService.record({
        userId,
        action: 'AUTH_LOGOUT',
        entityType: 'User',
        entityId: userId,
      });
    }

    return { message: 'Logged out successfully.' };
  }

  async requestPhoneOtp(phone: string): Promise<{ message: string }> {
    await this.otpService.generateAndSendOtp(phone);
    return { message: 'OTP sent successfully to your phone number.' };
  }

  async verifyPhoneOtp(
    phone: string,
    otp: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ user: AuthUserSummary; tokens: GeneratedTokens }> {
    const user = await this.otpService.verifyOtp(phone, otp);

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.email,
      user.role,
      user.timeZone,
    );

    await this.auditService.record({
      userId: user.id,
      action: 'AUTH_PHONE_OTP_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { providerProfile: true },
    });

    return {
      user: this.mapUserSummary(fullUser || user),
      tokens,
    };
  }

  async googleLogin(
    credentialToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ user: AuthUserSummary; tokens: GeneratedTokens }> {
    // In production, verify Google ID token with google-auth-library
    // In dev / test, accept base64 or payload simulation
    let email = 'google.user@example.com';
    let _name = 'Google Seeker';

    try {
      const parts = credentialToken.split('.');
      if (parts.length === 3 && parts[1]) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        email = decoded.email || email;
        _name = decoded.name || _name;
      }
    } catch {
      // fallback to mock
    }

    let user = await prisma.user.findUnique({
      where: { email },
      include: { providerProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          role: UserRole.CONSUMER,
          status: UserStatus.ACTIVE,
          timeZone: 'Asia/Kolkata',
          emailVerifiedAt: new Date(),
        },
        include: { providerProfile: true },
      });
    }

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.email,
      user.role,
      user.timeZone,
    );

    await this.auditService.record({
      userId: user.id,
      action: 'AUTH_GOOGLE_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return {
      user: this.mapUserSummary(user),
      tokens,
    };
  }
}
