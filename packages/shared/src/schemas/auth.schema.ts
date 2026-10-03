import { z } from 'zod';
import { USER_ROLES } from '../constants/index.js';
import { IANATimezoneSchema } from './user.schema.js';

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

export const SignupSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: PasswordSchema,
  role: z.enum(USER_ROLES).default('CONSUMER'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  timeZone: IANATimezoneSchema.optional().default('Asia/Kolkata'),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)')
    .optional(),
  displayName: z.string().min(2).max(100).optional(),
  slug: z.string().optional(),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: PasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const PhoneOtpRequestSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
});
export type PhoneOtpRequestInput = z.infer<typeof PhoneOtpRequestSchema>;

export const PhoneOtpVerifySchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d{6}$/, 'OTP must be numeric'),
});
export type PhoneOtpVerifyInput = z.infer<typeof PhoneOtpVerifySchema>;

export const GoogleOAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential token is required'),
});
export type GoogleOAuthInput = z.infer<typeof GoogleOAuthSchema>;

export const AuthUserSummarySchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(USER_ROLES),
  status: z.string(),
  timeZone: z.string(),
  locale: z.string().optional(),
  isEmailVerified: z.boolean(),
  providerSlug: z.string().optional(),
  adminPermissions: z.array(z.string()).optional(),
  providerProfile: z
    .object({
      id: z.string(),
      displayName: z.string(),
      slug: z.string(),
    })
    .nullable()
    .optional(),
});
export type AuthUserSummary = z.infer<typeof AuthUserSummarySchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSummarySchema,
  expiresIn: z.number(), // in seconds (e.g. 900 for 15 min)
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
