import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  ShieldCheck,
  Video,
  Lock,
  ArrowRight,
  Sun,
  Flame,
  Feather,
  Compass,
} from 'lucide-react';

const MODALITIES = [
  {
    name: 'Yoga & Pranayama',
    description: 'Ancient somatic alignment, breathwork, and nervous system regulation.',
    icon: Feather,
    tag: 'Sadhana',
  },
  {
    name: 'Pranic & Reiki Healing',
    description: 'Non-touch energetic aura cleansing and subtle body revitalization.',
    icon: Flame,
    tag: 'Energy',
  },
  {
    name: 'Psychotherapy & Counseling',
    description: 'Empathetic, licensed clinical therapy in a private safe space.',
    icon: Lock,
    tag: 'Mental Health',
  },
  {
    name: 'Vedic Astrology & Guidance',
    description:
      'Cosmic transit analysis and karmic timeline navigation with seasoned astrologers.',
    icon: Compass,
    tag: 'Wisdom',
  },
  {
    name: 'Sound & Vibration Healing',
    description: 'Tibetan singing bowls and frequency medicine for deep theta meditation.',
    icon: Sun,
    tag: 'Frequency',
  },
  {
    name: 'Spiritual Mentorship',
    description: 'Introspective 1-on-1 guidance for spiritual transitions and inner awakening.',
    icon: Sparkles,
    tag: 'Consciousness',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-24 py-12 md:py-20">
      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-8 max-w-5xl text-center space-y-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Curated Live Time-Based Sessions</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight text-foreground leading-[1.15]">
          A sacred sanctuary for <br />
          <span className="italic font-normal text-primary">mind, breath, and spirit.</span>
        </h1>

        <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          Connect directly with vetted yoga gurus, pranic healers, psychotherapists, and
          astrologers. Book your slot, attend a private 1-on-1 session, and begin deep rejuvenation.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button size="lg" className="w-full sm:w-auto gap-2" asChild>
            <Link href="/services">
              Explore Live Sessions <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="w-full sm:w-auto" asChild>
            <Link href="/providers/apply">Join as a Practitioner</Link>
          </Button>
        </div>
      </section>

      {/* Trust & Guarantee Banner */}
      <section className="border-y border-border/60 bg-secondary/30 py-8">
        <div className="container mx-auto px-4 sm:px-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
          <div className="flex items-center space-x-4 p-2 justify-center md:justify-start">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">100% Vetted Practitioners</p>
              <p className="text-xs text-muted-foreground">Rigorous credential verification</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 p-2 justify-center md:justify-start">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Seamless Daily.co Video</p>
              <p className="text-xs text-muted-foreground">
                One-click browser sessions, no app required
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4 p-2 justify-center md:justify-start">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Escrow Protected Payments</p>
              <p className="text-xs text-muted-foreground">
                Funds released only after session completes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Modalities Showcase */}
      <section className="container mx-auto px-4 sm:px-8 space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl sm:text-4xl font-light text-foreground">
            Holistic Modalities
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Discover tailored practices for mental clarity, physical harmony, and energetic balance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODALITIES.map((modality) => {
            const Icon = modality.icon;
            return (
              <div
                key={modality.name}
                className="group relative rounded-xl border border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/40 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {modality.tag}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-lg text-foreground group-hover:text-primary transition-colors">
                      {modality.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {modality.description}
                    </p>
                  </div>
                </div>

                <div className="pt-6">
                  <Link
                    href={`/services?category=${encodeURIComponent(modality.name)}`}
                    className="inline-flex items-center text-xs font-medium text-primary hover:underline gap-1"
                  >
                    View Practitioners <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
