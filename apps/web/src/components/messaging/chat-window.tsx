'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Send,
  Image as ImageIcon,
  Shield,
  Check,
  CheckCheck,
  Lock,
  AlertTriangle,
  Loader2,
  Calendar,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch, getAccessToken } from '@/lib/api-client';
import { BlockReportModal } from './block-report-modal';
import { ConversationSummary, MessageItem } from '@project-nirvana/shared';

interface ChatWindowProps {
  conversation: ConversationSummary;
  currentUserId: string;
  onConversationUpdated?: () => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function ChatWindow({
  conversation,
  currentUserId,
  onConversationUpdated,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [leakageWarning, setLeakageWarning] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{
    url: string;
    type: string;
    size: number;
    name: string;
  } | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [selectedImageModal, setSelectedImageModal] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const otherParticipant = conversation.partner;
  const isConsumer = conversation.partner.role === 'PROVIDER';
  const isPreBookingCapReached =
    !conversation.isUnlocked && isConsumer && (conversation.preBookingMessageCount ?? 0) >= 3;

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // 1. Fetch message history
  const fetchMessages = useCallback(async () => {
    try {
      setIsLoadingMessages(true);
      const res = await apiFetch<{ messages: MessageItem[] }>(
        `/conversations/${conversation.id}/messages?limit=50`,
      );
      setMessages(res.messages || []);
      setTimeout(() => scrollToBottom(false), 100);

      // Mark read
      await apiFetch(`/conversations/${conversation.id}/read`, { method: 'POST' });
    } catch (err) {
      console.warn('Failed to load messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 2. Real-time WebSocket connection
  useEffect(() => {
    const token = getAccessToken();
    const socket = io(`${API_BASE_URL}/messaging`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_conversation', { conversationId: conversation.id });
    });

    socket.on('new_message', (data: { message: MessageItem; warning?: string }) => {
      setMessages((prev) => {
        // Prevent duplicates
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      setTimeout(() => scrollToBottom(true), 50);

      // If other party sent message, emit read receipt
      if (data.message.senderId !== currentUserId) {
        socket.emit('read_receipt', {
          conversationId: conversation.id,
          messageId: data.message.id,
        });
        apiFetch(`/conversations/${conversation.id}/read`, { method: 'POST' }).catch(() => {});
      }

      if (data.warning) {
        setLeakageWarning(data.warning);
      }
      onConversationUpdated?.();
    });

    socket.on('user_typing', (data: { userId: string; isTyping: boolean }) => {
      if (data.userId !== currentUserId) {
        setIsOtherTyping(data.isTyping);
      }
    });

    socket.on('messages_read', (data: { readerId: string; readAt: string }) => {
      if (data.readerId !== currentUserId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.senderId === currentUserId && !msg.readAt ? { ...msg, readAt: data.readAt } : msg,
          ),
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [conversation.id, currentUserId, onConversationUpdated]);

  // Handle Typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (socketRef.current) {
      socketRef.current.emit('typing', {
        conversationId: conversation.id,
        isTyping: true,
      });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('typing', {
          conversationId: conversation.id,
          isTyping: false,
        });
      }, 2000);
    }
  };

  // Handle Attachment Upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB max) and type
    if (!file.type.startsWith('image/')) {
      alert('Only image attachments (JPEG, PNG, WebP) are allowed in chat.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Attachment size cannot exceed 5MB.');
      return;
    }

    try {
      setIsUploadingAttachment(true);
      const res = await apiFetch<{
        uploadUrl: string;
        publicUrl: string;
        attachmentKey: string;
      }>('/conversations/attachment-url', {
        method: 'POST',
        body: JSON.stringify({
          contentType: file.type,
          filename: file.name,
          fileSize: file.size,
        }),
      });

      // Preview state
      setAttachmentPreview({
        url: res.publicUrl,
        type: file.type,
        size: file.size,
        name: file.name,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to prepare attachment';
      alert(msg);
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachmentPreview) return;
    if (isPreBookingCapReached) return;

    try {
      setIsSending(true);
      const payload: Record<string, unknown> = {
        content: inputText.trim(),
      };

      if (attachmentPreview) {
        payload.attachmentUrl = attachmentPreview.url;
        payload.attachmentType = attachmentPreview.type;
        payload.attachmentSize = attachmentPreview.size;
      }

      const res = await apiFetch<{
        message: MessageItem;
        hasLeakageWarning?: boolean;
        warning?: string;
      }>(`/conversations/${conversation.id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Reset input and attachment
      setInputText('');
      setAttachmentPreview(null);

      if (res.hasLeakageWarning && res.warning) {
        setLeakageWarning(res.warning);
      } else {
        setLeakageWarning(null);
      }

      // Append locally if not yet arrived via socket
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setTimeout(() => scrollToBottom(true), 50);

      onConversationUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deliver message';
      alert(msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* 1. Chat Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-muted/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-serif text-primary font-semibold text-sm">
              {otherParticipant.displayName.charAt(0)}
            </div>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card ring-1 ring-emerald-500/20" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif font-medium text-foreground text-base">
                {otherParticipant.displayName}
              </h2>
              {conversation.isUnlocked ? (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-normal"
                >
                  Booking Active
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 font-normal"
                >
                  Pre-Booking ({conversation.preBookingMessageCount ?? 0}/3)
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Lock className="h-3 w-3 text-muted-foreground/70" />
              <span>AES-256 encrypted at rest</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsBlockModalOpen(true)}
            className="text-muted-foreground hover:text-foreground text-xs"
            title="Safety Options"
          >
            <Shield className="h-4 w-4 mr-1 text-muted-foreground" />
            Safety
          </Button>
        </div>
      </div>

      {/* 2. Pre-booking or Limit Banners */}
      {!conversation.isUnlocked && (
        <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              {isPreBookingCapReached
                ? 'Pre-booking limit reached (3/3). Book a session with this practitioner to unlock unlimited chat.'
                : `Pre-booking enquiry mode: ${3 - (conversation.preBookingMessageCount ?? 0)} messages remaining before a booking is required.`}
            </span>
          </div>
          {isPreBookingCapReached && (
            <Button
              size="sm"
              variant="default"
              className="text-xs h-7 px-3 bg-amber-600 hover:bg-amber-700"
              asChild
            >
              <a href="/explore">Book Session</a>
            </Button>
          )}
        </div>
      )}

      {/* 3. Anti-leakage Moderation Notice Banner */}
      {leakageWarning && (
        <div className="px-6 py-3 bg-amber-500/15 border-b border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 animate-in slide-in-from-top-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">Sanctuary Trust & Safety Notice</p>
            <p className="leading-relaxed opacity-90">{leakageWarning}</p>
          </div>
          <button
            onClick={() => setLeakageWarning(null)}
            className="text-amber-700 dark:text-amber-400 hover:opacity-100 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4. Messages Stream */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-12">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <div className="max-w-xs space-y-1">
              <h3 className="font-serif text-sm font-medium text-foreground">
                Private Sacred Space
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect with {otherParticipant.displayName}. Messages are encrypted with AES-256 and
                protected under platform safeguards.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[75%] sm:max-w-[65%] rounded-2xl p-3.5 shadow-sm text-sm space-y-2 leading-relaxed ${
                    isMine
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted/70 text-foreground border border-border/70 rounded-tl-none'
                  }`}
                >
                  {/* Attachment if present */}
                  {msg.attachmentUrl && (
                    <div
                      className="rounded-lg overflow-hidden border border-black/10 cursor-pointer max-h-60"
                      onClick={() => setSelectedImageModal(msg.attachmentUrl || null)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.attachmentUrl}
                        alt="Attachment"
                        className="object-cover w-full h-full hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                  )}

                  {/* Text content */}
                  {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

                  {/* Flagged warning badge */}
                  {msg.hasLeakageWarning && (
                    <div className="text-[10px] flex items-center gap-1 opacity-80 pt-1 border-t border-black/10">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Safety alert flagged for moderation</span>
                    </div>
                  )}

                  {/* Meta: time + read receipts */}
                  <div
                    className={`flex items-center justify-end gap-1.5 text-[10px] ${
                      isMine ? 'text-primary-foreground/75' : 'text-muted-foreground'
                    }`}
                  >
                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMine && (
                      <span title={msg.readAt ? 'Read' : 'Sent'}>
                        {msg.readAt ? (
                          <CheckCheck className="h-3.5 w-3.5 text-sky-200" />
                        ) : (
                          <Check className="h-3.5 w-3.5 opacity-75" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Other participant typing indicator */}
        {isOtherTyping && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground italic pl-2 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce delay-150" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce delay-300" />
            <span>{otherParticipant.displayName} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 5. Attachment Preview Bar */}
      {attachmentPreview && (
        <div className="px-6 py-2.5 bg-muted/40 border-t border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <span className="truncate max-w-[200px] text-foreground font-medium">
              {attachmentPreview.name}
            </span>
            <span className="text-muted-foreground">
              ({(attachmentPreview.size / 1024).toFixed(0)} KB)
            </span>
          </div>
          <button
            onClick={() => setAttachmentPreview(null)}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 6. Message Input Area */}
      <form
        onSubmit={handleSendMessage}
        className="p-4 border-t border-border/80 bg-background/50 flex items-center gap-2"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadingAttachment || isPreBookingCapReached}
          title="Attach Image (Max 5MB)"
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {isUploadingAttachment ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
        </Button>

        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder={
            isPreBookingCapReached
              ? 'Booking required to continue conversation...'
              : 'Write a mindful message...'
          }
          disabled={isSending || isPreBookingCapReached}
          className="flex-1 bg-muted/40 border border-border/70 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background transition-colors"
        />

        <Button
          type="submit"
          size="icon"
          disabled={
            isSending || isPreBookingCapReached || (!inputText.trim() && !attachmentPreview)
          }
          className="shrink-0 rounded-xl"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {/* Modal for full size image viewing */}
      {selectedImageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedImageModal(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImageModal}
              alt="Full attachment view"
              className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setSelectedImageModal(null)}
              className="absolute -top-3 -right-3 bg-card border border-border text-foreground p-1.5 rounded-full shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Block & Report Modal */}
      <BlockReportModal
        userId={otherParticipant.id}
        userName={otherParticipant.displayName}
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        onBlocked={() => {
          onConversationUpdated?.();
          fetchMessages();
        }}
      />
    </div>
  );
}
