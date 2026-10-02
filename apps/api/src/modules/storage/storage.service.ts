import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { getEnvConfig } from '../../config/env.config';
import { VirusScanner, VirusScanResult } from './virus-scanner.interface';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly env = getEnvConfig();

  /**
   * Generates a presigned S3 upload URL for credentials/media
   */
  async generatePresignedUploadUrl(params: {
    folder: 'credentials' | 'videos' | 'avatars';
    ownerId: string;
    filename: string;
    contentType: string;
    maxSizeBytes: number;
    expiresInSeconds?: number;
  }): Promise<{ uploadUrl: string; fileKey: string; expiresAt: Date }> {
    const { folder, ownerId, filename, contentType, expiresInSeconds = 900 } = params;

    // Sanitize filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const fileKey = `${folder}/${ownerId}/${Date.now()}_${randomSuffix}_${sanitizedFilename}`;

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const expiresTimestamp = Math.floor(expiresAt.getTime() / 1000);

    // Build HMAC signature for secure local/MinIO/S3 compatible upload
    const stringToSign = `PUT\n\n${contentType}\n${expiresTimestamp}\n/${this.env.S3_BUCKET_NAME}/${fileKey}`;
    const signature = crypto
      .createHmac('sha1', this.env.S3_SECRET_ACCESS_KEY)
      .update(stringToSign)
      .digest('base64');

    const encodedSignature = encodeURIComponent(signature);
    const baseUrl = this.env.S3_ENDPOINT.replace(/\/$/, '');
    const uploadUrl = `${baseUrl}/${this.env.S3_BUCKET_NAME}/${fileKey}?AWSAccessKeyId=${encodeURIComponent(
      this.env.S3_ACCESS_KEY_ID,
    )}&Signature=${encodedSignature}&Expires=${expiresTimestamp}`;

    this.logger.log(`Generated presigned upload URL for key: ${fileKey} (Type: ${contentType})`);

    return {
      uploadUrl,
      fileKey,
      expiresAt,
    };
  }

  /**
   * Generates a signed, temporary download URL for viewing private credentials
   */
  async generatePresignedDownloadUrl(fileKey: string, expiresInSeconds = 900): Promise<string> {
    const expiresTimestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const stringToSign = `GET\n\n\n${expiresTimestamp}\n/${this.env.S3_BUCKET_NAME}/${fileKey}`;
    const signature = crypto
      .createHmac('sha1', this.env.S3_SECRET_ACCESS_KEY)
      .update(stringToSign)
      .digest('base64');

    const encodedSignature = encodeURIComponent(signature);
    const baseUrl = this.env.S3_ENDPOINT.replace(/\/$/, '');

    return `${baseUrl}/${this.env.S3_BUCKET_NAME}/${fileKey}?AWSAccessKeyId=${encodeURIComponent(
      this.env.S3_ACCESS_KEY_ID,
    )}&Signature=${encodedSignature}&Expires=${expiresTimestamp}`;
  }
}

/**
 * Stub antivirus scanner implementation for malware/trojan detection on document keys
 */
@Injectable()
export class StubVirusScanner implements VirusScanner {
  private readonly logger = new Logger(StubVirusScanner.name);

  async scanFile(fileKey: string): Promise<VirusScanResult> {
    this.logger.log(`🛡️ Antivirus scanning initiated for document key: ${fileKey}`);

    // Test heuristic: flag suspicious filenames / mock payloads
    const lowerKey = fileKey.toLowerCase();
    if (
      lowerKey.includes('eicar') ||
      lowerKey.includes('trojan') ||
      lowerKey.includes('malware.exe')
    ) {
      this.logger.warn(`🚨 Threat detected in file ${fileKey}: Win32/Eicar-Test-Signature`);
      throw new BadRequestException(
        'Security threat detected in uploaded document. File rejected by antivirus scanner.',
      );
    }

    // Default clean
    return {
      isClean: true,
      scannedAt: new Date(),
    };
  }
}
