'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Share2,
  PhoneOff,
  Clock,
  AlertTriangle,
  Headphones,
  PlusCircle,
  Disc,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportProblemModal } from './report-problem-modal';
import { apiFetch } from '@/lib/api-client';

interface InSessionCallProps {
  bookingId: string;
  roomUrl: string;
  token: string;
  isOwner: boolean;
  partnerName: string;
  serviceTitle: string;
  sessionEndAt: string;
  initialAudioOnly?: boolean;
  initialMuted?: boolean;
  initialVideoOff?: boolean;
  recordingAllowed: boolean;
  isPsychotherapy: boolean;
  initialRecordingStatus: string;
  initialRecordingConsents: { consumer: boolean; provider: boolean };
  onLeave: () => void;
}

export function InSessionCall({
  bookingId,
  roomUrl,
  token,
  isOwner,
  partnerName,
  serviceTitle,
  sessionEndAt,
  initialAudioOnly = false,
  initialMuted = false,
  initialVideoOff = false,
  recordingAllowed,
  isPsychotherapy,
  initialRecordingStatus,
  initialRecordingConsents,
  onLeave,
}: InSessionCallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callObjectRef = useRef<DailyCall | null>(null);

  const [isMicOn, setIsMicOn] = useState(!initialMuted);
  const [isCameraOn, setIsCameraOn] = useState(!initialVideoOff && !initialAudioOnly);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAudioOnly, setIsAudioOnly] = useState(initialAudioOnly);

  const [recordingStatus, setRecordingStatus] = useState(initialRecordingStatus);
  const [recordingConsents, setRecordingConsents] = useState(initialRecordingConsents);
  const [isRequestingConsent, setIsRequestingConsent] = useState(false);

  const [isExtending, setIsExtending] = useState(false);
  const [extendedMinutes, setExtendedMinutes] = useState(0);
  const [currentEndAt, setCurrentEndAt] = useState(sessionEndAt);

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);

  // Time remaining countdown
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    return Math.max(0, Math.floor((new Date(currentEndAt).getTime() - Date.now()) / 1000));
  });

  // Countdown timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(currentEndAt).getTime() - Date.now()) / 1000),
      );
      setSecondsRemaining(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [currentEndAt]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isLowTime = secondsRemaining < 300; // Under 5 minutes

  // Mount Daily.co Call Object
  useEffect(() => {
    if (!containerRef.current || callObjectRef.current) return;

    const callFrame = DailyIframe.createFrame(containerRef.current, {
      showLeaveButton: false,
      showFullscreenButton: true,
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '1.25rem',
      },
    });

    callObjectRef.current = callFrame;

    // Daily Event Listeners
    callFrame
      .on('joined-meeting', () => {
        setIsReconnecting(false);
      })
      .on('network-connection', (e) => {
        if (e && e.event === 'interrupted') {
          setIsReconnecting(true);
        } else {
          setIsReconnecting(false);
        }
      })
      .on('recording-started', () => {
        setRecordingStatus('RECORDING');
      })
      .on('recording-stopped', () => {
        setRecordingStatus('COMPLETED');
      })
      .on('left-meeting', () => {
        onLeave();
      })
      .on('error', (err) => {
        console.warn('Daily Call Error:', err);
      });

    // Join room with token
    callFrame.join({
      url: roomUrl,
      token,
      audioSource: !initialMuted,
      videoSource: !initialVideoOff && !initialAudioOnly,
    });

    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.destroy().catch(() => {});
        callObjectRef.current = null;
      }
    };
  }, [roomUrl, token, initialMuted, initialVideoOff, initialAudioOnly, onLeave]);

  // Keyboard Shortcuts (M for Mic, V for Video)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'm' || e.key === 'M') {
        toggleMic();
      } else if (e.key === 'v' || e.key === 'V') {
        toggleCamera();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const toggleMic = useCallback(() => {
    if (callObjectRef.current) {
      const next = !isMicOn;
      callObjectRef.current.setLocalAudio(next);
      setIsMicOn(next);
    }
  }, [isMicOn]);

  const toggleCamera = useCallback(() => {
    if (isAudioOnly) return;
    if (callObjectRef.current) {
      const next = !isCameraOn;
      callObjectRef.current.setLocalVideo(next);
      setIsCameraOn(next);
    }
  }, [isCameraOn, isAudioOnly]);

  const toggleAudioOnly = () => {
    if (callObjectRef.current) {
      const nextAudioOnly = !isAudioOnly;
      setIsAudioOnly(nextAudioOnly);
      if (nextAudioOnly) {
        callObjectRef.current.setLocalVideo(false);
        setIsCameraOn(false);
      } else {
        callObjectRef.current.setLocalVideo(true);
        setIsCameraOn(true);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isOwner || !callObjectRef.current) return;
    try {
      if (isScreenSharing) {
        await callObjectRef.current.stopScreenShare();
        setIsScreenSharing(false);
      } else {
        await callObjectRef.current.startScreenShare();
        setIsScreenSharing(true);
      }
    } catch (err) {
      console.warn('Screen share error:', err);
      setIsScreenSharing(false);
    }
  };

  const handleGrantConsent = async () => {
    try {
      setIsRequestingConsent(true);
      const res = await apiFetch<{
        status: string;
        recordingAllowed: boolean;
        consents: { consumer: boolean; provider: boolean };
      }>(`/sessions/${bookingId}/recording/consent`, {
        method: 'POST',
        body: JSON.stringify({ consentGranted: true }),
      });
      setRecordingStatus(res.status);
      setRecordingConsents(res.consents);
    } catch (err) {
      console.warn('Consent request error:', err);
    } finally {
      setIsRequestingConsent(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      await apiFetch(`/sessions/${bookingId}/recording/start`, {
        method: 'POST',
      });
      setRecordingStatus('RECORDING');
    } catch (err) {
      console.warn('Start recording error:', err);
    }
  };

  const handleExtendSession = async () => {
    try {
      setIsExtending(true);
      const res = await apiFetch<{
        message: string;
        extendedMinutes: number;
        newEndAt: string;
      }>(`/sessions/${bookingId}/extend`, {
        method: 'POST',
        body: JSON.stringify({ minutes: 15 }),
      });
      setExtendedMinutes(res.extendedMinutes);
      setCurrentEndAt(res.newEndAt);
    } catch (err) {
      console.warn('Session extension error:', err);
    } finally {
      setIsExtending(false);
    }
  };

  const handleEndCall = () => {
    if (callObjectRef.current) {
      callObjectRef.current.leave().catch(() => {});
    }
    onLeave();
  };

  return (
    <div className="relative w-full h-[calc(100vh-5rem)] max-h-[900px] flex flex-col bg-neutral-950 rounded-2xl overflow-hidden shadow-2xl border border-neutral-800">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 z-10 text-xs">
        <div className="flex items-center gap-2.5">
          <Badge
            variant="outline"
            className="bg-primary/20 text-primary border-primary/30 font-serif"
          >
            <Sparkles className="h-3 w-3 mr-1 inline" />
            Active Sanctuary
          </Badge>
          <span className="font-semibold text-white truncate max-w-[220px] sm:max-w-xs">
            {serviceTitle}
          </span>
          <span className="text-neutral-400 hidden sm:inline">•</span>
          <span className="text-neutral-400 hidden sm:inline">{partnerName}</span>
        </div>

        {/* Center: Live Timer */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono font-medium transition-colors ${
            isLowTime
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
              : 'bg-neutral-800 text-neutral-200 border border-neutral-700'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>{formatTimer(secondsRemaining)}</span>
          {extendedMinutes > 0 && (
            <span className="text-[10px] text-primary">(+{extendedMinutes}m)</span>
          )}
        </div>

        {/* Right: Security & Recording Indicator */}
        <div className="flex items-center gap-2">
          {isPsychotherapy ? (
            <Badge
              variant="outline"
              className="bg-neutral-800/80 text-neutral-400 border-neutral-700 text-[10px]"
            >
              Psychotherapy • Unrecorded
            </Badge>
          ) : recordingStatus === 'RECORDING' ? (
            <Badge
              variant="outline"
              className="bg-red-500/20 text-red-400 border-red-500/40 text-[10px] animate-pulse"
            >
              <Disc className="h-3 w-3 mr-1 inline" /> REC
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-neutral-800/80 text-neutral-400 border-neutral-700 text-[10px]"
            >
              Recording OFF
            </Badge>
          )}
        </div>
      </div>

      {/* Reconnecting banner if internet drops */}
      {isReconnecting && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-amber-600 text-white px-4 py-1.5 rounded-full text-xs font-medium shadow-xl flex items-center gap-2 animate-bounce">
          <WifiOff className="h-4 w-4" />
          Reconnecting to sanctuary... Check your network connection.
        </div>
      )}

      {/* Main Video Container */}
      <div ref={containerRef} className="flex-1 w-full h-full bg-neutral-950 relative" />

      {/* Bottom Controls Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900/95 backdrop-blur-md border-t border-neutral-800 z-10">
        {/* Left Side: Audio-only & Problem report */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleAudioOnly}
            className={`text-xs gap-1.5 ${
              isAudioOnly
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isAudioOnly ? 'Audio Only Active' : 'Switch to Audio Only'}
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsReportModalOpen(true)}
            className="text-xs text-neutral-400 hover:text-white gap-1.5"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="hidden sm:inline">Report a problem</span>
          </Button>
        </div>

        {/* Center: Main Media Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mic */}
          <button
            type="button"
            onClick={toggleMic}
            className={`p-3.5 rounded-full transition-all shadow-md ${
              isMicOn
                ? 'bg-neutral-800 hover:bg-neutral-700 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={`${isMicOn ? 'Mute Mic' : 'Unmute Mic'} (Hotkey: M)`}
          >
            {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          {/* Camera */}
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isAudioOnly}
            className={`p-3.5 rounded-full transition-all shadow-md ${
              isAudioOnly
                ? 'opacity-40 cursor-not-allowed bg-neutral-800 text-neutral-500'
                : isCameraOn
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={`${isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'} (Hotkey: V)`}
          >
            {isCameraOn && !isAudioOnly ? (
              <Camera className="h-5 w-5" />
            ) : (
              <CameraOff className="h-5 w-5" />
            )}
          </button>

          {/* Screen Share (PROVIDER ONLY!) */}
          {isOwner && (
            <button
              type="button"
              onClick={toggleScreenShare}
              className={`p-3.5 rounded-full transition-all shadow-md ${
                isScreenSharing
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-white'
              }`}
              title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen (Practitioner Only)'}
            >
              <Share2 className="h-5 w-5" />
            </button>
          )}

          {/* End Session Button */}
          <button
            type="button"
            onClick={() => setIsEndConfirmOpen(true)}
            className="p-3.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-600/30"
            title="End Session"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        {/* Right Side: Extension (Provider) & Recording Consent */}
        <div className="flex items-center gap-2">
          {/* Overtime extension for provider */}
          {isOwner && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isExtending || extendedMinutes >= 30}
              onClick={handleExtendSession}
              className="text-xs bg-neutral-800/80 border-neutral-700 text-neutral-200 hover:text-white gap-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">
                {isExtending ? 'Extending...' : '+15m Overtime'}
              </span>
            </Button>
          )}

          {/* Recording Consent Prompt if allowed */}
          {recordingAllowed && !isPsychotherapy && (
            <>
              {recordingConsents.consumer && recordingConsents.provider ? (
                recordingStatus !== 'RECORDING' &&
                isOwner && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleStartRecording}
                    className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                  >
                    <Disc className="h-3.5 w-3.5 mr-1" /> Start Recording
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isRequestingConsent}
                  onClick={handleGrantConsent}
                  className="text-xs text-neutral-400 hover:text-white"
                >
                  <Disc className="h-3.5 w-3.5 mr-1" />
                  <span className="hidden lg:inline">
                    {isRequestingConsent ? 'Saving...' : 'Grant Recording Consent'}
                  </span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* End Session Confirmation Modal */}
      {isEndConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            <h3 className="text-lg font-serif font-bold text-foreground">Leave Sanctuary Call?</h3>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to end your consultation? You can re-enter while the scheduled
              session window is still active.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsEndConfirmOpen(false)}>
                Stay in Call
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleEndCall}
                className="bg-red-600 hover:bg-red-700"
              >
                End Session
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Report Problem Modal */}
      <ReportProblemModal
        bookingId={bookingId}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </div>
  );
}
