import { readFileSync } from 'node:fs';

/**
 * Reads a secret from an env value. Keys like private keys and service
 * account JSON are awkward in .env files, so these forms all work:
 *   -----BEGIN PRIVATE KEY-----\nMIG...      (literal, `\n` escapes allowed)
 *   base64:LS0tLS1CRUdJTi...                (base64 of the whole thing)
 *   file:/run/secrets/apple_key.p8          (read from a mounted file)
 */
export function readSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (v.startsWith('base64:')) return Buffer.from(v.slice(7), 'base64').toString('utf8');
  if (v.startsWith('file:')) return readFileSync(v.slice(5), 'utf8');
  return v.replace(/\\n/g, '\n');
}

/** A Google service account key (the JSON file downloaded from Cloud Console). */
export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
}

export function readServiceAccount(value: string | undefined): ServiceAccountKey | undefined {
  const raw = readSecret(value);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as ServiceAccountKey;
  if (!parsed.client_email || !parsed.private_key) throw new Error('Service account JSON needs client_email and private_key');
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') };
}
