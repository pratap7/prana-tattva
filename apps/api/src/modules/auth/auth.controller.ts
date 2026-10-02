import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UserRole } from '@project-nirvana/db';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './policies/policy.service';
import { validateWithZod } from '../../common/pipes/zod-validation.pipe';
import {
  SignupSchema,
  SignupInput,
  LoginSchema,
  LoginInput,
  VerifyEmailSchema,
  VerifyEmailInput,
  ForgotPasswordSchema,
  ForgotPasswordInput,
  ResetPasswordSchema,
  ResetPasswordInput,
  PhoneOtpRequestSchema,
  PhoneOtpRequestInput,
  PhoneOtpVerifySchema,
  PhoneOtpVerifyInput,
  GoogleOAuthSchema,
  GoogleOAuthInput,
} from '@project-nirvana/shared';
import { getEnvConfig } from '../../config/env.config';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

@ApiTags('Authentication & Identity')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshTokenCookie(res: Response, token: string): void {
    const env = getEnvConfig();
    const isProd = env.NODE_ENV === 'production';

    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth', // Only sent on auth routes (e.g. /auth/refresh, /auth/logout)
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  private clearRefreshTokenCookie(res: Response): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      path: '/auth',
    });
  }

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Register a new Consumer or Provider account' })
  @ApiResponse({ status: 201, description: 'Account registered' })
  async signup(
    @Body(validateWithZod(SignupSchema)) input: SignupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.signup(input, ip, userAgent);
    this.setRefreshTokenCookie(res, result.tokens.refreshToken);

    return {
      message: result.message,
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, description: 'Logged in successfully' })
  async login(
    @Body(validateWithZod(LoginSchema)) input: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.login(input, ip, userAgent);
    this.setRefreshTokenCookie(res, result.tokens.refreshToken);

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new 15-minute access token' })
  async refresh(
    @Req() req: Request,
    @Body('refreshToken') bodyToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE] || bodyToken;
    const result = await this.authService.refreshToken(token);

    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke active refresh token and invalidate session' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('id') userId?: string,
  ) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(token, userId);
    this.clearRefreshTokenCookie(res);

    return { message: 'Logged out successfully.' };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address via token link' })
  async verifyEmail(
    @Body(validateWithZod(VerifyEmailSchema)) input: VerifyEmailInput,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.verifyEmail(input, ip, userAgent);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset instructions' })
  async forgotPassword(@Body(validateWithZod(ForgotPasswordSchema)) input: ForgotPasswordInput) {
    return this.authService.forgotPassword(input);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using valid reset token' })
  async resetPassword(
    @Body(validateWithZod(ResetPasswordSchema)) input: ResetPasswordInput,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.resetPassword(input, ip, userAgent);
  }

  @Public()
  @Post('phone/otp-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request login OTP via SMS' })
  async requestPhoneOtp(@Body(validateWithZod(PhoneOtpRequestSchema)) input: PhoneOtpRequestInput) {
    return this.authService.requestPhoneOtp(input.phone);
  }

  @Public()
  @Post('phone/otp-verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone OTP and authenticate' })
  async verifyPhoneOtp(
    @Body(validateWithZod(PhoneOtpVerifySchema)) input: PhoneOtpVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.verifyPhoneOtp(input.phone, input.otp, ip, userAgent);
    this.setRefreshTokenCookie(res, result.tokens.refreshToken);

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate via Google OAuth ID token' })
  async googleLogin(
    @Body(validateWithZod(GoogleOAuthSchema)) input: GoogleOAuthInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.googleLogin(input.credential, ip, userAgent);
    this.setRefreshTokenCookie(res, result.tokens.refreshToken);

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  // --------------------------------------------------------------------------
  // PROTECTED & RBAC DEMONSTRATION ROUTES
  // --------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER, UserRole.ADMIN)
  @ApiBearerAuth()
  @Get('provider-only')
  @ApiOperation({ summary: 'Protected route accessible only by PROVIDER or ADMIN' })
  getProviderDashboard(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: 'Access granted to practitioner portal.',
      user,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Get('admin-only')
  @ApiOperation({ summary: 'Protected route accessible only by ADMIN' })
  getAdminPanel(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: 'Access granted to platform administration.',
      user,
    };
  }
}
