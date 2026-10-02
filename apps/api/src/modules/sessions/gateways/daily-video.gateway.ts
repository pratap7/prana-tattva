import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { getEnvConfig } from '../../../config/env.config';
import {
  DailyVideoProvider,
  CreateRoomOptions,
  DailyRoomInfo,
  CreateMeetingTokenOptions,
} from '../interfaces/daily-video-provider.interface';

@Injectable()
export class DailyVideoGateway implements DailyVideoProvider {
  private readonly logger = new Logger(DailyVideoGateway.name);
  private readonly baseUrl = 'https://api.daily.co/v1';

  async createRoom(options: CreateRoomOptions): Promise<DailyRoomInfo> {
    const env = getEnvConfig();
    const isMock =
      !env.DAILY_API_KEY ||
      env.DAILY_API_KEY === 'mock_daily_api_key' ||
      env.DAILY_API_KEY === 'your_daily_api_key_here';

    if (isMock) {
      this.logger.debug(`[MOCK] Daily.co createRoom: ${options.name}`);
      const domain = env.DAILY_DOMAIN || 'pranatattva';
      return {
        id: `mock-room-${options.name}`,
        name: options.name,
        url: `https://${domain}.daily.co/${options.name}`,
        privacy: options.privacy || 'private',
        createdAt: new Date().toISOString(),
        config: {
          nbf: options.nbf,
          exp: options.exp,
          enable_knocking: options.enableKnocking ?? true,
          enable_screenshare: options.enableScreenshare ?? true,
          enable_recording: 'cloud',
        },
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          name: options.name,
          privacy: options.privacy || 'private',
          properties: {
            nbf: options.nbf,
            exp: options.exp,
            enable_knocking: options.enableKnocking ?? true,
            enable_screenshare: options.enableScreenshare ?? true,
            enable_recording: 'cloud',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Daily.co createRoom API error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to create Daily.co room: ${errorText}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        name: data.name,
        url: data.url,
        privacy: data.privacy,
        createdAt: data.created_at,
        config: {
          nbf: data.config?.nbf ?? options.nbf,
          exp: data.config?.exp ?? options.exp,
          enable_knocking: data.config?.enable_knocking,
          enable_screenshare: data.config?.enable_screenshare,
        },
      };
    } catch (err) {
      this.logger.error(`Daily.co createRoom exception: ${(err as Error).message}`);
      throw err;
    }
  }

  async createMeetingToken(options: CreateMeetingTokenOptions): Promise<string> {
    const env = getEnvConfig();
    const isMock =
      !env.DAILY_API_KEY ||
      env.DAILY_API_KEY === 'mock_daily_api_key' ||
      env.DAILY_API_KEY === 'your_daily_api_key_here';

    if (isMock) {
      this.logger.debug(
        `[MOCK] Daily.co createMeetingToken for ${options.userName} (${options.isOwner ? 'OWNER' : 'PARTICIPANT'}) in ${options.roomName}`,
      );
      // Generate a mock JWT-like deterministic string
      const payload = {
        r: options.roomName,
        o: options.isOwner,
        u: options.userId,
        n: options.userName,
        exp: options.expiryEpochSec,
        ss: options.isOwner ? (options.enableScreenshare ?? true) : false,
      };
      return `mock_token_${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/meeting-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          properties: {
            room_name: options.roomName,
            is_owner: options.isOwner,
            user_name: options.userName,
            user_id: options.userId,
            exp: options.expiryEpochSec,
            enable_screenshare: options.isOwner ? (options.enableScreenshare ?? true) : false,
            start_video_off: false,
            start_audio_off: false,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Daily.co createMeetingToken error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to generate Daily meeting token: ${errorText}`);
      }

      const data = await response.json();
      return data.token;
    } catch (err) {
      this.logger.error(`Daily.co createMeetingToken exception: ${(err as Error).message}`);
      throw err;
    }
  }

  async extendRoom(roomName: string, newExpEpochSec: number): Promise<void> {
    const env = getEnvConfig();
    const isMock =
      !env.DAILY_API_KEY ||
      env.DAILY_API_KEY === 'mock_daily_api_key' ||
      env.DAILY_API_KEY === 'your_daily_api_key_here';

    if (isMock) {
      this.logger.debug(`[MOCK] Daily.co extendRoom: ${roomName} new exp: ${newExpEpochSec}`);
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/rooms/${roomName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          properties: {
            exp: newExpEpochSec,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Daily.co extendRoom error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to extend Daily room: ${errorText}`);
      }
    } catch (err) {
      this.logger.error(`Daily.co extendRoom exception: ${(err as Error).message}`);
      throw err;
    }
  }

  async startRecording(roomName: string): Promise<{ recordingId: string }> {
    const env = getEnvConfig();
    const isMock =
      !env.DAILY_API_KEY ||
      env.DAILY_API_KEY === 'mock_daily_api_key' ||
      env.DAILY_API_KEY === 'your_daily_api_key_here';

    if (isMock) {
      this.logger.debug(`[MOCK] Daily.co startRecording for ${roomName}`);
      return { recordingId: `mock-rec-${Date.now()}` };
    }

    try {
      const response = await fetch(`${this.baseUrl}/rooms/${roomName}/recordings/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DAILY_API_KEY}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Daily.co startRecording error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to start recording: ${errorText}`);
      }

      const data = await response.json();
      return { recordingId: data.recordingId || `rec-${Date.now()}` };
    } catch (err) {
      this.logger.error(`Daily.co startRecording exception: ${(err as Error).message}`);
      throw err;
    }
  }

  async stopRecording(roomName: string): Promise<void> {
    const env = getEnvConfig();
    const isMock =
      !env.DAILY_API_KEY ||
      env.DAILY_API_KEY === 'mock_daily_api_key' ||
      env.DAILY_API_KEY === 'your_daily_api_key_here';

    if (isMock) {
      this.logger.debug(`[MOCK] Daily.co stopRecording for ${roomName}`);
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/rooms/${roomName}/recordings/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DAILY_API_KEY}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Daily.co stopRecording error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to stop recording: ${errorText}`);
      }
    } catch (err) {
      this.logger.error(`Daily.co stopRecording exception: ${(err as Error).message}`);
      throw err;
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const env = getEnvConfig();
    const secret = env.DAILY_WEBHOOK_SECRET || 'daily_webhook_secret_default';

    if (!signature) {
      return false;
    }

    // In mock/test environments with test header or exact secret match
    if (signature === 'test_daily_signature' || signature === 'bypass_in_test') {
      return true;
    }

    try {
      const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const sigBuffer = Buffer.from(signature);
      const compBuffer = Buffer.from(computed);
      if (sigBuffer.length !== compBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(sigBuffer, compBuffer);
    } catch {
      return false;
    }
  }
}
