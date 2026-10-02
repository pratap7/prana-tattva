'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Star, ShieldCheck, Sparkles, MessageSquare, Flag, Loader2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { ReviewItem, ProviderReliabilityMetrics } from '@project-nirvana/shared';
import { ReviewModal } from './review-modal';
import { ReplyModal } from './reply-modal';
import { ReportModal } from './report-modal';

interface ProviderReviewsListProps {
  providerId: string;
  providerName: string;
}

export function ProviderReviewsList({ providerId, providerName }: ProviderReviewsListProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [ratingBreakdown, setRatingBreakdown] = useState<Record<number, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  });
  const [metrics, setMetrics] = useState<ProviderReliabilityMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Modals
  const [editingReview, setEditingReview] = useState<ReviewItem | null>(null);
  const [replyingReview, setReplyingReview] = useState<ReviewItem | null>(null);
  const [reportingTarget, setReportingTarget] = useState<{
    type: 'PROVIDER' | 'REVIEW';
    id: string;
    name: string;
  } | null>(null);

  const fetchReviewsAndMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedRating) params.append('rating', String(selectedRating));
      if (selectedTag) params.append('tag', selectedTag);

      const [reviewsData, metricsData] = await Promise.all([
        apiFetch<{
          reviews: ReviewItem[];
          total: number;
          ratingBreakdown: Record<number, number>;
        }>(`/reviews/provider/${providerId}?${params.toString()}`),
        apiFetch<ProviderReliabilityMetrics>(`/reviews/provider/${providerId}/reliability`),
      ]);

      setReviews(reviewsData.reviews || []);
      setTotal(reviewsData.total || 0);
      setRatingBreakdown(reviewsData.ratingBreakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
      setMetrics(metricsData);
    } catch {
      // Fallback preview data for offline
      setReviews([
        {
          id: 'r-sample-1',
          bookingId: 'b-sample-1',
          consumerId: 'c-1',
          consumerName: 'Arjun K.',
          providerId,
          providerName,
          rating: 5,
          comment:
            'A deeply restoring and centering session. Swami Ananda held a sacred container that allowed me to release months of stored tension.',
          tags: ['calming', 'punctual', 'grounding'],
          providerReply:
            'Deeply humbled to walk alongside you on this path, Arjun. May peace continue to surround your daily practice.',
          providerRepliedAt: new Date(Date.now() - 3600000).toISOString(),
          isPublished: true,
          moderationStatus: 'PUBLISHED',
          isFlagged: false,
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
      ]);
      setTotal(1);
      setMetrics({
        completionRate: 100,
        cancellationRate: 0,
        avgResponseMinutes: 25,
        responseBadge: 'Responds within 1 hour',
        reliabilityBadges: [
          'Responds within 1 hour',
          '99% Session Completion',
          'Zero Cancellations',
        ],
        bayesianRating: 4.88,
        ratingAvg: 5.0,
        totalReviews: 1,
        completedSessions: 18,
      });
    } finally {
      setIsLoading(false);
    }
  }, [providerId, selectedRating, selectedTag, providerName]);

  useEffect(() => {
    fetchReviewsAndMetrics();
  }, [fetchReviewsAndMetrics]);

  const allTags = Array.from(new Set(reviews.flatMap((r) => r.tags)));

  return (
    <div className="space-y-8 pt-4">
      {/* 1. Header & Trust Layer Badges */}
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-2xl font-medium text-foreground">
                Sacred Trust & Reviews
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
              Every review on Nirvana is written by a verified seeker following a completed session.
              Practitioners maintain verified reliability scores and Bayesian ratings.
            </p>
          </div>

          {/* Reliability Badges */}
          {metrics && (
            <div className="flex flex-wrap items-center gap-2">
              {metrics.reliabilityBadges.map((badge) => (
                <Badge
                  key={badge}
                  variant="outline"
                  className="px-3 py-1 text-xs font-normal border-primary/30 bg-primary/5 text-primary flex items-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{badge}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* 2. Rating Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2 border-t border-border/60">
          {/* Big Score Box */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-6 rounded-xl bg-muted/20 border border-border/60 text-center space-y-2">
            <span className="font-serif text-5xl font-medium text-foreground">
              {metrics?.ratingAvg ? metrics.ratingAvg.toFixed(1) : '5.0'}
            </span>
            <div className="flex items-center gap-1 text-amber-400">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-4 w-4 ${
                    s <= Math.round(metrics?.ratingAvg || 5)
                      ? 'fill-amber-400'
                      : 'fill-none text-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Based on {total} verified seeker {total === 1 ? 'reflection' : 'reflections'}
            </p>
            {metrics?.bayesianRating ? (
              <span className="text-[10px] text-muted-foreground/80 mt-1">
                Bayesian Confidence Score: {metrics.bayesianRating.toFixed(2)} / 5.0
              </span>
            ) : null}
          </div>

          {/* Distribution Bars */}
          <div className="md:col-span-8 flex flex-col justify-center space-y-2 px-2 sm:px-4">
            {[5, 4, 3, 2, 1].map((score) => {
              const count = ratingBreakdown[score] || 0;
              const percentage = total > 0 ? (count / total) * 100 : 0;
              return (
                <button
                  key={score}
                  onClick={() => setSelectedRating(selectedRating === score ? null : score)}
                  className={`flex items-center gap-3 text-xs w-full group py-0.5 rounded px-2 transition-colors ${
                    selectedRating === score ? 'bg-primary/10' : 'hover:bg-muted/40'
                  }`}
                >
                  <span className="w-12 text-left font-medium text-muted-foreground flex items-center gap-1">
                    <span>{score}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-muted-foreground font-mono text-[11px]">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Filter Tags */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/60">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mr-1">
              <Tag className="h-3 w-3" />
              <span>Qualities:</span>
            </span>
            {allTags.map((tag) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                  className={`px-3 py-1 rounded-full text-xs transition-all capitalize border ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/40 text-muted-foreground border-border/60 hover:text-foreground'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
            {(selectedRating !== null || selectedTag !== null) && (
              <button
                onClick={() => {
                  setSelectedRating(null);
                  setSelectedTag(null);
                }}
                className="text-xs text-primary hover:underline ml-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4. Reviews List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-16 text-center space-y-3 rounded-2xl border border-dashed border-border/80 bg-card/40">
            <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <h3 className="font-serif text-base font-medium text-foreground">No Reflections Yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {selectedRating || selectedTag
                ? 'No reviews match your selected filter.'
                : `Be among the first to book a sanctuary consultation with ${providerName} and share your reflections.`}
            </p>
          </div>
        ) : (
          reviews.map((rev) => (
            <div
              key={rev.id}
              className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4 transition-all duration-150 hover:border-border/80"
            >
              {/* Header: User name, stars, date */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-serif text-primary font-medium text-sm">
                    {rev.consumerName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{rev.consumerName}</h4>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-normal flex items-center gap-1"
                      >
                        <ShieldCheck className="h-2.5 w-2.5" />
                        <span>Verified Session</span>
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(rev.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      {rev.editedAt && ' · edited'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-4 w-4 ${
                        s <= rev.rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-none text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Tags */}
              {rev.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {rev.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md text-[10px] bg-muted/60 text-muted-foreground font-medium capitalize"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Comment */}
              {rev.comment && (
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {rev.comment}
                </p>
              )}

              {/* Provider Reply */}
              {rev.providerReply && (
                <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      <span>{providerName} responded</span>
                    </span>
                    {rev.providerRepliedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(rev.providerRepliedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed italic">
                    &ldquo;{rev.providerReply}&rdquo;
                  </p>
                </div>
              )}

              {/* Action Buttons: Edit, Reply, Report */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/40 text-xs">
                {rev.canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingReview(rev)}
                    className="text-xs h-7 text-primary hover:text-primary"
                  >
                    Edit Reflection (48h)
                  </Button>
                )}

                {rev.canReply && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReplyingReview(rev)}
                    className="text-xs h-7"
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Reply
                  </Button>
                )}

                {rev.canEditReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyingReview(rev)}
                    className="text-xs h-7 text-primary"
                  >
                    Edit Reply (48h)
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setReportingTarget({
                      type: 'REVIEW',
                      id: rev.id,
                      name: `Review by ${rev.consumerName}`,
                    })
                  }
                  className="text-muted-foreground hover:text-destructive text-[11px] flex items-center gap-1 ml-auto transition-colors"
                  title="Report Inappropriate Review"
                >
                  <Flag className="h-3 w-3" />
                  <span>Report</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 5. Trust & Safety Provider Report Banner */}
      <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <span>Notice something inconsistent with our ethics or safety standards?</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setReportingTarget({
              type: 'PROVIDER',
              id: providerId,
              name: providerName,
            })
          }
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          <Flag className="h-3.5 w-3.5 mr-1" />
          Report Practitioner
        </Button>
      </div>

      {/* Modals */}
      {editingReview && (
        <ReviewModal
          bookingId={editingReview.bookingId}
          providerName={providerName}
          existingReview={editingReview}
          isOpen={!!editingReview}
          onClose={() => setEditingReview(null)}
          onReviewSubmitted={() => {
            setEditingReview(null);
            fetchReviewsAndMetrics();
          }}
        />
      )}

      {replyingReview && (
        <ReplyModal
          review={replyingReview}
          isOpen={!!replyingReview}
          onClose={() => setReplyingReview(null)}
          onReplied={() => {
            setReplyingReview(null);
            fetchReviewsAndMetrics();
          }}
        />
      )}

      {reportingTarget && (
        <ReportModal
          type={reportingTarget.type}
          targetId={reportingTarget.id}
          targetName={reportingTarget.name}
          isOpen={!!reportingTarget}
          onClose={() => setReportingTarget(null)}
        />
      )}
    </div>
  );
}
