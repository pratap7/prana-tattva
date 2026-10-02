'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  SlidersHorizontal,
  X,
  Star,
  ShieldCheck,
  Calendar,
  Video,
  MapPin,
  ArrowRight,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ProviderSearchResultItem,
  ProviderSearchResponse,
  SearchFacets,
  SortOption,
} from '@project-nirvana/shared';
import { apiFetch } from '@/lib/api-client';

const MODALITY_OPTIONS = [
  { slug: '', label: 'All Modalities' },
  { slug: 'yoga', label: 'Yoga & Pranayama' },
  { slug: 'reiki', label: 'Reiki & Energy Healing' },
  { slug: 'astrology', label: 'Vedic Astrology' },
  { slug: 'psychotherapy', label: 'Psychotherapy' },
  { slug: 'sound-healing', label: 'Sound Healing' },
  { slug: 'ayurveda', label: 'Ayurveda' },
  { slug: 'pranic-healing', label: 'Pranic Healing' },
  { slug: 'meditation', label: 'Meditation' },
];

const SORT_OPTIONS_DISPLAY: { value: SortOption; label: string }[] = [
  { value: 'RELEVANCE', label: 'Most Relevant' },
  { value: 'RATING', label: 'Highest Rated (Bayesian)' },
  { value: 'PRICE_ASC', label: 'Price: Low to High' },
  { value: 'PRICE_DESC', label: 'Price: High to Low' },
  { value: 'SOONEST_AVAILABILITY', label: 'Soonest Available Slot' },
];

