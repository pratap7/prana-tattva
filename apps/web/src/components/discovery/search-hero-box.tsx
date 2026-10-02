'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Compass, Sparkles, Calendar, Video, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const POPULAR_CATEGORIES = [
  { slug: '', label: 'All Modalities' },
  { slug: 'yoga', label: 'Yoga & Breathwork' },
  { slug: 'reiki', label: 'Reiki & Energy Healing' },
  { slug: 'astrology', label: 'Vedic Astrology' },
  { slug: 'psychotherapy', label: 'Psychotherapy' },
  { slug: 'sound-healing', label: 'Sound Therapy' },
  { slug: 'ayurveda', label: 'Ayurveda' },
];

interface QuickChip {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  params: Record<string, string>;
}

const QUICK_CHIPS: QuickChip[] = [
  { label: 'Available Today', icon: Calendar, params: { availability: 'TODAY' } },
  { label: 'Online HD Video', icon: Video, params: { mode: 'ONLINE' } },
  { label: 'Top Rated (4.8+)', icon: Star, params: { minRating: '4.8' } },
  { label: 'Under ₹2,000', icon: Sparkles, params: { maxPrice: '2000' } },
];

export function SearchHeroBox() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('q', keyword.trim());
    if (category) params.set('category', category);
    router.push(`/explore?${params.toString()}`);
  };

  const handleChipClick = (chipParams: Record<string, string>) => {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('q', keyword.trim());
    if (category) params.set('category', category);
    for (const [key, val] of Object.entries(chipParams)) {
      params.set(key, val);
    }
    router.push(`/explore?${params.toString()}`);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {/* Search Input Box */}
      <form
        onSubmit={handleSearch}
        className="flex flex-col sm:flex-row items-center gap-2 p-2 bg-card/95 border border-border/80 rounded-2xl sm:rounded-full shadow-lg backdrop-blur-md transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20"
      >
        <div className="flex items-center gap-3 px-4 w-full sm:w-auto flex-1">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="What are you looking for? (e.g. Reiki, Kundali, Yoga, Anxiety)"
            className="w-full bg-transparent py-2.5 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="w-full sm:w-auto h-px sm:h-8 bg-border/80 my-1 sm:my-0" />

        <div className="flex items-center gap-2 px-3 w-full sm:w-auto">
          <Compass className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full sm:w-auto bg-transparent py-2 text-xs sm:text-sm text-foreground focus:outline-none cursor-pointer"
          >
            {POPULAR_CATEGORIES.map((cat) => (
              <option key={cat.slug} value={cat.slug} className="bg-card text-foreground">
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto rounded-xl sm:rounded-full px-7 font-medium gap-2 shrink-0 bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm"
        >
          <Search className="h-4 w-4" />
          <span>Seek Guide</span>
        </Button>
      </form>

      {/* Quick Search Filter Chips */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">Popular:</span>
        {QUICK_CHIPS.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleChipClick(chip.params)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-secondary/50 hover:bg-secondary hover:border-primary/40 text-xs font-medium text-foreground transition-all hover:scale-[1.02]"
            >
              <Icon className="h-3.5 w-3.5 text-primary" />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
