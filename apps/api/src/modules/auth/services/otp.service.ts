import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { prisma, AuthTokenType, UserRole, UserStatus } from '@project-nirvana/db';
import * as crypto from 'crypto';
import { SmsProvider, SMS_PROVIDER } from './sms-provider.interface';

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    this.logger.log(`📱 [SMS DISPATCH] To: ${phone} | Nirvana OTP: ${otp} (valid for 5 mins)`);
    return true;
  }
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 5;

  constructor(@Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider) {}

  private hashOtp(phone: string, otp: string): string {
    return crypto.createHash('sha256').update(`${phone}:${otp}`).digest('hex');
  }

  async generateAndSendOtp(phone: string): Promise<void> {
    // Generate secure 6-digit numeric OTP
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const tokenHash = this.hashOtp(phone, rawOtp);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    // Find or create temporary placeholder user for the phone if not already present
    let user = await prisma.user.findFirst({
      where: { phone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `${phone.replace(/[^0-9]/g, '')}@phone.projectnirvana.internal`,
          phone,
          role: UserRole.CONSUMER,
          status: UserStatus.ACTIVE,
          timeZone: 'Asia/Kolkata',
        },
      });
    }

    // Invalidate previous OTP tokens for this user
    await prisma.authToken.deleteMany({
      where: {
        userId: user.id,
        type: AuthTokenType.PHONE_OTP,
      },
    });

    // Store new OTP hash
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: AuthTokenType.PHONE_OTP,
        expiresAt,
      },
    });

    // Dispatch via SMS provider
    await this.smsProvider.sendOtp(phone, rawOtp);
  }

  async verifyOtp(phone: string, otp: string) {
    const tokenHash = this.hashOtp(phone, otp);

    const user = await prisma.user.findFirst({
      where: { phone },
    });

    if (!user) {
      throw new BadRequestException('Invalid phone number or OTP request not found.');
    }

    const tokenRecord = await prisma.authToken.findFirst({
      where: {
        userId: user.id,
        tokenHash,
        type: AuthTokenType.PHONE_OTP,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired OTP code.');
    }

    // Single-use: delete token immediately upon successful verification
    await prisma.authToken.delete({
      where: { id: tokenRecord.id },
    });

    return user;
  }
}
