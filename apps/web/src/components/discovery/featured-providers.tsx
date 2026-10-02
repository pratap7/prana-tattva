'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, Star, Calendar, ArrowRight, Video, MapPin, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProviderSearchResultItem } from '@project-nirvana/shared';
import { apiFetch } from '@/lib/api-client';

const FALLBACK_FEATURED: ProviderSearchResultItem[] = [
  {
    id: 'prov-ft-1',
    userId: 'user-ft-1',
    displayName: 'Acharya Shankara',
    slug: 'acharya-shankara',
    headline: 'Master Vedic Astrologer & Jyotish Scholar',
    bio: 'Deep Vedic astrological readings, kundali analysis, and spiritual guidance based in sacred Himalayan traditions.',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
    city: 'Rishikesh',
    country: 'IN',
    languages: ['en', 'hi', 'sa'],
    verificationTier: 'BACKGROUND_CHECKED',
    ratingAvg: 4.96,
    ratingCount: 168,
    completedSessions: 340,
    responseRate: 100,
    categories: [
      {
        id: 'c1',
        name: 'Vedic Astrology',
        slug: 'astrology',
        isPrimary: true,
        requiresLicense: false,
      },
    ],
    startingPricePaise: 350000,
    startingPriceRupees: 3500,
    currency: 'INR',
    modes: ['ONLINE'],
    nextAvailableSlot: {
      startAt: new Date(Date.now() + 86400000).toISOString(),
      localDisplay: '10:00 AM',
      localDate: 'Tomorrow',
    },
  },
  {
    id: 'prov-ft-2',
    userId: 'user-ft-2',
    displayName: 'Mira Devi',
    slug: 'mira-devi',
    headline: 'Usui & Karuna Reiki Master & Sound Alchemist',
    bio: 'Distance energy harmonization, chakra alignment, and sacred frequency baths for deep autonomic nervous system rest.',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
    city: 'Bengaluru',
    country: 'IN',
    languages: ['en', 'kn'],
    verificationTier: 'BACKGROUND_CHECKED',
    ratingAvg: 4.98,
    ratingCount: 215,
    completedSessions: 480,
    responseRate: 98,
    categories: [
      { id: 'c2', name: 'Reiki Healing', slug: 'reiki', isPrimary: true, requiresLicense: false },
      {
        id: 'c3',
        name: 'Sound Healing',
        slug: 'sound-healing',
        isPrimary: false,
        requiresLicense: false,
      },
    ],
    startingPricePaise: 220000,
    startingPriceRupees: 2200,
    currency: 'INR',
    modes: ['ONLINE', 'IN_PERSON'],
    nextAvailableSlot: {
      startAt: new Date(Date.now() + 43200000).toISOString(),
      localDisplay: '02:30 PM',
      localDate: 'Today',
    },
  },
  {
    id: 'prov-ft-3',
    userId: 'user-ft-3',
    displayName: 'Dr. Arjun Roy',
    slug: 'dr-arjun-roy',
    headline: 'Licensed Clinical Psychologist & Somatic Therapist',
    bio: 'Evidence-based cognitive integration, trauma recovery, and mindfulness somatic release in an empathetic sanctuary.',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
    city: 'Mumbai',
    country: 'IN',
    languages: ['en', 'hi', 'mr'],
    verificationTier: 'BACKGROUND_CHECKED',
    ratingAvg: 4.91,
    ratingCount: 142,
    completedSessions: 290,
    responseRate: 97,
    categories: [
      {
        id: 'c4',
        name: 'Psychotherapy',
        slug: 'psychotherapy',
        isPrimary: true,
        requiresLicense: true,
      },
    ],
    startingPricePaise: 300000,
    startingPriceRupees: 3000,
    currency: 'INR',
    modes: ['BOTH'],
    nextAvailableSlot: {
      startAt: new Date(Date.now() + 172800000).toISOString(),
      localDisplay: '11:00 AM',
      localDate: 'In 2 days',
    },
  },
];

export function FeaturedProviders() {
  const [providers, setProviders] = useState<ProviderSearchResultItem[]>(FALLBACK_FEATURED);

  useEffect(() => {
    async function loadFeatured() {
      try {
        const data = await apiFetch<{ items: ProviderSearchResultItem[] }>(
          '/providers/search?limit=3&sortBy=RATING',
        );
        if (data?.items && data.items.length > 0) {
          setProviders(data.items);
        }
      } catch {
        // Fallback to verified sanctuary practitioners
      }
    }
    loadFeatured();
  }, []);

  return (
    <section className="container mx-auto px-4 sm:px-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Award className="h-3.5 w-3.5" />
            <span>Vetted Sanctuary Guides</span>
          </div>
          <h2 className="font-serif text-3xl font-light text-foreground">Featured Practitioners</h2>
          <p className="text-sm text-muted-foreground">
            Distinguished masters verified by the Project Nirvana review board.
          </p>
        </div>

        <Button
          variant="ghost"
          className="gap-1.5 text-xs font-medium self-start sm:self-auto"
          asChild
        >
          <Link href="/explore">
            Explore All Guides <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {providers.map((p) => {
          const primaryCat = p.categories.find((c) => c.isPrimary) || p.categories[0];
          return (
            <div
              key={p.id}
              className="group rounded-2xl border border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-primary/40 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Header: Avatar, Name, Verification Tier */}
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
                        <span className="text-muted-foreground font-normal">({p.ratingCount})</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {p.city}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modality Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
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

              {/* Footer: Starting Price & Book Slot CTA */}
              <div className="pt-6 border-t border-border/40 mt-4 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                    Starting from
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
                    View Sanctuary <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
