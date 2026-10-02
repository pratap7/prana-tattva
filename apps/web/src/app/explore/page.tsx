import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { ExploreView } from '@/components/discovery/explore-view';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Explore Holistic Practitioners & Live Sessions | Project Nirvana',
  description:
    'Discover vetted yoga guides, Reiki healers, clinical psychotherapists, and Vedic astrologers. Filter by modality, price, availability, and session format.',
  alternates: {
    canonical: '/explore',
  },
};

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-xs text-muted-foreground mt-3 font-serif">
            Opening sanctuary portal...
          </p>
        </div>
      }
    >
      <ExploreView />
    </Suspense>
  );
}
