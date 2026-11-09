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

/** The phone apps (Android, iPhone) as opposed to the website. */
export const isApp = (c: ClientKind | string | null | undefined): boolean => c === 'android' || c === 'ios';

/**
 * Which Vibe a socket comes from. Browsers can't set headers on a WebSocket,
 * so both apps say it in the handshake's `auth.client` (same value as their
 * X-Client header); older app builds still give themselves away with "Dart/…".
 */
export function socketClient(handshake: { auth?: Record<string, unknown>; headers: Headers }): ClientKind {
  const said = typeof handshake.auth?.client === 'string' ? handshake.auth.client : undefined;
  return clientKind({ 'x-client': said ?? one(handshake.headers['x-client']), 'user-agent': handshake.headers['user-agent'] });
}
