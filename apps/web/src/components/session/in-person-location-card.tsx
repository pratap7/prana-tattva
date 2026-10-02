'use client';

import React from 'react';
import { MapPin, Navigation, Lock, CheckCircle2, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InPersonSessionDetails } from '@project-nirvana/shared';

interface InPersonLocationCardProps {
  details: InPersonSessionDetails | null | undefined;
  isConfirmed: boolean;
  serviceTitle: string;
}

export function InPersonLocationCard({
  details,
  isConfirmed,
  serviceTitle,
}: InPersonLocationCardProps) {
  const address = details?.address || 'Sanctuary Address';
  const city = details?.city || 'Rishikesh';
  const instructions = details?.instructions;
  const coordinates = details?.coordinates;

  const googleMapsUrl = coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', ' + city)}`;

  return (
    <Card className="overflow-hidden border border-border/70 shadow-md bg-card">
      <CardHeader className="p-5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-serif font-bold text-foreground">
              In-Person Sanctuary Location
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className={
              isConfirmed
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
            }
          >
            {isConfirmed ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmed
              </>
            ) : (
              <>
                <Lock className="h-3 w-3 mr-1" /> Locked Until Confirmation
              </>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {isConfirmed ? (
          <>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">{serviceTitle}</h3>
              <p className="text-sm text-foreground/90 font-medium">{address}</p>
              <p className="text-xs text-muted-foreground">{city}, India</p>
            </div>

            {instructions && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50 text-xs text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary" /> Arrival & Parking Instructions
                </div>
                <p>{instructions}</p>
              </div>
            )}

            {/* Map Preview */}
            <div className="relative aspect-[16/9] w-full rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-border overflow-hidden flex items-center justify-center">
              <div className="text-center p-4 space-y-2">
                <MapPin className="h-8 w-8 text-primary mx-auto animate-bounce" />
                <p className="text-xs font-medium text-foreground">{address}</p>
                <p className="text-[11px] text-muted-foreground">
                  Coordinates:{' '}
                  {coordinates
                    ? `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`
                    : city}
                </p>
              </div>
            </div>

            <Button
              className="w-full gap-2 font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
              asChild
            >
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4" />
                Open Directions in Google Maps
              </a>
            </Button>
          </>
        ) : (
          <div className="py-8 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Exact Address Private</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                To protect practitioner sanctuary privacy, exact street address, landmark
                instructions, and navigation maps are unlocked immediately upon booking
                confirmation.
              </p>
            </div>
            <p className="text-xs font-medium text-primary">City Location: {city}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
