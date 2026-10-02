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
  Heart,
  Moon,
} from 'lucide-react';
import { SearchHeroBox } from '@/components/discovery/search-hero-box';
import { FeaturedProviders } from '@/components/discovery/featured-providers';

const CATEGORY_TILES = [
  {
    name: 'Yoga & Pranayama',
    slug: 'yoga',
    description: 'Ancient somatic asanas, breathwork, and nervous system regulation.',
    icon: Feather,
    tag: 'Sadhana',
    practitioners: '45+ Guides',
    color: 'from-emerald-500/10 to-teal-500/5',
  },
  {
    name: 'Reiki & Pranic Healing',
    slug: 'reiki',
    description: 'Subtle body aura cleansing, chakra balancing, and deep frequency restoration.',
    icon: Flame,
    tag: 'Energy',
    practitioners: '38+ Guides',
    color: 'from-amber-500/10 to-orange-500/5',
  },
  {
    name: 'Psychotherapy & Counseling',
    slug: 'psychotherapy',
    description: 'Empathetic, licensed clinical therapy in a confidential safe space.',
    icon: Lock,
    tag: 'Mental Health',
    practitioners: '24+ Licensed Therapists',
    color: 'from-indigo-500/10 to-blue-500/5',
  },
  {
    name: 'Vedic Astrology & Jyotish',
    slug: 'astrology',
    description: 'Cosmic transit analysis and karmic timeline guidance from master scholars.',
    icon: Compass,
    tag: 'Wisdom',
    practitioners: '32+ Astrologers',
    color: 'from-purple-500/10 to-violet-500/5',
  },
  {
    name: 'Sound & Vibration Healing',
    slug: 'sound-healing',
    description: 'Tibetan singing bowls and frequency medicine for deep theta restoration.',
    icon: Sun,
    tag: 'Frequency',
    practitioners: '18+ Healers',
    color: 'from-yellow-500/10 to-amber-500/5',
  },
  {
    name: 'Ayurveda & Dinacharya',
    slug: 'ayurveda',
    description: 'Constitutional dosha assessment and circadian restorative guidance.',
    icon: Heart,
    tag: 'Vitality',
    practitioners: '29+ Vaidyas',
    color: 'from-rose-500/10 to-red-500/5',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-24 py-12 md:py-20">
      {/* Hero Section with Search Box */}
      <section className="container mx-auto px-4 sm:px-8 max-w-5xl text-center space-y-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Curated Live 1-on-1 Sessions</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight text-foreground leading-[1.12]">
          A sacred sanctuary for <br />
          <span className="italic font-normal text-primary">mind, breath, and spirit.</span>
        </h1>

        <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          Connect directly with vetted yoga gurus, pranic healers, psychotherapists, and
          astrologers. Book your slot, attend a private 1-on-1 session, and begin deep rejuvenation.
        </p>

        {/* What are you looking for? Search Box */}
        <div className="pt-2">
          <SearchHeroBox />
        </div>
      </section>

      {/* Trust & Guarantee Banner */}
      <section className="border-y border-border/60 bg-secondary/30 py-8">
        <div className="container mx-auto px-4 sm:px-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
          <div className="flex items-center space-x-4 p-2 justify-center md:justify-start">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">100% Vetted Practitioners</p>
              <p className="text-xs text-muted-foreground">
                Rigorous credential and ID board review
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4 p-2 justify-center md:justify-start">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Seamless Daily.co Video</p>
              <p className="text-xs text-muted-foreground">
                One-click browser sessions, no app download required
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4 p-2 justify-center md:justify-start">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Escrow Protected Payouts</p>
              <p className="text-xs text-muted-foreground">
                Payment held securely until the session completes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Category Tiles Grid */}
      <section className="container mx-auto px-4 sm:px-8 space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Moon className="h-3.5 w-3.5" />
            <span>Sacred Modalities</span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-light text-foreground">
            Explore by Discipline
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Tailored holistic offerings for mental clarity, physical vitality, and energetic
            alignment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORY_TILES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.slug}
                href={`/c/${cat.slug}`}
                className="group relative rounded-2xl border border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-primary/50 hover:-translate-y-0.5 flex flex-col justify-between overflow-hidden"
              >
                <div
                  className={`absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${cat.color} blur-2xl group-hover:scale-150 transition-transform duration-500`}
                />

                <div className="space-y-4 relative">
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {cat.practitioners}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-serif font-medium text-xl text-foreground group-hover:text-primary transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                      {cat.description}
                    </p>
                  </div>
                </div>

                <div className="pt-6 relative flex items-center justify-between">
                  <span className="text-xs font-medium text-primary group-hover:underline inline-flex items-center gap-1">
                    Discover Guides <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">#{cat.tag}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured Providers Section */}
      <FeaturedProviders />

      {/* Bottom CTA Banner */}
      <section className="container mx-auto px-4 sm:px-8 max-w-5xl">
        <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-secondary/30 p-8 sm:p-12 text-center space-y-6">
          <h2 className="font-serif text-3xl sm:text-4xl font-light text-foreground">
            Are you a certified healer or master teacher?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Join the Project Nirvana sanctuary. Offer 1:1 sessions, manage your global booking
            calendar, and receive guaranteed escrow payouts directly to your account.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Button size="lg" className="rounded-xl px-8" asChild>
              <Link href="/provider/onboarding">Join as a Practitioner</Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl" asChild>
              <Link href="/explore">Browse All Modalities</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
