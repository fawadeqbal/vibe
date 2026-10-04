import { createHmac } from 'node:crypto';

import { safeEqual } from '../../common/utils/crypto';

/** Signed, non-expiring link that turns off e-mail updates for one person. */
export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac('sha256', `unsubscribe:${secret}`).update(userId).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribe(userId: string, token: string, secret: string): boolean {
  return safeEqual(unsubscribeToken(userId, secret), token);
}

export function unsubscribeUrl(publicUrl: string, userId: string, secret: string): string {
  return `${publicUrl.replace(/\/$/, '')}/v1/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId, secret)}`;
}
