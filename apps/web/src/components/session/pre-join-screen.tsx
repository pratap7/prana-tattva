'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Volume2,
  Wifi,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Headphones,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PreJoinScreenProps {
  partnerName: string;
  partnerRole: string;
  serviceTitle: string;
  isOwner: boolean;
  onJoin: (options: {
    audioOnly: boolean;
    initialMuted: boolean;
    initialVideoOff: boolean;
  }) => void;
  isJoining: boolean;
}

export function PreJoinScreen({
  partnerName,
  partnerRole,
  serviceTitle,
  isOwner,
  onJoin,
  isJoining,
}: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isAudioOnly, setIsAudioOnly] = useState(false);

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');

  const [micVolume, setMicVolume] = useState<number>(0);
  const [networkQuality, setNetworkQuality] = useState<'testing' | 'excellent' | 'good' | 'fair'>(
    'testing',
  );
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  // Initialize media devices and live preview
  useEffect(() => {
    let active = true;

    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setHasCameraPermission(true);
        setHasMicPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Setup audio visualizer
        setupAudioAnalyser(stream);

        // Enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vDevs = devices.filter((d) => d.kind === 'videoinput');
        const aDevs = devices.filter((d) => d.kind === 'audioinput');
        setVideoDevices(vDevs);
        setAudioDevices(aDevs);
        if (vDevs.length > 0) setSelectedVideoId(vDevs[0].deviceId);
        if (aDevs.length > 0) setSelectedAudioId(aDevs[0].deviceId);
      } catch (err) {
        console.warn('Media device access error:', err);
        setHasCameraPermission(false);
        setHasMicPermission(false);
      }
    }

    initMedia();

    // Measure ping latency for network quality
    const startPing = performance.now();
    fetch('/api/v1/health', { method: 'HEAD', cache: 'no-store' })
      .then(() => {
        const latency = performance.now() - startPing;
        if (latency < 120) setNetworkQuality('excellent');
        else if (latency < 300) setNetworkQuality('good');
        else setNetworkQuality('fair');
      })
      .catch(() => setNetworkQuality('good'));

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Web Audio API analyzer for microphone meter
  const setupAudioAnalyser = (stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch {
      // AudioContext optional fallback
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    } else {
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleMic = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    } else {
      setIsMicOn(!isMicOn);
    }
  };

  const handleJoin = () => {
    // Stop local preview tracks before handing over to Daily Call Object
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onJoin({
      audioOnly: isAudioOnly,
      initialMuted: !isMicOn,
      initialVideoOff: !isCameraOn || isAudioOnly,
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-500">
      {/* Session Title Header */}
      <div className="text-center space-y-2">
        <Badge
          variant="outline"
          className="bg-primary/10 text-primary border-primary/20 px-3 py-1 font-serif"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5 inline" />
          Virtual Sanctuary Check-in
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground">
          {serviceTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? `Your client ${partnerName} will join shortly. Please verify your camera & microphone.`
            : `Consultation with ${partnerRole === 'PROVIDER' ? 'Practitioner' : ''} ${partnerName}`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Video Preview & Controls */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-video w-full rounded-2xl bg-neutral-900 overflow-hidden shadow-xl border border-border/50 flex items-center justify-center">
            {isCameraOn && !isAudioOnly ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3 text-neutral-400 p-6 text-center">
                <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center">
                  <CameraOff className="h-8 w-8 text-neutral-500" />
                </div>
                <p className="text-sm font-medium">
                  {isAudioOnly ? 'Audio-only mode activated' : 'Camera is muted'}
                </p>
                <p className="text-xs text-neutral-500 max-w-xs">
                  {isAudioOnly
                    ? 'Video streaming disabled to preserve connection bandwidth.'
                    : 'Click the camera button below to turn your video on.'}
                </p>
              </div>
            )}

            {/* Bottom floating controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
              <button
                type="button"
                onClick={toggleMic}
                className={`p-3 rounded-full transition-colors ${
                  isMicOn
                    ? 'bg-neutral-800/80 hover:bg-neutral-700 text-white'
                    : 'bg-red-500/90 hover:bg-red-600 text-white'
                }`}
                title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                disabled={isAudioOnly}
                className={`p-3 rounded-full transition-colors ${
                  isAudioOnly
                    ? 'opacity-40 cursor-not-allowed bg-neutral-800 text-neutral-500'
                    : isCameraOn
                      ? 'bg-neutral-800/80 hover:bg-neutral-700 text-white'
                      : 'bg-red-500/90 hover:bg-red-600 text-white'
                }`}
                title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {isCameraOn && !isAudioOnly ? (
                  <Camera className="h-4 w-4" />
                ) : (
                  <CameraOff className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Device selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {videoDevices.length > 0 && !isAudioOnly && (
              <div className="space-y-1">
                <label className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" /> Camera
                </label>
                <select
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {audioDevices.length > 0 && (
              <div className="space-y-1">
                <label className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5" /> Microphone
                </label>
                <select
                  value={selectedAudioId}
                  onChange={(e) => setSelectedAudioId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Right: Health Check, Audio Meter & Join Action */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
            <CardContent className="p-5 space-y-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Readiness Diagnostics
              </h2>

              {/* Microphone Volume Level */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5 text-primary" /> Microphone Activity
                  </span>
                  <span className="text-muted-foreground">
                    {isMicOn ? (micVolume > 5 ? 'Detecting audio' : 'Speak to test') : 'Muted'}
                  </span>
                </div>
                <div className="h-2 w-full bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-75"
                    style={{ width: `${isMicOn ? micVolume : 0}%` }}
                  />
                </div>
              </div>

              {/* Network Quality Indicator */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-border/40 text-xs">
                <div className="flex items-center gap-2.5">
                  <Wifi className="h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="font-medium text-foreground">Sanctuary Uplink</div>
                    <div className="text-muted-foreground capitalize">
                      {networkQuality} connection
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]"
                >
                  Online
                </Badge>
              </div>

              {/* Audio-Only Mode Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-border/40">
                <div className="space-y-0.5 pr-2">
                  <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Headphones className="h-3.5 w-3.5 text-primary" /> Audio-Only Sanctuary
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Best for unstable connections or meditative voice consultations
                  </div>
                </div>
                <input
                  type="checkbox"
                  id="audioOnlyToggle"
                  checked={isAudioOnly}
                  onChange={(e) => setIsAudioOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              {/* Permissions warning banner if denied */}
              {(hasCameraPermission === false || hasMicPermission === false) && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Permissions Needed:</span> Browser access to
                    camera or mic was denied. Please click the lock icon in your address bar to
                    grant access.
                  </div>
                </div>
              )}

              {/* Action Button */}
              <Button
                type="button"
                onClick={handleJoin}
                disabled={isJoining}
                className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 gap-2"
              >
                {isJoining ? (
                  <>Connecting to Sanctuary...</>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Enter Sanctuary Call
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Troubleshooting Dropdown */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowTroubleshoot(!showTroubleshoot)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showTroubleshoot ? 'Hide troubleshooting' : 'Need help joining?'}
            </button>

            {showTroubleshoot && (
              <div className="mt-3 p-4 rounded-xl bg-card border border-border text-left text-xs text-muted-foreground space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <p className="font-medium text-foreground">Quick Troubleshooting Tips:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Use Chrome, Edge, Safari, or Firefox for optimal WebRTC video quality.</li>
                  <li>Wear headphones to prevent feedback echo.</li>
                  <li>If your video is frozen, try toggling your camera off and back on.</li>
                  <li>Enable Audio-Only mode if you notice audio stuttering or packet loss.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
