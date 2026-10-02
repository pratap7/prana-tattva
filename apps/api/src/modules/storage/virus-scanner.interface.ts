export interface VirusScanResult {
  isClean: boolean;
  threatName?: string;
  scannedAt: Date;
}

export interface VirusScanner {
  scanFile(fileKey: string, buffer?: Buffer): Promise<VirusScanResult>;
}

export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');
