import { localDiskStorage } from './localDiskStorage';

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
}

export interface StorageDriver {
  upload(params: { buffer: Buffer; fileName: string; mimeType: string; scope: string }): Promise<StoredFile>;
  getFilePath(storageKey: string): string;
  delete(storageKey: string): Promise<void>;
}

// Single swap point for a future S3/R2 driver — nothing outside this file
// should import localDiskStorage directly.
export const storage: StorageDriver = localDiskStorage;
