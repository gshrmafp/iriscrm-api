import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import type { StorageDriver } from './index';

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const root = path.resolve(env.UPLOADS_DIR);

export const localDiskStorage: StorageDriver = {
  async upload({ buffer, fileName, scope }) {
    const dir = path.join(root, scope);
    await fs.promises.mkdir(dir, { recursive: true });

    const storageKey = path.join(scope, `${randomUUID()}-${sanitizeFileName(fileName)}`);
    await fs.promises.writeFile(path.join(root, storageKey), buffer);

    return { storageKey, sizeBytes: buffer.length };
  },

  getFilePath(storageKey: string) {
    return path.join(root, storageKey);
  },

  async delete(storageKey: string) {
    try {
      await fs.promises.unlink(path.join(root, storageKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  },
};
