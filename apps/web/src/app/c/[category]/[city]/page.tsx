import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, MapPin } from 'lucide-react';
import { ExploreView } from '@/components/discovery/explore-view';

const CATEGORY_NAMES: Record<string, { name: string; compliance?: string }> = {
  yoga: { name: 'Yoga & Pranayama' },
  reiki: {
    name: 'Reiki & Energy Healing',
    compliance:
      'Sanctuary Wellness Notice: Reiki Healing and subtle energy practices are spiritual self-care modalities and not a substitute for licensed medical or mental healthcare.',
  },
  astrology: {
    name: 'Vedic Astrology & Jyotish',
    compliance:
      'Sanctuary Wellness Notice: Vedic Astrology consultations offer spiritual wisdom and personal introspection, not medical or legal counsel.',
  },
  psychotherapy: { name: 'Psychotherapy & Counseling' },
  'sound-healing': {
    name: 'Sound & Vibration Therapy',
    compliance:
      'Sanctuary Wellness Notice: Sound healing sessions are complementary holistic wellness practices intended for relaxation, not medical diagnosis.',
  },
  ayurveda: {
    name: 'Ayurveda & Dinacharya',
    compliance:
      'Sanctuary Wellness Notice: Ayurvedic lifestyle consultations provide traditional dietary and wellness guidance to complement your healthcare provider.',
  },
  'pranic-healing': {
    name: 'Pranic Healing & Biofield',
    compliance:
      'Sanctuary Wellness Notice: Pranic healing is an energy modality and is not intended to replace standard medical diagnosis and treatment.',
  },
  meditation: { name: 'Meditation & Mindfulness' },
};

function formatCity(citySlug: string): string {
  return citySlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function generateMetadata({
  params,
}: {
  params: { category: string; city: string };
}): Promise<Metadata> {
  const catKey = params.category.toLowerCase();
  const cat = CATEGORY_NAMES[catKey];
  const city = formatCity(params.city);

  if (!cat) {
    return { title: 'Not Found | Project Nirvana' };
  }

  const title = `Top Verified ${cat.name} Practitioners in ${city} | Project Nirvana`;
  const description = `Discover and book top rated, verified ${cat.name} masters in ${city}. In-person sanctuary sessions and live HD video consultations.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/c/${catKey}/${params.city.toLowerCase()}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

export default function CategoryCityLandingPage({
  params,
}: {
  params: { category: string; city: string };
}) {
  const catKey = params.category.toLowerCase();
  const cat = CATEGORY_NAMES[catKey];
  const city = formatCity(params.city);

  if (!cat) {
    notFound();
  }

  // Schema.org JSON-LD Structured Data for Local Area Service
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${cat.name} in ${city}`,
    description: `Verified 1:1 ${cat.name} sessions in ${city}`,
    provider: {
      '@type': 'Organization',
      name: 'Project Nirvana Sanctuary',
      url: 'https://projectnirvana.internal',
    },
    areaServed: {
      '@type': 'City',
      name: city,
    },
  };

  return (
    <div className="space-y-12 py-10 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb & Hero */}
      <section className="container mx-auto px-4 sm:px-8 max-w-5xl space-y-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/explore" className="hover:text-foreground">
            Explore
          </Link>
          <span>/</span>
          <Link href={`/c/${catKey}`} className="hover:text-foreground">
            {cat.name}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{city}</span>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
          <MapPin className="h-3.5 w-3.5" />
          <span>Sanctuary Location: {city}</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-6xl font-light text-foreground tracking-tight leading-[1.15]">
          {cat.name} in <span className="italic font-normal text-primary">{city}</span>
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-3xl leading-relaxed">
          Discover verified, board-reviewed practitioners offering in-person sanctuary sessions and
          live interactive video consultations for seekers in {city}.
        </p>

        {/* Regulatory Compliance Warning */}
        {cat.compliance && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 flex items-start gap-3.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-semibold block">
                Regulatory & Wellness Compliance Notice
              </strong>
              <p className="leading-relaxed opacity-90">{cat.compliance}</p>
            </div>
          </div>
        )}
      </section>

      {/* Explorer Grid */}
      <section className="border-t border-border/60 pt-10">
        <Suspense
          fallback={
            <div className="container mx-auto py-12 text-center text-xs text-muted-foreground">
              Loading guides in {city}...
            </div>
          }
        >
          <ExploreView initialCategory={catKey} />
        </Suspense>
      </section>
    </div>
  );
}
