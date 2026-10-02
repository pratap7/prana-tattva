import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { getEnvConfig } from '../../../config/env.config';

export interface EncryptedMessagePayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

@Injectable()
export class MessageEncryptionService {
  private readonly logger = new Logger(MessageEncryptionService.name);
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12; // 96 bits for GCM recommended by NIST
  private readonly ACTIVE_KEY_VERSION = 1;

  /**
   * Derives a consistent 32-byte Buffer from a string key using SHA-256.
   */
  private deriveKey(rawKey: string): Buffer {
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Retrieves the encryption key buffer for a given key version.
   * Supports key rotation: messages written with older keys can still be decrypted.
   */
  private getKeyForVersion(version: number): Buffer {
    const config = getEnvConfig();
    if (version === 2 && config.MESSAGE_ENCRYPTION_KEY_V2) {
      return this.deriveKey(config.MESSAGE_ENCRYPTION_KEY_V2);
    }
    // Default version 1
    return this.deriveKey(config.MESSAGE_ENCRYPTION_KEY);
  }

  /**
   * Encrypts plaintext message payload using AES-256-GCM.
   * IMPORTANT: Never logs or exposes plaintext content.
   */
  encrypt(plaintext: string, keyVersion = this.ACTIVE_KEY_VERSION): EncryptedMessagePayload {
    const key = this.getKeyForVersion(keyVersion);
    const iv = crypto.randomBytes(this.IV_LENGTH);

    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyVersion,
    };
  }

  /**
   * Decrypts ciphertext message payload using AES-256-GCM and verifies authenticity tag.
   * Returns decrypted plaintext.
   */
  decrypt(payload: {
    ciphertext: string;
    iv: string;
    authTag?: string | null;
    keyVersion?: number;
  }): string {
    const version = payload.keyVersion || 1;
    const key = this.getKeyForVersion(version);
    const iv = Buffer.from(payload.iv, 'hex');
    const ciphertext = Buffer.from(payload.ciphertext, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    if (payload.authTag) {
      decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
    }

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
