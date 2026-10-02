import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { RateLimitService } from './services/rate-limit.service';
import { OtpService, ConsoleSmsProvider } from './services/otp.service';
import { SMS_PROVIDER } from './services/sms-provider.interface';
import { PolicyService } from './policies/policy.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { getEnvConfig } from '../../config/env.config';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = getEnvConfig();
        return {
          secret: env.JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    RateLimitService,
    OtpService,
    PolicyService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: SMS_PROVIDER,
      useClass: ConsoleSmsProvider, // Swappable with TwilioSmsProvider or Msg91SmsProvider
    },
  ],
  exports: [AuthService, TokenService, PolicyService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
