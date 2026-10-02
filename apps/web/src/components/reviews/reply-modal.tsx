'use client';

import React, { useState } from 'react';
import { MessageSquare, X, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { ReviewItem } from '@project-nirvana/shared';

interface ReplyModalProps {
  review: ReviewItem;
  isOpen: boolean;
  onClose: () => void;
  onReplied?: (updatedReview: ReviewItem) => void;
}

export function ReplyModal({ review, isOpen, onClose, onReplied }: ReplyModalProps) {
  const isEditing = !!review.providerReply;
  const [replyText, setReplyText] = useState<string>(review.providerReply || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) {
      setError('Please enter your response before submitting.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      let updated: ReviewItem;
      if (isEditing) {
        updated = await apiFetch<ReviewItem>(`/reviews/${review.id}/reply`, {
          method: 'PATCH',
          body: JSON.stringify({ providerReply: replyText.trim() }),
        });
      } else {
        updated = await apiFetch<ReviewItem>(`/reviews/${review.id}/reply`, {
          method: 'POST',
          body: JSON.stringify({ providerReply: replyText.trim() }),
        });
      }

      setIsSuccess(true);
      onReplied?.(updated);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save reply';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50 transition-colors"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-medium text-foreground">
              {isEditing ? 'Edit Practitioner Reply' : 'Reply to Seeker Reflection'}
            </h3>
            <p className="text-xs text-muted-foreground">Replying to {review.consumerName}</p>
          </div>
        </div>

        {/* Original review quote */}
        <div className="p-3 rounded-xl bg-muted/30 border border-border/60 text-xs mb-4">
          <p className="text-muted-foreground italic line-clamp-2">
            &ldquo;{review.comment || '5-star session rating'}&rdquo;
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {isSuccess ? (
          <div className="py-6 text-center space-y-2 animate-in fade-in duration-200">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-foreground">
              {isEditing ? 'Reply Updated' : 'Reply Published'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Your Mindful Response
              </label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Acknowledge the seeker’s reflection with grace and mindfulness..."
                className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Editable for 48 hours after posting</span>
                </span>
                <span>{replyText.length} / 2000</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Publishing...
                  </>
                ) : isEditing ? (
                  'Save Updated Reply'
                ) : (
                  'Publish Reply'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
