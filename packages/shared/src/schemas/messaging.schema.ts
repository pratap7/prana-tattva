import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message cannot exceed 5000 characters'),
  attachmentUrl: z.string().url('Invalid attachment URL').optional().nullable(),
  attachmentType: z.string().optional().nullable(),
  attachmentSize: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024, 'Attachment exceeds 5MB limit')
    .optional()
    .nullable(),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const createAttachmentUrlSchema = z.object({
  fileName: z.string().min(1, 'File name is required').max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024, 'File size cannot exceed 5MB'),
});

export type CreateAttachmentUrlDto = z.infer<typeof createAttachmentUrlSchema>;

export const blockUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  reason: z.string().max(500).optional(),
});

export type BlockUserDto = z.infer<typeof blockUserSchema>;

export const reportUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  category: z.enum(['HARASSMENT', 'UNPROFESSIONAL', 'FRAUD', 'NO_SHOW', 'LEAKAGE', 'SAFETY']),
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(2000),
  bookingId: z.string().uuid().optional().nullable(),
});

export type ReportUserDto = z.infer<typeof reportUserSchema>;

export const getMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type GetMessagesQueryDto = z.infer<typeof getMessagesQuerySchema>;

export interface ConversationPartner {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  headline?: string | null;
  role: 'CONSUMER' | 'PROVIDER';
}

export interface ConversationSummary {
  id: string;
  partner: ConversationPartner;
  bookingId?: string | null;
  isUnlocked: boolean;
  preBookingMessageCount: number;
  unreadCount: number;
  lastMessage?: {
    id: string;
    senderId: string;
    content: string;
    hasAttachment: boolean;
    createdAt: string;
    isRead: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  isRead: boolean;
  readAt?: string | null;
  hasLeakageWarning: boolean;
  leakageFlags?: string[] | null;
  flaggedForModeration: boolean;
  warningMessage?: string | null;
  createdAt: string;
}

export interface AttachmentSignedUrlResponse {
  uploadUrl: string;
  attachmentUrl: string;
  expiresAt: string;
}

export interface AntiLeakageResult {
  hasLeakage: boolean;
  leakageFlags: ('PHONE' | 'EMAIL' | 'OFF_PLATFORM_KEYWORD')[];
  warningMessage?: string | null;
}
