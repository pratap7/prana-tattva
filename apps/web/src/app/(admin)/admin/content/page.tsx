'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderTree,
  Star,
  MessageSquare,
  Flag,
  Plus,
  Edit2,
  RefreshCw,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  requiresLicense: boolean;
  commissionBps: number;
  isActive: boolean;
  _count?: { providers: number; services: number };
}

interface FeaturedProviderItem {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl?: string | null;
  headline?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  bayesianRating?: number;
  verificationTier: string;
  approvalStatus: string;
}

interface ReviewModerationItem {
  id: string;
  rating: number;
  comment?: string | null;
  tags: string[];
  moderationStatus: 'PENDING' | 'PUBLISHED' | 'FLAGGED' | 'REJECTED';
  isPublished: boolean;
  createdAt: string;
  consumer: { id: string; email: string };
  provider: { id: string; email: string };
  booking?: { id: string; provider?: { displayName?: string } };
  reports?: unknown[];
}

interface ReportItem {
  id: string;
  category: string;
  description: string;
  status: 'PENDING' | 'INVESTIGATING' | 'ACTIONED' | 'DISMISSED';
  actionTaken?: string | null;
  createdAt: string;
  reporter: { id: string; email: string; role: string };
  reportedUser: { id: string; email: string; role: string; status: string };
}

