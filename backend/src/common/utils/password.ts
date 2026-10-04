import { randomBytes, scrypt as scryptCb, ScryptOptions, timingSafeEqual } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

// N=2^15, r=8, p=1: ~50 ms per hash, 32 MiB memory (OWASP minimum for scrypt).
const PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

/** `scrypt$N$r$p$salt$hash` (base64url). No native module, no extra dependency. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to compare against when the account doesn't exist, so timing doesn't reveal it. */
export const DUMMY_PASSWORD_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Readable temporary password: 4 groups of 4 from an unambiguous alphabet. */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  chars[15] = '23456789'[bytes[15] % 8]; // always letters and digits
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Minimum bar for staff passwords: 10+ chars with letters and digits. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use letters and numbers';
  return null;
}
