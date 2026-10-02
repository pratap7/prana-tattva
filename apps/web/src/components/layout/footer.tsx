import Link from 'next/link';
import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full border-t border-border/60 bg-muted/30 py-12 transition-colors">
      <div className="container mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <span className="font-serif text-lg font-medium text-foreground">Project Nirvana</span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Curated sanctuary for live 1-on-1 yoga, pranic healing, psychotherapy, astrology, and
              holistic vitality sessions.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">
              Modalities
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Yoga & Pranayama</li>
              <li>Pranic & Reiki Healing</li>
              <li>Psychotherapy & Counseling</li>
              <li>Vedic Astrology</li>
              <li>Sound & Frequency Therapy</li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">
              Platform
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-foreground">
                  About Sanctuary
                </Link>
              </li>
              <li>
                <Link href="/providers/apply" className="hover:text-foreground">
                  Apply as Healer
                </Link>
              </li>
              <li>
                <Link href="/trust-safety" className="hover:text-foreground">
                  Trust & Verification
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground">
                  Confidentiality & Privacy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">
              Integrations
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Daily.co HD Video</li>
              <li>Razorpay Escrow Transfer</li>
              <li>Protected Session Health Records</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between border-t border-border/40 pt-6 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Project Nirvana. All rights reserved.</p>
          <p className="flex items-center gap-1 mt-2 sm:mt-0">
            Engineered with mindful care <Heart className="h-3 w-3 text-accent fill-accent" /> for
            inner wellness.
          </p>
        </div>
      </div>
    </footer>
  );
}
