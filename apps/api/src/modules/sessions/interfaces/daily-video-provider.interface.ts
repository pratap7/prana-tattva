export const DAILY_VIDEO_PROVIDER = 'DAILY_VIDEO_PROVIDER';

export interface CreateRoomOptions {
  name: string; // Cryptographically random room name (e.g. nirvana-...)
  nbf: number; // Unix timestamp (seconds) when room becomes valid (-10 min)
  exp: number; // Unix timestamp (seconds) when room expires (+30 min)
  privacy?: 'private' | 'public';
  enableKnocking?: boolean; // Waiting room / lobby
  enableScreenshare?: boolean;
}

export interface DailyRoomInfo {
  id: string;
  name: string;
  url: string;
  privacy: string;
  createdAt: string;
  config: {
    nbf: number;
    exp: number;
    enable_knocking?: boolean;
    enable_screenshare?: boolean;
    enable_recording?: string;
  };
}

export interface CreateMeetingTokenOptions {
  roomName: string;
  isOwner: boolean; // true for provider (host), false for consumer
  userId: string;
  userName: string;
  expiryEpochSec: number;
  enableScreenshare?: boolean;
}

export interface DailyVideoProvider {
  createRoom(options: CreateRoomOptions): Promise<DailyRoomInfo>;
  createMeetingToken(options: CreateMeetingTokenOptions): Promise<string>;
  extendRoom(roomName: string, newExpEpochSec: number): Promise<void>;
  startRecording(roomName: string): Promise<{ recordingId: string }>;
  stopRecording(roomName: string): Promise<void>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
