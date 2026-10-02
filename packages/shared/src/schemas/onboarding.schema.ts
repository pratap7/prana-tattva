import { z } from 'zod';
import { CREDENTIAL_TYPES, SERVICE_MODES, VERIFICATION_TIERS } from '../constants/index.js';

// ============================================================================
// STEP 1: BASIC INFO
// ============================================================================

export const OnboardingStep1BasicInfoSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name is too long'),
  headline: z
    .string()
    .min(5, 'Headline must be at least 5 characters')
    .max(150, 'Headline must not exceed 150 characters'),
  bio: z
    .string()
    .min(20, 'Please share at least a short bio (20+ characters)')
    .max(3000, 'Bio is too long'),
  languages: z.array(z.string().min(2)).min(1, 'Please select at least one language'),
  country: z.string().min(2).default('IN'),
  city: z.string().min(2, 'City is required').max(100),
  yearsExperience: z
    .number()
    .int()
    .min(0, 'Years of experience cannot be negative')
    .max(70, 'Please enter a valid number of years'),
  avatarUrl: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
});
export type OnboardingStep1BasicInfoInput = z.infer<typeof OnboardingStep1BasicInfoSchema>;

// ============================================================================
// STEP 2: CATEGORIES & SPECIALTIES
// ============================================================================

export const OnboardingStep2CategoriesSchema = z.object({
  categoryIds: z
    .array(z.string().uuid('Invalid category ID'))
    .min(1, 'Please select at least one healing modality'),
  primaryCategoryId: z.string().uuid('Invalid primary category ID'),
});
export type OnboardingStep2CategoriesInput = z.infer<typeof OnboardingStep2CategoriesSchema>;

// ============================================================================
// STEP 3: CREDENTIALS UPLOAD & VALIDATION
// ============================================================================

export const ALLOWED_CREDENTIAL_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_CREDENTIAL_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const PresignCredentialUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255),
  contentType: z.enum(ALLOWED_CREDENTIAL_MIME_TYPES, {
    errorMap: () => ({
      message: 'Only PDF, JPEG, PNG, and WebP files are permitted for verification.',
    }),
  }),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_CREDENTIAL_FILE_SIZE_BYTES, 'Document size must be less than 10MB'),
  credentialType: z.enum(CREDENTIAL_TYPES),
});
export type PresignCredentialUploadInput = z.infer<typeof PresignCredentialUploadSchema>;

export const CreateCredentialSchema = z.object({
  type: z.enum(CREDENTIAL_TYPES),
  title: z.string().min(2, 'Title must be at least 2 characters').max(200),
  issuer: z.string().min(2, 'Issuing institution is required').max(200),
  documentUrl: z.string().min(1, 'Document key / URL is required'),
  expiresAt: z.string().datetime().optional().nullable(),
});
export type CreateCredentialInput = z.infer<typeof CreateCredentialSchema>;

// ============================================================================
// STEP 4: INTRO VIDEO & SAMPLE SERVICE
// ============================================================================

export const SampleServiceSchema = z.object({
  title: z.string().min(3, 'Service title must be at least 3 characters').max(150),
  description: z.string().min(10, 'Service description must be at least 10 characters').max(2000),
  categoryId: z.string().uuid('Category must be a valid category ID'),
  durationMin: z.number().int().min(15).max(240).default(60),
  priceAmount: z
    .number()
    .int()
    .min(5000, 'Minimum session fee is ₹50 (5000 paise)')
    .max(10000000, 'Maximum session fee is ₹1,00,000'),
  mode: z.enum(SERVICE_MODES).default('ONLINE'),
});
export type SampleServiceInput = z.infer<typeof SampleServiceSchema>;

export const OnboardingStep4MediaAndServiceSchema = z.object({
  introVideoUrl: z
    .string()
    .url('Must be a valid video URL (YouTube, Vimeo, or direct upload)')
    .optional()
    .or(z.literal('')),
  sampleService: SampleServiceSchema.optional(),
});
export type OnboardingStep4MediaAndServiceInput = z.infer<
  typeof OnboardingStep4MediaAndServiceSchema
>;

// ============================================================================
// STEP 5: PAYOUT SETUP (RAZORPAY ROUTE)
// ============================================================================

export const OnboardingStep5PayoutSchema = z.object({
  accountHolderName: z.string().min(2, 'Account holder name is required').max(100),
  accountNumber: z
    .string()
    .min(8, 'Account number must be at least 8 digits')
    .max(20, 'Account number too long')
    .regex(/^\d+$/, 'Account number must contain only digits'),
  ifscCode: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid Indian IFSC code format (e.g. HDFC0001234)'),
  businessType: z
    .enum(['individual', 'partnership', 'proprietary', 'llp', 'pvt_ltd'])
    .default('individual'),
  pan: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format (e.g. ABCDE1234F)')
    .optional()
    .or(z.literal('')),
});
export type OnboardingStep5PayoutInput = z.infer<typeof OnboardingStep5PayoutSchema>;

// ============================================================================
// STEP 6: SUBMIT FOR REVIEW
// ============================================================================

export const OnboardingStep6SubmitSchema = z.object({
  confirmAccurate: z.boolean().refine((val) => val === true, {
    message: 'You must confirm that all provided details and credentials are authentic.',
  }),
});
export type OnboardingStep6SubmitInput = z.infer<typeof OnboardingStep6SubmitSchema>;

// ============================================================================
// ADMIN QUEUE ACTIONS
// ============================================================================

export const AdminApproveProviderSchema = z.object({
  verificationTier: z.enum(VERIFICATION_TIERS).default('CREDENTIAL_VERIFIED'),
  adminNotes: z.string().max(1000).optional(),
});
export type AdminApproveProviderInput = z.infer<typeof AdminApproveProviderSchema>;

export const AdminRejectProviderSchema = z.object({
  reason: z.string().min(5, 'A clear reason for rejection is required').max(1000),
});
export type AdminRejectProviderInput = z.infer<typeof AdminRejectProviderSchema>;

export const AdminRequestInfoSchema = z.object({
  message: z.string().min(5, 'Clarification message is required').max(1000),
});
export type AdminRequestInfoInput = z.infer<typeof AdminRequestInfoSchema>;

export const AdminReviewCredentialSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  notes: z.string().max(500).optional(),
});
export type AdminReviewCredentialInput = z.infer<typeof AdminReviewCredentialSchema>;

export const AdminSetTierSchema = z.object({
  verificationTier: z.enum(VERIFICATION_TIERS),
});
export type AdminSetTierInput = z.infer<typeof AdminSetTierSchema>;
