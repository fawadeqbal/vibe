import { createHash } from 'node:crypto';

/**
 * Ties a store purchase to a Vibe account. The app passes these to the
 * store when buying (Play: `obfuscatedAccountId`, Apple: `appAccountToken`),
 * and we check them when verifying, so a receipt can't be redeemed by
 * another account. Neither reveals the user id.
 */
export function playAccountToken(userId: string): string {
  return createHash('sha256').update(`vibe-play:${userId}`).digest('hex');
}

/** RFC 4122 v4-shaped UUID derived from the user id (App Store wants a UUID). */
export function appleAccountToken(userId: string): string {
  const h = createHash('sha256').update(`vibe-apple:${userId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