export default function AdminContentPage() {
  const [activeTab, setActiveTab] = useState<'categories' | 'featured' | 'reviews' | 'reports'>(
    'categories',
  );

  // Categories state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catCommissionBps, setCatCommissionBps] = useState(1500);
  const [catRequiresLicense, setCatRequiresLicense] = useState(false);
  const [catIsActive, setCatIsActive] = useState(true);
  const [catSubmitting, setCatSubmitting] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Featured Providers state
  const [featuredProviders, setFeaturedProviders] = useState<FeaturedProviderItem[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  const [unfeatureTarget, setUnfeatureTarget] = useState<FeaturedProviderItem | null>(null);
  const [featureReason, setFeatureReason] = useState('');
  const [isSubmittingFeature, setIsSubmittingFeature] = useState(false);

  // Reviews Moderation state
  const [reviews, setReviews] = useState<ReviewModerationItem[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [moderateReviewTarget, setModerateReviewTarget] = useState<ReviewModerationItem | null>(
    null,
  );
  const [moderateAction, setModerateAction] = useState<'PUBLISHED' | 'FLAGGED' | 'REJECTED'>(
    'PUBLISHED',
  );
  const [moderateReason, setModerateReason] = useState('');
  const [isSubmittingReviewMod, setIsSubmittingReviewMod] = useState(false);
  const [reviewModError, setReviewModError] = useState<string | null>(null);

  // Reports state
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const [reportStatusFilter, setReportStatusFilter] = useState('');
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [actionReportTarget, setActionReportTarget] = useState<ReportItem | null>(null);
  const [reportResolutionStatus, setReportResolutionStatus] = useState<'ACTIONED' | 'DISMISSED'>(
    'ACTIONED',
  );
  const [reportActionTaken, setReportActionTaken] = useState('');
  const [reportAdminNotes, setReportAdminNotes] = useState('');
  const [reportSuspendUser, setReportSuspendUser] = useState(false);
  const [isSubmittingReportAction, setIsSubmittingReportAction] = useState(false);
  const [reportActionError, setReportActionError] = useState<string | null>(null);

  // Fetch Categories
  const fetchCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      const data = await apiFetch<CategoryItem[]>('/admin/content/categories');
      setCategories(data || []);
    } catch {
      // Mock categories
      setCategories([
        {
          id: 'cat-ayurveda',
          name: 'Ayurveda & Pulse Diagnosis',
          slug: 'ayurveda-pulse-diagnosis',
          description: 'Traditional Ayurvedic consultations, dosha analysis, and herbal wisdom',
          requiresLicense: true,
          commissionBps: 1500,
          isActive: true,
          _count: { providers: 24, services: 48 },
        },
        {
          id: 'cat-yoga',
          name: 'Pranayama & Yogic Therapy',
          slug: 'pranayama-yogic-therapy',
          description: 'Authentic yogic breathwork, restorative asana, and meditative kriyas',
          requiresLicense: false,
          commissionBps: 1500,
          isActive: true,
          _count: { providers: 32, services: 70 },
        },
      ]);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  // Fetch Featured Providers
  const fetchFeaturedProviders = useCallback(async () => {
    try {
      setIsLoadingFeatured(true);
      const data = await apiFetch<FeaturedProviderItem[]>('/admin/content/providers/featured');
      setFeaturedProviders(data || []);
    } catch {
      setFeaturedProviders([
        {
          id: 'p-1',
          displayName: 'Dr. Ananya Sharma',
          slug: 'dr-ananya-sharma',
          headline: 'Senior Ayurvedic Physician (BAMS, MD) • 14 Years Lineage',
          ratingAvg: 4.95,
          ratingCount: 38,
          bayesianRating: 4.88,
          verificationTier: 'CREDENTIAL_VERIFIED',
          approvalStatus: 'APPROVED',
        },
      ]);
    } finally {
      setIsLoadingFeatured(false);
    }
  }, []);

  // Fetch Reviews
  const fetchReviews = useCallback(async () => {
    try {
      setIsLoadingReviews(true);
      const params = new URLSearchParams();
      params.append('page', String(reviewPage));
      params.append('limit', '10');
      if (reviewStatusFilter) params.append('status', reviewStatusFilter);

      const data = await apiFetch<{
        reviews: ReviewModerationItem[];
        total: number;
        page: number;
      }>(`/admin/content/reviews?${params.toString()}`);

      setReviews(data.reviews || []);
      setReviewTotal(data.total || 0);
    } catch {
      setReviews([
        {
          id: 'rev-1',
          rating: 5,
          comment:
            'Dr. Ananya identified my vata imbalance with remarkable precision. Deeply transformative.',
          tags: ['calming', 'punctual', 'knowledgeable'],
          moderationStatus: 'PENDING',
          isPublished: true,
          createdAt: new Date().toISOString(),
          consumer: { id: 'c-1', email: 'seeker.aarav@example.com' },
          provider: { id: 'p-1', email: 'dr.ananya@sanctuary.test' },
        },
      ]);
      setReviewTotal(1);
    } finally {
      setIsLoadingReviews(false);
    }
  }, [reviewPage, reviewStatusFilter]);

  // Fetch Reports
  const fetchReports = useCallback(async () => {
    try {
      setIsLoadingReports(true);
      const params = new URLSearchParams();
      params.append('page', String(reportPage));
      params.append('limit', '10');
      if (reportStatusFilter) params.append('status', reportStatusFilter);

      const data = await apiFetch<{
        reports: ReportItem[];
        total: number;
        page: number;
      }>(`/admin/content/reports?${params.toString()}`);

      setReports(data.reports || []);
      setReportTotal(data.total || 0);
    } catch {
      setReports([]);
      setReportTotal(0);
    } finally {
      setIsLoadingReports(false);
    }
  }, [reportPage, reportStatusFilter]);

  useEffect(() => {
    if (activeTab === 'categories') fetchCategories();
    else if (activeTab === 'featured') fetchFeaturedProviders();
    else if (activeTab === 'reviews') fetchReviews();
    else if (activeTab === 'reports') fetchReports();
  }, [activeTab, fetchCategories, fetchFeaturedProviders, fetchReviews, fetchReports]);

  // Upsert Category
  const handleSaveCategory = async () => {
    if (!catName.trim() || !catSlug.trim()) {
      setCatError('Category name and URL slug are required.');
      return;
    }

    try {
      setCatSubmitting(true);
      setCatError(null);

      const payload = {
        name: catName.trim(),
        slug: catSlug.trim(),
        description: catDescription.trim() || undefined,
        requiresLicense: catRequiresLicense,
        commissionBps: catCommissionBps,
        isActive: catIsActive,
      };

      if (editingCategory) {
        await apiFetch(`/admin/content/categories/${editingCategory.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/admin/content/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setCategoryModalOpen(false);
      setEditingCategory(null);
      fetchCategories();
    } catch (err: unknown) {
      setCatError((err as Error)?.message || 'Failed to save category.');
    } finally {
      setCatSubmitting(false);
    }
  };

  // Toggle Featured Provider
  const handleToggleFeatured = async () => {
    if (!unfeatureTarget) return;
    if (!featureReason.trim() || featureReason.trim().length < 5) {
      alert('Audit compliance requires a reason of at least 5 characters.');
      return;
    }

    try {
      setIsSubmittingFeature(true);
      await apiFetch('/admin/content/providers/featured', {
        method: 'PATCH',
        body: JSON.stringify({
          providerId: unfeatureTarget.id,
          isFeatured: false,
          reason: featureReason.trim(),
        }),
      });

      setUnfeatureTarget(null);
      setFeatureReason('');
      fetchFeaturedProviders();
    } catch {
      alert('Failed to update featured status.');
    } finally {
      setIsSubmittingFeature(false);
    }
  };

  // Moderate Review Action
  const handleSubmitReviewModeration = async () => {
    if (!moderateReviewTarget) return;
    if (!moderateReason.trim() || moderateReason.trim().length < 5) {
      setReviewModError('Audit reason must be at least 5 characters.');
      return;
    }

    try {
      setIsSubmittingReviewMod(true);
      setReviewModError(null);

      await apiFetch(`/admin/content/reviews/${moderateReviewTarget.id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: moderateAction,
          reason: moderateReason.trim(),
        }),
      });

      setModerateReviewTarget(null);
      setModerateReason('');
      fetchReviews();
    } catch (err: unknown) {
      setReviewModError((err as Error)?.message || 'Failed to moderate review.');
    } finally {
      setIsSubmittingReviewMod(false);
    }
  };

  // Action Report
  const handleSubmitReportAction = async () => {
    if (!actionReportTarget) return;
    if (!reportActionTaken.trim() || reportActionTaken.trim().length < 5) {
      setReportActionError('Action taken rationale must be at least 5 characters.');
      return;
    }

    try {
      setIsSubmittingReportAction(true);
      setReportActionError(null);

      await apiFetch(`/admin/content/reports/${actionReportTarget.id}/action`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: reportResolutionStatus,
          actionTaken: reportActionTaken.trim(),
          adminNotes: reportAdminNotes.trim() || undefined,
          suspendUser: reportSuspendUser,
        }),
      });

      setActionReportTarget(null);
      setReportActionTaken('');
      setReportAdminNotes('');
      setReportSuspendUser(false);
      fetchReports();
    } catch (err: unknown) {
      setReportActionError((err as Error)?.message || 'Failed to submit report action.');
    } finally {
      setIsSubmittingReportAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-light text-stone-100 tracking-tight">
            Content, Taxonomy & Moderation
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Category commissions, featured curation, and seeker/practitioner trust moderation
            queues.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (activeTab === 'categories') fetchCategories();
              else if (activeTab === 'featured') fetchFeaturedProviders();
              else if (activeTab === 'reviews') fetchReviews();
              else fetchReports();
            }}
            className="border-stone-800 text-stone-300 hover:bg-stone-900"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>

          {activeTab === 'categories' && (
            <Button
              onClick={() => {
                setEditingCategory(null);
                setCatName('');
                setCatSlug('');
                setCatDescription('');
                setCatCommissionBps(1500);
                setCatRequiresLicense(false);
                setCatIsActive(true);
                setCatError(null);
                setCategoryModalOpen(true);
              }}
              className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Category
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-800 space-x-6 text-sm">
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'categories'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          Categories & Fees
        </button>
        <button
          onClick={() => setActiveTab('featured')}
          className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'featured'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Star className="w-4 h-4" />
          Featured Curations
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'reviews'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Review Moderation
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Flag className="w-4 h-4" />
          User Grievance Reports
        </button>
      </div>

      {/* TAB 1: CATEGORIES */}
      {activeTab === 'categories' && (
        <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-300">
              <thead className="bg-stone-950/80 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Category Name & Slug</th>
                  <th className="py-3 px-4 font-medium">Commission Rate</th>
                  <th className="py-3 px-4 font-medium">License Mandate</th>
                  <th className="py-3 px-4 font-medium">Practitioners / Services</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {isLoadingCategories ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-stone-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                      Loading category taxonomy...
                    </td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-stone-500">
                      No categories created yet.
                    </td>
                  </tr>
                ) : (
                  categories.map((c) => (
                    <tr key={c.id} className="hover:bg-stone-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-stone-200">{c.name}</div>
                        <div className="text-xs text-stone-500 font-mono">/{c.slug}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-amber-400">
                        {(c.commissionBps / 100).toFixed(1)}% ({c.commissionBps} bps)
                      </td>
                      <td className="py-3 px-4">
                        {c.requiresLicense ? (
                          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Required (BAMS/AYUSH)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-stone-700 text-stone-400">
                            Optional
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-stone-400">
                        {c._count?.providers || 0} practitioners &bull; {c._count?.services || 0}{' '}
                        services
                      </td>
                      <td className="py-3 px-4">
                        {c.isActive ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-stone-800 text-stone-400">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingCategory(c);
                            setCatName(c.name);
                            setCatSlug(c.slug);
                            setCatDescription(c.description || '');
                            setCatCommissionBps(c.commissionBps);
                            setCatRequiresLicense(c.requiresLicense);
                            setCatIsActive(c.isActive);
                            setCatError(null);
                            setCategoryModalOpen(true);
                          }}
                          className="h-8 text-stone-300 hover:text-amber-400 hover:bg-stone-800"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: FEATURED PROVIDERS */}
      {activeTab === 'featured' && (
        <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-300">
              <thead className="bg-stone-950/80 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Practitioner</th>
                  <th className="py-3 px-4 font-medium">Headline</th>
                  <th className="py-3 px-4 font-medium">Ratings</th>
                  <th className="py-3 px-4 font-medium">Verification</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {isLoadingFeatured ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-stone-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                      Loading featured practitioners...
                    </td>
                  </tr>
                ) : featuredProviders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-stone-500">
                      No featured practitioners selected. Feature practitioners via the Users
                      console.
                    </td>
                  </tr>
                ) : (
                  featuredProviders.map((p) => (
                    <tr key={p.id} className="hover:bg-stone-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-stone-200">{p.displayName}</div>
                        <div className="text-xs text-stone-500 font-mono">
                          /practitioner/{p.slug}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-stone-400 max-w-sm truncate">
                        {p.headline || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="text-amber-400 font-medium">
                          ★ {p.ratingAvg?.toFixed(1) || '0.0'}
                        </span>{' '}
                        <span className="text-stone-500">({p.ratingCount || 0} reviews)</span>
                        <div className="text-[10px] text-stone-500 font-mono">
                          Bayesian: {p.bayesianRating?.toFixed(2) || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs">
                          {p.verificationTier}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setUnfeatureTarget(p);
                            setFeatureReason('');
                          }}
                          className="h-8 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                        >
                          Remove Feature
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: REVIEW MODERATION */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
            <CardContent className="p-4 flex items-center justify-between">
              <select
                value={reviewStatusFilter}
                onChange={(e) => {
                  setReviewStatusFilter(e.target.value);
                  setReviewPage(1);
                }}
                className="bg-stone-950/60 border border-stone-800 rounded-md px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
              >
                <option value="" className="bg-stone-900">
                  All Reviews
                </option>
                <option value="PENDING" className="bg-stone-900">
                  Pending Review
                </option>
                <option value="FLAGGED" className="bg-stone-900">
                  Automated Flagged
                </option>
                <option value="PUBLISHED" className="bg-stone-900">
                  Published
                </option>
                <option value="REJECTED" className="bg-stone-900">
                  Rejected
                </option>
              </select>
              <div className="text-xs text-stone-400">
                Queue Total: <strong className="text-stone-200">{reviewTotal}</strong>
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-stone-300">
                <thead className="bg-stone-950/80 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">Rating & Feedback</th>
                    <th className="py-3 px-4 font-medium">Seeker</th>
                    <th className="py-3 px-4 font-medium">Practitioner</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Moderation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/60">
                  {isLoadingReviews ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                        Loading reviews queue...
                      </td>
                    </tr>
                  ) : reviews.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-stone-500">
                        No reviews pending moderation.
                      </td>
                    </tr>
                  ) : (
                    reviews.map((r) => (
                      <tr key={r.id} className="hover:bg-stone-800/30 transition-colors">
                        <td className="py-3 px-4 max-w-md">
                          <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
                            {'★'.repeat(r.rating)}
                            <span className="text-xs text-stone-500">({r.rating}/5)</span>
                          </div>
                          <p className="text-stone-300 text-xs italic">
                            &ldquo;{r.comment || 'No written comment provided.'}&rdquo;
                          </p>
                          {r.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {r.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] bg-stone-800 px-1.5 py-0.5 rounded text-stone-400 font-mono"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="text-stone-200">{r.consumer.email}</div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="text-stone-200">{r.provider.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            className={`text-xs ${
                              r.moderationStatus === 'PUBLISHED'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : r.moderationStatus === 'FLAGGED'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {r.moderationStatus}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setModerateReviewTarget(r);
                                setModerateAction('PUBLISHED');
                                setModerateReason('');
                                setReviewModError(null);
                              }}
                              className="h-7 text-xs text-emerald-400 hover:bg-emerald-950/40"
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setModerateReviewTarget(r);
                                setModerateAction('REJECTED');
                                setModerateReason('');
                                setReviewModError(null);
                              }}
                              className="h-7 text-xs text-rose-400 hover:bg-rose-950/40"
                            >
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: USER REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md">
            <CardContent className="p-4 flex items-center justify-between">
              <select
                value={reportStatusFilter}
                onChange={(e) => {
                  setReportStatusFilter(e.target.value);
                  setReportPage(1);
                }}
                className="bg-stone-950/60 border border-stone-800 rounded-md px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
              >
                <option value="" className="bg-stone-900">
                  All Grievances
                </option>
                <option value="PENDING" className="bg-stone-900">
                  Pending Review
                </option>
                <option value="INVESTIGATING" className="bg-stone-900">
                  Investigating
                </option>
                <option value="ACTIONED" className="bg-stone-900">
                  Actioned
                </option>
                <option value="DISMISSED" className="bg-stone-900">
                  Dismissed
                </option>
              </select>
              <div className="text-xs text-stone-400">
                Total Grievance Reports: <strong className="text-stone-200">{reportTotal}</strong>
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-800 bg-stone-900/60 backdrop-blur-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-stone-300">
                <thead className="bg-stone-950/80 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">Category</th>
                    <th className="py-3 px-4 font-medium">Allegation Details</th>
                    <th className="py-3 px-4 font-medium">Reporter</th>
                    <th className="py-3 px-4 font-medium">Target User</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/60">
                  {isLoadingReports ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                        Loading reports queue...
                      </td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-stone-500">
                        Zero unresolved reports. Trust & Safety incident queue is clean.
                      </td>
                    </tr>
                  ) : (
                    reports.map((rpt) => (
                      <tr key={rpt.id} className="hover:bg-stone-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 font-mono text-xs">
                            {rpt.category}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-xs text-stone-300 max-w-sm">
                          {rpt.description}
                        </td>
                        <td className="py-3 px-4 text-xs text-stone-400">
                          {rpt.reporter.email} ({rpt.reporter.role})
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="text-stone-200">{rpt.reportedUser.email}</div>
                          <div className="text-[11px] text-stone-500">
                            {rpt.reportedUser.status}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className="border-stone-700 text-stone-400 text-xs"
                          >
                            {rpt.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {rpt.status === 'PENDING' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setActionReportTarget(rpt);
                                setReportResolutionStatus('ACTIONED');
                                setReportActionTaken('');
                                setReportAdminNotes('');
                                setReportSuspendUser(false);
                                setReportActionError(null);
                              }}
                              className="h-8 bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
                            >
                              Investigate & Action
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
              <div>
                Showing {reports.length} of {reportTotal} reports
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reportPage <= 1}
                  onClick={() => setReportPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2 border-stone-800 text-stone-300 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Prev
                </Button>
                <span className="px-2">Page {reportPage}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reports.length < 10}
                  onClick={() => setReportPage((p) => p + 1)}
                  className="h-8 px-2 border-stone-800 text-stone-300 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-serif text-stone-100">
                {editingCategory ? 'Edit Taxonomy Category' : 'Create Taxonomy Category'}
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCategoryModalOpen(false)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Category Name <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={catName}
                  onChange={(e) => {
                    setCatName(e.target.value);
                    if (!editingCategory) {
                      setCatSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, ''),
                      );
                    }
                  }}
                  placeholder="e.g. Ayurveda & Pulse Diagnosis"
                  className="bg-stone-950 border-stone-800 text-stone-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  URL Slug <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={catSlug}
                  onChange={(e) => setCatSlug(e.target.value)}
                  placeholder="e.g. ayurveda-pulse-diagnosis"
                  className="bg-stone-950 border-stone-800 text-stone-200 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Commission Rate (Basis Points)
                </label>
                <Input
                  type="number"
                  value={catCommissionBps}
                  onChange={(e) => setCatCommissionBps(parseInt(e.target.value, 10) || 0)}
                  placeholder="1500 (15%)"
                  className="bg-stone-950 border-stone-800 text-stone-200"
                />
                <span className="text-[11px] text-stone-500">
                  {(catCommissionBps / 100).toFixed(2)}% platform take rate
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="Holistic discipline overview..."
                  className="w-full bg-stone-950 border border-stone-800 rounded p-2 text-xs text-stone-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="reqLicense"
                  checked={catRequiresLicense}
                  onChange={(e) => setCatRequiresLicense(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-0"
                />
                <label htmlFor="reqLicense" className="text-xs text-stone-300 cursor-pointer">
                  Require official government/institutional license verification (AYUSH / Medical)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="catActive"
                  checked={catIsActive}
                  onChange={(e) => setCatIsActive(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-0"
                />
                <label htmlFor="catActive" className="text-xs text-stone-300 cursor-pointer">
                  Category is Active for seekers & bookings
                </label>
              </div>

              {catError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
                  {catError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setCategoryModalOpen(false)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCategory}
                disabled={catSubmitting}
                className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
              >
                {catSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Category'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW MODERATION MODAL */}
      {moderateReviewTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-serif text-stone-100">Moderate Review</h3>
                <p className="text-xs text-stone-400 font-mono mt-0.5">
                  ID: {moderateReviewTarget.id}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setModerateReviewTarget(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Determination Status
                </label>
                <select
                  value={moderateAction}
                  onChange={(e) =>
                    setModerateAction(e.target.value as 'PUBLISHED' | 'FLAGGED' | 'REJECTED')
                  }
                  className="w-full bg-stone-950 border border-stone-800 rounded-md p-2 text-sm text-stone-200"
                >
                  <option value="PUBLISHED">Approve & Publish to Profile</option>
                  <option value="FLAGGED">Flag for Compliance Review</option>
                  <option value="REJECTED">Reject (Profanity / Fake Pattern)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mandatory Audit Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={moderateReason}
                  onChange={(e) => setModerateReason(e.target.value)}
                  placeholder="State the audit rationale for this moderation determination (min 5 chars)..."
                  className="w-full bg-stone-950 border border-stone-800 rounded p-2 text-xs text-stone-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              {reviewModError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
                  {reviewModError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setModerateReviewTarget(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitReviewModeration}
                disabled={isSubmittingReviewMod}
                className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
              >
                {isSubmittingReviewMod ? 'Submitting...' : 'Confirm Determination'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT ACTION MODAL */}
      {actionReportTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-serif text-stone-100">Grievance Determination</h3>
                <p className="text-xs text-stone-400 font-mono mt-0.5">
                  Report: {actionReportTarget.id}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActionReportTarget(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Determination Status
                </label>
                <select
                  value={reportResolutionStatus}
                  onChange={(e) =>
                    setReportResolutionStatus(e.target.value as 'ACTIONED' | 'DISMISSED')
                  }
                  className="w-full bg-stone-950 border border-stone-800 rounded-md p-2 text-sm text-stone-200"
                >
                  <option value="ACTIONED">Actioned (Violation Verified)</option>
                  <option value="DISMISSED">Dismissed (No Violation Found)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Action Taken Rationale <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={reportActionTaken}
                  onChange={(e) => setReportActionTaken(e.target.value)}
                  placeholder="Detail the enforcement findings and action taken..."
                  className="w-full bg-stone-950 border border-stone-800 rounded p-2 text-xs text-stone-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="suspUser"
                  checked={reportSuspendUser}
                  onChange={(e) => setReportSuspendUser(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-rose-500 focus:ring-0"
                />
                <label
                  htmlFor="suspUser"
                  className="text-xs text-rose-400 font-medium cursor-pointer"
                >
                  Suspend reported user account ({actionReportTarget.reportedUser.email})
                  immediately
                </label>
              </div>

              {reportActionError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
                  {reportActionError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setActionReportTarget(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitReportAction}
                disabled={isSubmittingReportAction}
                className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium"
              >
                {isSubmittingReportAction ? 'Executing...' : 'Enforce Report Action'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* UNFEATURE PROVIDER MODAL */}
      {unfeatureTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-serif text-stone-100">Remove Featured Spotlight</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUnfeatureTarget(null)}
                className="text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-xs text-stone-300">
              Are you sure you want to remove featured spotlight for{' '}
              <strong>{unfeatureTarget.displayName}</strong>?
            </p>
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Mandatory Audit Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={2}
                value={featureReason}
                onChange={(e) => setFeatureReason(e.target.value)}
                placeholder="State reason for removing spotlight (min 5 chars)..."
                className="w-full bg-stone-950 border border-stone-800 rounded p-2 text-xs text-stone-200 focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setUnfeatureTarget(null)}
                className="border-stone-800 text-stone-300 hover:bg-stone-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleToggleFeatured}
                disabled={isSubmittingFeature}
                className="bg-rose-600 hover:bg-rose-500 text-white font-medium"
              >
                {isSubmittingFeature ? 'Updating...' : 'Confirm Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
