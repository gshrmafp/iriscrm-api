import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../../../config/env';

// AES-256-GCM for HR statutory identifiers. Ciphertext format:
//   v1:<iv base64>:<auth tag base64>:<ciphertext base64>
// The version prefix leaves room for key rotation later.
const DEV_FALLBACK_KEY = 'iris-local-development-only-hr-encryption-key';

function key(): Buffer {
  const secret = env.HR_ENCRYPTION_KEY;
  if (!secret) {
    if (env.NODE_ENV === 'production') {
      throw new Error('HR_ENCRYPTION_KEY must be set in production to store HR statutory data');
    }
    return createHash('sha256').update(DEV_FALLBACK_KEY).digest();
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptField(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unrecognised encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

// Shows only the last 4 characters, e.g. "XXXXXXXX1234".
export function maskValue(plain: string): string {
  if (plain.length <= 4) return 'X'.repeat(plain.length);
  return 'X'.repeat(plain.length - 4) + plain.slice(-4);
}
