export type ClientKind = 'android' | 'ios' | 'web';
export const CLIENT_KINDS: readonly ClientKind[] = ['android', 'ios', 'web'];

type Headers = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Which Vibe the request came from. The apps send `X-Client: android/0.1.5`
 * (or `ios/…`); the web app sends `X-Client: web`. Older app builds don't send
 * it, but their HTTP client identifies as "Dart/…", and only Android shipped.
 */
export function clientKind(headers: Headers): ClientKind {
  const h = one(headers['x-client']).toLowerCase().split('/')[0].trim();
  if ((CLIENT_KINDS as string[]).includes(h)) return h as ClientKind;
  if (/^Dart\//.test(one(headers['user-agent']))) return 'android';
  return 'web';
}