export function ExploreView({ initialCategory }: { initialCategory?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Filter state initialized from URL search params
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || initialCategory || '');
  const [mode, setMode] = useState<string>(searchParams.get('mode') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [minRating, setMinRating] = useState(searchParams.get('minRating') || '');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [verificationTier, setVerificationTier] = useState(
    searchParams.get('verificationTier') || '',
  );
  const [availability, setAvailability] = useState(searchParams.get('availability') || '');
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get('sortBy') as SortOption) || 'RELEVANCE',
  );

  // Results & UI State
  const [providers, setProviders] = useState<ProviderSearchResultItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [facets, setFacets] = useState<SearchFacets | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Sync state to URL
  const syncUrl = useCallback(
    (params: Record<string, string>) => {
      const urlParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) urlParams.set(key, value);
      }
      startTransition(() => {
        router.replace(`/explore?${urlParams.toString()}`, { scroll: false });
      });
    },
    [router],
  );

  // Fetch search results
  const fetchSearchResults = useCallback(
    async (isLoadMore = false) => {
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const queryParams = new URLSearchParams();
        if (keyword.trim()) queryParams.set('q', keyword.trim());
        if (category) queryParams.set('category', category);
        if (mode) queryParams.set('mode', mode);
        if (city) queryParams.set('city', city);
        if (minRating) queryParams.set('minRating', minRating);
        if (minPrice) queryParams.set('minPrice', minPrice);
        if (maxPrice) queryParams.set('maxPrice', maxPrice);
        if (verificationTier) queryParams.set('verificationTier', verificationTier);
        if (availability) queryParams.set('availability', availability);
        if (sortBy) queryParams.set('sortBy', sortBy);
        queryParams.set('limit', '12');

        if (isLoadMore && nextCursor) {
          queryParams.set('cursor', nextCursor);
        }

        const data = await apiFetch<ProviderSearchResponse>(
          `/providers/search?${queryParams.toString()}`,
        );

        if (isLoadMore) {
          setProviders((prev) => [...prev, ...data.items]);
        } else {
          setProviders(data.items);
          setTotalCount(data.totalCount);
          if (data.facets) setFacets(data.facets);
        }
        setNextCursor(data.nextCursor);
      } catch {
        // Fallback to empty on error
        if (!isLoadMore) {
          setProviders([]);
          setTotalCount(0);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [
      keyword,
      category,
      mode,
      city,
      minRating,
      minPrice,
      maxPrice,
      verificationTier,
      availability,
      sortBy,
      nextCursor,
    ],
  );

  // Trigger search on filter change
  useEffect(() => {
    fetchSearchResults(false);
    syncUrl({
      q: keyword,
      category,
      mode,
      city,
      minRating,
      minPrice,
      maxPrice,
      verificationTier,
      availability,
      sortBy,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, mode, city, minRating, minPrice, maxPrice, verificationTier, availability, sortBy]);

  // Handle keyword submit
  const handleKeywordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSearchResults(false);
    syncUrl({
      q: keyword,
      category,
      mode,
      city,
      minRating,
      minPrice,
      maxPrice,
      verificationTier,
      availability,
      sortBy,
    });
  };

  // Reset all filters
  const handleResetFilters = () => {
    setKeyword('');
    setCategory('');
    setMode('');
    setCity('');
    setMinRating('');
    setMinPrice('');
    setMaxPrice('');
    setVerificationTier('');
    setAvailability('');
    setSortBy('RELEVANCE');
    router.replace('/explore');
  };

  const hasActiveFilters = Boolean(
    keyword ||
    category ||
    mode ||
    city ||
    minRating ||
    minPrice ||
    maxPrice ||
    verificationTier ||
    availability ||
    sortBy !== 'RELEVANCE',
  );

  return (
    <div className="container mx-auto px-4 sm:px-8 py-8 space-y-8 max-w-7xl">
      {/* Top Header & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl font-light text-foreground">
              Sanctuary Exploration
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Find verified practitioners, book private 1:1 sessions, and embark on your healing
              journey.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Filter Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMobileFilterOpen(true)}
              className="lg:hidden rounded-xl gap-2 text-xs"
            >
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </Button>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="Sort practitioners by"
                className="h-9 px-3 rounded-xl border border-input bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {SORT_OPTIONS_DISPLAY.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Search Bar */}
        <form onSubmit={handleKeywordSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search by practitioner name, specialty, keywords (e.g. Kundali, Reiki, Anxiety, Breathwork)..."
            className="pl-11 pr-24 py-2.5 h-12 rounded-2xl bg-card border-border/80 text-sm focus-visible:ring-primary"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl text-xs px-4"
          >
            Search
          </Button>
        </form>
      </div>

      {/* Main Layout: Sidebar Filters + Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Desktop Sidebar Filter (Hidden on Mobile) */}
        <aside className="hidden lg:block space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <h2 className="font-serif font-medium text-base text-foreground">Filter Guides</h2>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>

          {/* Availability Window */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Availability</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAvailability(availability === 'TODAY' ? '' : 'TODAY')}
                className={`py-2 px-3 rounded-xl border text-xs text-center transition-all ${
                  availability === 'TODAY'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border/70 hover:border-primary/40 text-muted-foreground'
                }`}
              >
                Available Today
              </button>
              <button
                type="button"
                onClick={() => setAvailability(availability === 'THIS_WEEK' ? '' : 'THIS_WEEK')}
                className={`py-2 px-3 rounded-xl border text-xs text-center transition-all ${
                  availability === 'THIS_WEEK'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border/70 hover:border-primary/40 text-muted-foreground'
                }`}
              >
                This Week
              </button>
            </div>
          </div>

          {/* Modality Category */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Modality</Label>
            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              {MODALITY_OPTIONS.map((cat) => {
                const count = facets?.categories.find((c) => c.slug === cat.slug)?.count ?? null;
                const isSelected = category === cat.slug;
                return (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => setCategory(cat.slug)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span>{cat.label}</span>
                    {count !== null && (
                      <span
                        className={`text-[10px] ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session Format (Mode) */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Session Delivery</Label>
            <div className="space-y-1.5">
              {[
                { value: '', label: 'All Formats' },
                { value: 'ONLINE', label: 'Daily.co HD Video' },
                { value: 'IN_PERSON', label: 'In-Person Sanctuary' },
              ].map((m) => (
                <label
                  key={m.value}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={(e) => setMode(e.target.value)}
                    className="accent-primary"
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Starting Price (₹)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min ₹"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="h-9 text-xs rounded-lg"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="number"
                placeholder="Max ₹"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="h-9 text-xs rounded-lg"
              />
            </div>
          </div>

          {/* City / Location */}
          <div className="space-y-2">
            <Label htmlFor="city-select" className="text-xs font-semibold text-foreground">
              Location
            </Label>
            <select
              id="city-select"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-input bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">All Locations</option>
              {facets?.cities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {/* Minimum Rating */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Minimum Star Rating</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { val: '4.8', label: '4.8 ★' },
                { val: '4.5', label: '4.5 ★' },
                { val: '4.0', label: '4.0 ★' },
              ].map((r) => (
                <button
                  key={r.val}
                  type="button"
                  onClick={() => setMinRating(minRating === r.val ? '' : r.val)}
                  className={`py-1.5 rounded-lg border text-xs text-center transition-all ${
                    minRating === r.val
                      ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                      : 'border-border/70 hover:border-amber-500/40 text-muted-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Verification Tier */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Verification Tier</Label>
            <select
              value={verificationTier}
              onChange={(e) => setVerificationTier(e.target.value)}
              aria-label="Filter by verification tier"
              className="w-full h-9 px-3 rounded-xl border border-input bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">Any Tier</option>
              <option value="BACKGROUND_CHECKED">Background Checked (Highest)</option>
              <option value="CREDENTIAL_VERIFIED">Credential Verified</option>
              <option value="ID_VERIFIED">ID Verified</option>
            </select>
          </div>
        </aside>

        {/* Results Grid Section */}
        <section className="lg:col-span-3 space-y-6">
          {/* Results Summary Bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/40 pb-2">
            <span>
              Showing <strong className="text-foreground font-semibold">{providers.length}</strong>{' '}
              of <strong className="text-foreground font-semibold">{totalCount}</strong> vetted
              practitioners
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-primary hover:underline flex items-center gap-1"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Loading Skeleton */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-muted shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-3/4 bg-muted rounded" />
                      <div className="h-3 w-1/2 bg-muted rounded" />
                    </div>
                  </div>
                  <div className="h-3 w-full bg-muted rounded" />
                  <div className="h-3 w-5/6 bg-muted rounded" />
                  <div className="pt-4 border-t border-border/40 flex justify-between items-center">
                    <div className="h-4 w-1/3 bg-muted rounded" />
                    <div className="h-8 w-24 bg-muted rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && providers.length === 0 && (
            <div className="rounded-3xl border border-border/80 bg-card/60 p-12 text-center space-y-4 max-w-lg mx-auto">
              <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-medium text-foreground">
                No sanctuary practitioners matched
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We couldn&apos;t find any verified guides matching all your selected criteria. Try
                broadening your filters or searching for alternative keywords.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="rounded-xl gap-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
              </Button>
            </div>
          )}

          {/* Results Grid */}
          {!isLoading && providers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {providers.map((p) => {
                const primaryCat = p.categories.find((c) => c.isPrimary) || p.categories[0];
                return (
                  <div
                    key={p.id}
                    className="group rounded-2xl border border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-primary/40 flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      {/* Practitioner Avatar, Name, Tier */}
                      <div className="flex items-start gap-4">
                        <div className="relative h-14 w-14 shrink-0 rounded-2xl overflow-hidden bg-muted border border-border/60">
                          {p.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.avatarUrl}
                              alt={p.displayName}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary font-serif font-bold text-lg">
                              {p.displayName.charAt(0)}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-serif font-medium text-base text-foreground truncate group-hover:text-primary transition-colors">
                              {p.displayName}
                            </h3>
                            {p.verificationTier === 'BACKGROUND_CHECKED' && (
                              <span title="Background Checked">
                                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{p.headline}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
                            <span className="flex items-center gap-1 text-foreground font-medium">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                              {p.ratingAvg.toFixed(1)}
                              <span className="text-muted-foreground font-normal">
                                ({p.ratingCount})
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {p.city}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Modality Chips & Session Modes */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {primaryCat && (
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {primaryCat.name}
                          </Badge>
                        )}
                        {p.modes.includes('ONLINE') && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground px-2 py-0.5 rounded bg-muted/60">
                            <Video className="h-3 w-3 text-primary" /> Online
                          </span>
                        )}
                      </div>

                      {/* Bio snippet */}
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {p.bio}
                      </p>
                    </div>

                    {/* Footer: Starting Price & Next Slot */}
                    <div className="pt-6 border-t border-border/40 mt-4 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                          From
                        </span>
                        <span className="font-serif font-semibold text-foreground text-sm">
                          ₹{p.startingPriceRupees.toLocaleString('en-IN')}
                        </span>
                        {p.nextAvailableSlot && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3" />
                            {p.nextAvailableSlot.localDate} at {p.nextAvailableSlot.localDisplay}
                          </span>
                        )}
                      </div>

                      <Button size="sm" asChild className="rounded-xl text-xs gap-1.5 font-medium">
                        <Link href={`/providers/${p.slug}`}>
                          Book Slot <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cursor Pagination: Load More Button */}
          {!isLoading && nextCursor && (
            <div className="text-center pt-8">
              <Button
                variant="outline"
                size="lg"
                onClick={() => fetchSearchResults(true)}
                disabled={isLoadingMore}
                className="rounded-2xl px-8 text-xs font-semibold gap-2"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Summoning more guides...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Practitioners</span>
                    <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Mobile Filter Slide-Over Drawer */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-card h-full p-6 shadow-2xl overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h3 className="font-serif font-medium text-base text-foreground">Filter Guides</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileFilterOpen(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile Filters Body */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Modality</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-input bg-card text-xs text-foreground focus:outline-none"
                >
                  {MODALITY_OPTIONS.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Delivery Format</Label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-input bg-card text-xs text-foreground focus:outline-none"
                >
                  <option value="">All Formats</option>
                  <option value="ONLINE">Daily.co Live HD Video</option>
                  <option value="IN_PERSON">In-Person Sanctuary</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Location</Label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-input bg-card text-xs text-foreground focus:outline-none"
                >
                  <option value="">All Locations</option>
                  {facets?.cities.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Min Rating</Label>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-input bg-card text-xs text-foreground focus:outline-none"
                >
                  <option value="">Any Rating</option>
                  <option value="4.8">4.8+ Stars</option>
                  <option value="4.5">4.5+ Stars</option>
                  <option value="4.0">4.0+ Stars</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-border/60 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="w-1/2 rounded-xl text-xs"
              >
                Reset
              </Button>
              <Button
                size="sm"
                onClick={() => setIsMobileFilterOpen(false)}
                className="w-1/2 rounded-xl text-xs"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
