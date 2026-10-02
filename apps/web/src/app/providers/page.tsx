import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Star, Sparkles, MapPin, ArrowRight, UserCheck } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Vetted Healers & Practitioners Sanctuary | Project Nirvana',
  description:
    'Discover credential-verified yoga masters, pranic healers, psychotherapists, and spiritual guides on Project Nirvana.',
};

const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  requiresLicense: boolean;
}

async function fetchCategories(): Promise<CategoryItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/categories`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function ProvidersDirectoryPage() {
  const categories = await fetchCategories();

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-6xl space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Curated Sanctuary Practitioners</span>
        </div>
        <h1 className="font-serif text-3xl sm:text-5xl font-semibold tracking-tight text-foreground">
          Meet Our Verified Healers
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
          Every practitioner undergoes credential verification, identity vetting, and code-of-ethics
          alignment before hosting sanctuary sessions.
        </p>
      </div>

      {/* Categories Bar */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-center">
          Browse by Sanctuary Modality
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/providers?category=${cat.slug}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/80 bg-card hover:border-primary/40 hover:bg-primary/5 text-xs sm:text-sm font-medium transition-all"
            >
              <span>{cat.name}</span>
              {cat.requiresLicense && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
            </Link>
          ))}
        </div>
      </div>

      {/* Featured Vetted Healers Roster */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Sample Healer 1 */}
        <Card className="border border-border/80 hover:border-primary/40 transition-all hover:shadow-lg rounded-2xl overflow-hidden bg-card flex flex-col justify-between">
          <CardHeader className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center font-serif text-2xl font-bold text-primary ring-2 ring-primary/20 shrink-0">
                A
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="success" className="text-[11px] gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Credential Verified
                  </Badge>
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  Acharya Ramanath
                </h3>
                <p className="text-xs text-primary font-medium">
                  Senior Pranayama & Kundalini Master
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              Practicing yogic breathwork for 18+ years across Rishikesh and Mysore. Specializes in
              calming nervous system dysregulation through conscious prana control.
            </p>

            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/40">
              <div className="flex items-center gap-1 text-amber-500 font-semibold">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span>4.9</span>
                <span className="text-muted-foreground font-normal">(42)</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>Rishikesh, India</span>
              </div>
            </div>
          </CardHeader>

          <div className="p-6 pt-0 border-t border-border/40 bg-muted/10 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">Session from</span>
              <span className="font-serif font-bold text-lg text-foreground">₹2,500</span>
            </div>
            <Button size="sm" asChild className="rounded-xl gap-1">
              <Link href="/providers/acharya-ramanath">
                View Sanctuary <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </Card>

        {/* Sample Healer 2 */}
        <Card className="border border-border/80 hover:border-primary/40 transition-all hover:shadow-lg rounded-2xl overflow-hidden bg-card flex flex-col justify-between">
          <CardHeader className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full overflow-hidden bg-emerald-500/10 flex items-center justify-center font-serif text-2xl font-bold text-emerald-700 ring-2 ring-emerald-500/20 shrink-0">
                M
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="success" className="text-[11px] gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Board Licensed
                  </Badge>
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  Dr. Meera Vasudevan
                </h3>
                <p className="text-xs text-primary font-medium">
                  Clinical Psychotherapist & Mindfulness Guide
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              Licensed clinical psychologist with 12 years experience blending somatic awareness,
              inner child reconciliation, and evidence-based psychotherapy.
            </p>

            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/40">
              <div className="flex items-center gap-1 text-amber-500 font-semibold">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span>5.0</span>
                <span className="text-muted-foreground font-normal">(38)</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>Bengaluru, India</span>
              </div>
            </div>
          </CardHeader>

          <div className="p-6 pt-0 border-t border-border/40 bg-muted/10 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">Session from</span>
              <span className="font-serif font-bold text-lg text-foreground">₹3,500</span>
            </div>
            <Button size="sm" asChild className="rounded-xl gap-1">
              <Link href="/providers/dr-meera-vasudevan">
                View Sanctuary <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </Card>

        {/* Sample Healer 3 */}
        <Card className="border border-border/80 hover:border-primary/40 transition-all hover:shadow-lg rounded-2xl overflow-hidden bg-card flex flex-col justify-between">
          <CardHeader className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full overflow-hidden bg-amber-500/10 flex items-center justify-center font-serif text-2xl font-bold text-amber-700 ring-2 ring-amber-500/20 shrink-0">
                K
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="success" className="text-[11px] gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Reiki Grandmaster
                  </Badge>
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  Kavita Sundaram
                </h3>
                <p className="text-xs text-primary font-medium">
                  Pranic Energy & Chakra Harmonization
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              Certified Usui Reiki Master and advanced Pranic healer assisting clients in energetic
              cord cutting, aura cleansing, and emotional chakra balancing.
            </p>

            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/40">
              <div className="flex items-center gap-1 text-amber-500 font-semibold">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span>4.8</span>
                <span className="text-muted-foreground font-normal">(29)</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>Chennai, India</span>
              </div>
            </div>
          </CardHeader>

          <div className="p-6 pt-0 border-t border-border/40 bg-muted/10 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">Session from</span>
              <span className="font-serif font-bold text-lg text-foreground">₹2,000</span>
            </div>
            <Button size="sm" asChild className="rounded-xl gap-1">
              <Link href="/providers/kavita-sundaram">
                View Sanctuary <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Practitioner Call to Action */}
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 p-8 sm:p-12 text-center space-y-4">
        <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-foreground">
          Are you a Certified Healer or Practitioner?
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
          Join our sanctuary. Set your own availability, deliver HD video sessions, and receive
          secure escrow payouts directly to your bank account.
        </p>
        <div className="pt-2">
          <Button size="lg" asChild className="rounded-xl gap-2">
            <Link href="/provider/onboarding">
              <UserCheck className="h-4 w-4" />
              Apply to Join Sanctuary
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
