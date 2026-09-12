import crypto from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM vault for social-account credentials.
const key = crypto
  .createHash('sha256')
  .update(env.CREDENTIALS_ENCRYPTION_KEY || `${env.JWT_SECRET}:credentials-vault`)
  .digest();

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
