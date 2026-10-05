import { createHmac } from 'node:crypto';

import { safeEqual } from '../../../../common/utils/crypto';

/**
 * JazzCash pp_SecureHash: take every pp_/ppmpf_ field except pp_SecureHash
 * with a non-empty value, sort by field name (ordinal), join the values
 * with "&", put the integrity salt + "&" in front, HMAC-SHA256 it keyed
 * with the integrity salt, upper-case hex.
 */
export function jazzcashHash(fields: Record<string, unknown>, salt: string): string {
  const values = Object.keys(fields)
    .filter((k) => (k.startsWith('pp_') || k.startsWith('ppmpf_')) && k !== 'pp_SecureHash')
    .sort()
    .map((k) => (fields[k] === undefined || fields[k] === null ? '' : String(fields[k])))
    .filter((v) => v !== '');
  return createHmac('sha256', salt).update([salt, ...values].join('&')).digest('hex').toUpperCase();
}

export function jazzcashHashValid(fields: Record<string, unknown>, salt: string): boolean {
  const given = typeof fields.pp_SecureHash === 'string' ? fields.pp_SecureHash.toUpperCase() : '';
  return !!given && safeEqual(given, jazzcashHash(fields, salt));
}
