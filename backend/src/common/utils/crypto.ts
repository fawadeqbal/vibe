import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const hmacSha256Hex = (secret: string, value: string): string => createHmac('sha256', secret).update(value).digest('hex');

export const hmacSha1Base64 = (secret: string, value: string): string => createHmac('sha1', secret).update(value).digest('base64');

/** URL-safe random token (refresh tokens, invite codes…). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** n-digit numeric code, uniformly random (OTP). */
export const randomDigits = (n: number): string => Array.from({ length: n }, () => randomInt(0, 10)).join('');

/** Short human-friendly code without look-alike characters. */
export function friendlyCode(length = 7): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => alphabet[randomInt(0, alphabet.length)]).join('');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
