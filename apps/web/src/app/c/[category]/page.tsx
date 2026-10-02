import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, AlertTriangle, MapPin } from 'lucide-react';
import { ExploreView } from '@/components/discovery/explore-view';

interface CategoryConfig {
  name: string;
  sanskrit: string;
  tagline: string;
  description: string;
  requiresLicense: boolean;
  complianceWarning?: string;
  cities: string[];
}

const CATEGORY_MAP: Record<string, CategoryConfig> = {
  yoga: {
    name: 'Yoga & Pranayama',
    sanskrit: 'योग & प्राणायाम (Yoking & Breath Regulation)',
    tagline: 'Somatic postural alignment, vital prana expansion, and inner stillness.',
    description:
      'Explore classical Hatha, Vinyasa, Yin, and Ashtanga yoga guided 1-on-1 by certified Himalayan teachers and master sadhakas. Cultivate nervous system resilience and mental equilibrium.',
    requiresLicense: false,
    cities: ['Rishikesh', 'Goa', 'Bengaluru', 'Mumbai', 'Delhi'],
  },
  reiki: {
    name: 'Reiki & Energy Healing',
    sanskrit: 'ऊर्जा चिकित्सा (Pranic Aura Revitalization)',
    tagline: 'Non-touch subtle body attunement, chakra balancing, and energetic release.',
    description:
      'Connect with certified Usui and Karuna Reiki Master teachers for private distance or in-person sessions designed to dissolve energetic blockages and restore systemic harmony.',
    requiresLicense: false,
    complianceWarning:
      'Sanctuary Wellness Notice: Reiki Healing and subtle energy practices are spiritual self-care modalities. They are not a substitute for licensed medical or psychological diagnosis, treatment, or therapy.',
    cities: ['Bengaluru', 'Mumbai', 'Pune', 'Delhi', 'Chennai'],
  },
  astrology: {
    name: 'Vedic Astrology & Jyotish',
    sanskrit: 'ज्योतिष (The Sacred Science of Light)',
    tagline: 'Cosmic transit analysis, planetary alignments, and karmic life blueprints.',
    description:
      'Consult with master Jyotish scholars for birth chart (Kundali) readings, planetary periods (Dasha) analysis, and auspicious remedial guidance grounded in ancient Parashara wisdom.',
    requiresLicense: false,
    complianceWarning:
      'Sanctuary Wellness Notice: Vedic Astrology consultations offer spiritual wisdom and personal introspection. They do not constitute financial, medical, or legal counsel.',
    cities: ['Varanasi', 'Rishikesh', 'Delhi', 'Kolkata', 'Mumbai'],
  },
  psychotherapy: {
    name: 'Psychotherapy & Counseling',
    sanskrit: 'मानस चिकित्सा (Mindful Emotional Healing)',
    tagline: 'Empathetic clinical counseling and evidence-based trauma-informed therapy.',
    description:
      'Private 1-on-1 sessions with licensed clinical psychologists and psychotherapists. Integrating cognitive behavioral therapy, somatic experiencing, and mindfulness in a strictly confidential space.',
    requiresLicense: true,
    cities: ['Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Hyderabad'],
  },
  'sound-healing': {
    name: 'Sound & Frequency Therapy',
    sanskrit: 'नाद ब्रह्म (Sound as Sacred Consciousness)',
    tagline: 'Tibetan singing bowls, planetary gongs, and theta brainwave entrainment.',
    description:
      'Bathe your nervous system in restorative acoustic frequencies. Experience certified sound alchemists guiding you through deep meditative states for cellular peace.',
    requiresLicense: false,
    complianceWarning:
      'Sanctuary Wellness Notice: Sound healing sessions are complementary holistic wellness practices intended for relaxation and meditation, not medical intervention.',
    cities: ['Goa', 'Rishikesh', 'Bengaluru', 'Mumbai'],
  },
  ayurveda: {
    name: 'Ayurveda & Dinacharya',
    sanskrit: 'आयुर्वेद (The Knowledge of Longevity)',
    tagline: 'Prakriti dosha constitution assessment and circadian restorative lifestyle.',
    description:
      'Consult experienced Ayurvedic Vaidyas for constitutional balance, dietary guidelines, and herbal lifestyle recommendations tailored to your unique mind-body blueprint.',
    requiresLicense: false,
    complianceWarning:
      'Sanctuary Wellness Notice: Ayurvedic lifestyle consultations provide traditional dietary and wellness guidance and should complement your primary healthcare provider.',
    cities: ['Kerala', 'Rishikesh', 'Bengaluru', 'Pune'],
  },
  'pranic-healing': {
    name: 'Pranic Healing & Biofield',
    sanskrit: 'प्राणिक ऊर्जा (Bio-plasmic Energy Harmonization)',
    tagline: 'Chakra cleansing and energetic balancing without physical touch.',
    description:
      'Experience structured pranic energy sessions designed to clear depleted or congested energy from your etheric body.',
    requiresLicense: false,
    complianceWarning:
      'Sanctuary Wellness Notice: Pranic healing is a complementary energy modality and is not intended to replace standard medical diagnosis and treatment.',
    cities: ['Bengaluru', 'Mumbai', 'Chennai', 'Delhi'],
  },
  meditation: {
    name: 'Meditation & Mindfulness',
    sanskrit: 'ध्यान (Sustained Awareness & Presence)',
    tagline: 'Vipassana, mantra japa, and conscious stillness with dedicated guides.',
    description:
      'Deepen your personal meditation practice under the personalized guidance of experienced contemplative teachers.',
    requiresLicense: false,
    cities: ['Rishikesh', 'Dharamshala', 'Bengaluru', 'Goa'],
  },
};

