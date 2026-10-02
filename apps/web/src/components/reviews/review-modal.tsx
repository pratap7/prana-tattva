'use client';

import React, { useState } from 'react';
import { Star, Sparkles, X, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { ReviewItem } from '@project-nirvana/shared';

interface ReviewModalProps {
  bookingId: string;
  providerName: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewSubmitted?: (review: ReviewItem) => void;
  existingReview?: ReviewItem | null;
}

const PRESET_TAGS = [
  'Calming',
  'Punctual',
  'Empathetic',
  'Insightful',
  'Deep Listener',
  'Grounding',
  'Patient',
  'Transformative',
  'Safe Space',
  'Professional',
];

const RATING_LABELS: Record<number, string> = {
  1: 'Challenging session',
  2: 'Fair experience',
  3: 'Good experience',
  4: 'Very uplifting',
  5: 'Exceptional & transcendent',
};

export function ReviewModal({
  bookingId,
  providerName,
  isOpen,
  onClose,
  onReviewSubmitted,
  existingReview,
}: ReviewModalProps) {
  const isEditing = !!existingReview;

  const [rating, setRating] = useState<number>(existingReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>(existingReview?.comment || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(existingReview?.tags || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rating < 1 || rating > 5) {
      setError('Please select a star rating between 1 and 5.');
      return;
    }

    try {
      setIsSubmitting(true);

      let savedReview: ReviewItem;

      if (isEditing && existingReview) {
        savedReview = await apiFetch<ReviewItem>(`/reviews/${existingReview.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            rating,
            comment: comment.trim() || null,
            tags: selectedTags,
          }),
        });
      } else {
        savedReview = await apiFetch<ReviewItem>('/reviews', {
          method: 'POST',
          body: JSON.stringify({
            bookingId,
            rating,
            comment: comment.trim() || null,
            tags: selectedTags,
          }),
        });
      }

      setIsSuccess(true);
      onReviewSubmitted?.(savedReview);

      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit review';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border p-6 sm:p-8 shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50 transition-colors"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {isSuccess ? (
          <div className="py-12 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="font-serif text-xl font-medium text-foreground">
              {isEditing ? 'Review Updated' : 'Thank You for Your Sacred Feedback'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Your honest reflections honor {providerName} and guide fellow seekers on their healing
              journey.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Header */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary font-medium text-xs">
                <Sparkles className="h-4 w-4" />
                <span>{isEditing ? 'Refine Reflection' : 'Session Reflection'}</span>
              </div>
              <h2 className="font-serif text-xl font-medium text-foreground">
                Review your experience with {providerName}
              </h2>
              <p className="text-xs text-muted-foreground">
                Your rating updates the practitioner’s trust score and helps guide future seekers.
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Star Rating */}
            <div className="space-y-2 text-center py-2 bg-muted/20 rounded-xl border border-border/60 p-4">
              <label className="text-xs font-medium text-foreground block">
                Overall Experience Rating
              </label>
              <div className="flex items-center justify-center gap-2 py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1 transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        (hoverRating !== null ? star <= hoverRating : star <= rating)
                          ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                          : 'fill-none text-muted-foreground/40'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-foreground/80">
                {RATING_LABELS[hoverRating ?? rating]}
              </p>
            </div>

            {/* Mindful Tags */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground block">
                Session Qualities (Optional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag.toLowerCase());
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleTag(tag.toLowerCase())}
                      className={`px-3 py-1 text-xs rounded-full border transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-muted/40 text-muted-foreground border-border/80 hover:bg-muted/80 hover:text-foreground'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground block">
                Written Reflections (Optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Share how this consultation or journey impacted you. What did you discover or feel? (All feedback is protected under community standards)."
                className="w-full text-xs rounded-xl border border-border/80 bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Editable for 48 hours after posting</span>
                </span>
                <span>{comment.length} / 2000</span>
              </div>
            </div>

            {/* Action Buttons */}
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
                    Submitting...
                  </>
                ) : isEditing ? (
                  'Save Updated Review'
                ) : (
                  'Publish Reflection'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
