'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, AlertCircle, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PreJoinScreen } from '@/components/session/pre-join-screen';
import { WaitingLobby } from '@/components/session/waiting-lobby';
import { InSessionCall } from '@/components/session/in-session-call';
import { InPersonLocationCard } from '@/components/session/in-person-location-card';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { JoinSessionResponse, SessionStatusResponse } from '@project-nirvana/shared';

type SessionStage =
  'PRE_JOIN' | 'WAITING_LOBBY' | 'IN_CALL' | 'WINDOW_NOT_OPEN' | 'WINDOW_EXPIRED' | 'ERROR';

export default function SessionPage() {
  const params = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const bookingId = params?.bookingId;

  const [sessionStatus, setSessionStatus] = useState<SessionStatusResponse | null>(null);
  const [joinData, setJoinData] = useState<JoinSessionResponse | null>(null);
  const [stage, setStage] = useState<SessionStage>('PRE_JOIN');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pre-join options
  const [preJoinOptions, setPreJoinOptions] = useState<{
    audioOnly: boolean;
    initialMuted: boolean;
    initialVideoOff: boolean;
  }>({
    audioOnly: false,
    initialMuted: false,
    initialVideoOff: false,
  });

  // Fetch session status
  const fetchStatus = useCallback(async () => {
    if (!bookingId) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const data: SessionStatusResponse = await apiFetch(`/sessions/${bookingId}/status`);
      setSessionStatus(data);

      const now = Date.now();
      const openTime = new Date(data.windowOpensAt).getTime();
      const closeTime = new Date(data.windowClosesAt).getTime();

      if (now < openTime) {
        setStage('WINDOW_NOT_OPEN');
      } else if (now > closeTime) {
        setStage('WINDOW_EXPIRED');
      } else if (stage === 'WINDOW_NOT_OPEN' || stage === 'WINDOW_EXPIRED') {
        setStage('PRE_JOIN');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to session';
      setErrorMessage(msg);
      setStage('ERROR');
    } finally {
      setIsLoading(false);
    }
  }, [bookingId, stage]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
    }
  }, [isAuthenticated, fetchStatus]);

  // Handle Join Action from Pre-Join Screen
  const handlePreJoinSubmit = async (options: {
    audioOnly: boolean;
    initialMuted: boolean;
    initialVideoOff: boolean;
  }) => {
    setPreJoinOptions(options);
    try {
      setIsLoading(true);
      // Fetch short-lived meeting token on demand
      const joinRes: JoinSessionResponse = await apiFetch(`/sessions/${bookingId}/join`, {
        method: 'POST',
      });
      setJoinData(joinRes);

      // If consumer and provider has not joined, show waiting room lobby
      if (!joinRes.isOwner && !sessionStatus?.isProviderPresent) {
        setStage('WAITING_LOBBY');
      } else {
        setStage('IN_CALL');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join video room';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll waiting room until provider arrives
  useEffect(() => {
    if (stage !== 'WAITING_LOBBY' || !bookingId) return;

    const interval = setInterval(async () => {
      try {
        const data: SessionStatusResponse = await apiFetch(`/sessions/${bookingId}/status`);
        setSessionStatus(data);
        if (data.isProviderPresent) {
          setStage('IN_CALL');
        }
      } catch {
        // Continue polling
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [stage, bookingId]);

  if (isAuthLoading || (isLoading && !sessionStatus)) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm font-serif text-muted-foreground">Preparing Virtual Sanctuary...</p>
      </div>
    );
  }

  // IN_PERSON Mode Screen
  if (sessionStatus?.mode === 'IN_PERSON') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link href={`/bookings/${bookingId}`}>
            <ArrowLeft className="h-4 w-4" /> Back to Booking Summary
          </Link>
        </Button>

        <InPersonLocationCard
          details={sessionStatus.inPersonDetails}
          isConfirmed={sessionStatus.status === 'CONFIRMED' || sessionStatus.status === 'COMPLETED'}
          serviceTitle="In-Person Appointment"
        />
      </div>
    );
  }

  // Window Not Yet Open Screen
  if (stage === 'WINDOW_NOT_OPEN') {
    const formattedOpens = sessionStatus?.windowOpensAt
      ? new Date(sessionStatus.windowOpensAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '10 minutes before start';

    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6 animate-in fade-in">
        <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-sm">
          <Clock className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <Badge
            variant="outline"
            className="bg-primary/10 text-primary border-primary/20 font-serif"
          >
            Sanctuary Window Closed
          </Badge>
          <h1 className="text-2xl font-serif font-bold text-foreground">
            Session Window Opens Soon
          </h1>
          <p className="text-sm text-muted-foreground">
            To preserve practitioner sanctuary focus, video rooms unlock exactly 10 minutes prior to
            scheduled start time (at {formattedOpens}).
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={fetchStatus} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Check Window Status
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/bookings/${bookingId}`}>Back to Booking</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Window Expired Screen
  if (stage === 'WINDOW_EXPIRED') {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6 animate-in fade-in">
        <div className="h-16 w-16 rounded-full bg-muted text-muted-foreground flex items-center justify-center mx-auto">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-serif font-bold text-foreground">Session Window Closed</h1>
          <p className="text-sm text-muted-foreground">
            This appointment room window has concluded. If you experienced any technical
            difficulties, please report a problem from your bookings dashboard.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button asChild>
            <Link href="/bookings">View Bookings</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Error Screen
  if (stage === 'ERROR' || errorMessage) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6 animate-in fade-in">
        <div className="h-16 w-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-serif font-bold text-foreground">Unable to Join Sanctuary</h1>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </div>
        <div className="flex justify-center gap-3">
          <Button onClick={fetchStatus} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/bookings">Back to Bookings</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Waiting Room Lobby Stage
  if (stage === 'WAITING_LOBBY' && joinData) {
    return (
      <WaitingLobby
        partnerName={joinData.partner.name}
        serviceTitle={joinData.serviceTitle}
        sessionStartAt={joinData.sessionStartAt}
        onLeave={() => router.push(`/bookings/${bookingId}`)}
        onBackToPreJoin={() => setStage('PRE_JOIN')}
      />
    );
  }

  // In-Call Live Stage
  if (stage === 'IN_CALL' && joinData) {
    return (
      <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 py-4">
        <InSessionCall
          bookingId={bookingId}
          roomUrl={joinData.roomUrl}
          token={joinData.token}
          isOwner={joinData.isOwner}
          partnerName={joinData.partner.name}
          serviceTitle={joinData.serviceTitle}
          sessionEndAt={joinData.sessionEndAt}
          initialAudioOnly={preJoinOptions.audioOnly}
          initialMuted={preJoinOptions.initialMuted}
          initialVideoOff={preJoinOptions.initialVideoOff}
          recordingAllowed={joinData.recordingAllowed}
          isPsychotherapy={joinData.isPsychotherapy}
          initialRecordingStatus={joinData.recordingStatus}
          initialRecordingConsents={joinData.recordingConsents}
          onLeave={() => router.push(`/bookings/${bookingId}`)}
        />
      </div>
    );
  }

  // Default: Pre-Join Stage
  return (
    <div className="py-6">
      <PreJoinScreen
        partnerName={user?.role === 'PROVIDER' ? 'Client' : 'Practitioner'}
        partnerRole={user?.role === 'PROVIDER' ? 'CONSUMER' : 'PROVIDER'}
        serviceTitle="Holistic Sanctuary Consultation"
        isOwner={user?.role === 'PROVIDER'}
        onJoin={handlePreJoinSubmit}
        isJoining={isLoading}
      />
    </div>
  );
}