export async function generateMetadata({
  params,
}: {
  params: { category: string };
}): Promise<Metadata> {
  const cat = CATEGORY_MAP[params.category.toLowerCase()];
  if (!cat) {
    return {
      title: 'Modality Not Found | Project Nirvana',
    };
  }

  const title = `Top Verified ${cat.name} Practitioners | Project Nirvana Sanctuary`;
  const description = `${cat.description.slice(0, 155)}... Book live 1:1 sessions with verified guides.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/c/${params.category.toLowerCase()}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

export default function CategoryLandingPage({ params }: { params: { category: string } }) {
  const catKey = params.category.toLowerCase();
  const config = CATEGORY_MAP[catKey];

  if (!config) {
    notFound();
  }

  // Schema.org JSON-LD Structured Data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: config.name,
    description: config.description,
    provider: {
      '@type': 'Organization',
      name: 'Project Nirvana Sanctuary',
      url: 'https://projectnirvana.internal',
    },
    areaServed: 'Worldwide',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `${config.name} Live Sessions`,
    },
  };

  return (
    <div className="space-y-12 py-10 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Banner */}
      <section className="container mx-auto px-4 sm:px-8 max-w-5xl space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{config.sanskrit}</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-6xl font-light text-foreground tracking-tight leading-[1.15]">
          Verified <span className="italic font-normal text-primary">{config.name}</span> Guides
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-3xl leading-relaxed">
          {config.description}
        </p>

        {/* Compliance Warning for Astrology, Reiki, and Complementary Modalities */}
        {config.complianceWarning && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 flex items-start gap-3.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-semibold block">
                Regulatory & Wellness Compliance Notice
              </strong>
              <p className="leading-relaxed opacity-90">{config.complianceWarning}</p>
            </div>
          </div>
        )}

        {/* Popular City Quick Filter Links */}
        <div className="space-y-2 pt-2">
          <span className="text-xs text-muted-foreground font-medium block">
            Browse {config.name} by Sacred Location:
          </span>
          <div className="flex flex-wrap gap-2">
            {config.cities.map((city) => (
              <Link
                key={city}
                href={`/c/${catKey}/${city.toLowerCase()}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border/70 bg-card hover:border-primary/50 text-xs font-medium text-foreground transition-all hover:bg-secondary/40"
              >
                <MapPin className="h-3 w-3 text-primary" />
                <span>{city}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Embedded Live Practitioner Explorer for this Category */}
      <section className="border-t border-border/60 pt-10">
        <Suspense
          fallback={
            <div className="container mx-auto py-12 text-center text-xs text-muted-foreground">
              Loading guides...
            </div>
          }
        >
          <ExploreView initialCategory={catKey} />
        </Suspense>
      </section>
    </div>
  );
}
