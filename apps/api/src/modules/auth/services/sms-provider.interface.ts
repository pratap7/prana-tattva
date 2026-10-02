export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<boolean>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
