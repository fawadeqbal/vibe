import { exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { createHash } from 'node:crypto';

import { SecretBox } from '../../../common/utils/secret-box';
import { AppleIdentityAdapter } from './apple.identity';
import { DevIdentityAdapter } from './dev.identity';
import { FacebookIdentityAdapter } from './facebook.identity';
import { GoogleIdentityAdapter } from './google.identity';

/** A signing key and a JWKS getter that returns its public half, like a provider's JWKS endpoint. */
async function issuer(alg: 'RS256' | 'ES256') {
  const { publicKey, privateKey } = await generateKeyPair(alg);
  const sign = (claims: Record<string, unknown>, opts: { iss: string; aud: string; sub: string; exp?: string }) =>
    new SignJWT(claims).setProtectedHeader({ alg, kid: 'k1' }).setIssuer(opts.iss).setAudience(opts.aud).setSubject(opts.sub).setIssuedAt().setExpirationTime(opts.exp ?? '10m').sign(privateKey);
  return { sign, keys: async () => publicKey };
}

type FakeRoute = (url: URL, init?: RequestInit) => { status?: number; body: unknown };
const fakeFetch = (route: FakeRoute) => async (input: string, init?: RequestInit) => {
  const r = route(new URL(input), init);
  return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
};

describe('identity adapters', () => {
  it('dev adapter reads dev:<id>:<name>:<email> and rejects anything else', async () => {
    const dev = new DevIdentityAdapter('GOOGLE');
    await expect(dev.verify({ idToken: 'dev:g1:Ali:ali@x.com' })).resolves.toMatchObject({ subject: 'g1', name: 'Ali', email: 'ali@x.com', emailVerified: true });
    await expect(dev.verify({ idToken: 'eyJreal' })).rejects.toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
  });

  it('Google: accepts our audience, rejects another app and a wrong issuer', async () => {
    const g = await issuer('RS256');
    const adapter = new GoogleIdentityAdapter(['web.apps.googleusercontent.com'], g.keys);
    const ok = await g.sign({ email: 'sara@gmail.com', email_verified: true, name: 'Sara' }, { iss: 'https://accounts.google.com', aud: 'web.apps.googleusercontent.com', sub: '1234' });
    await expect(adapter.verify({ idToken: ok })).resolves.toEqual({ provider: 'GOOGLE', subject: '1234', email: 'sara@gmail.com', emailVerified: true, name: 'Sara' });
    const otherApp = await g.sign({}, { iss: 'https://accounts.google.com', aud: 'someone-else', sub: '1234' });
    await expect(adapter.verify({ idToken: otherApp })).rejects.toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
    const badIss = await g.sign({}, { iss: 'https://evil.example', aud: 'web.apps.googleusercontent.com', sub: '1234' });
    await expect(adapter.verify({ idToken: badIss })).rejects.toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
  });

  it('Apple: checks the nonce, exchanges the code for a sealed refresh token and revokes it', async () => {
    const a = await issuer('RS256');
    const signin = await generateKeyPair('ES256', { extractable: true });
    const box = new SecretBox('test-key-0123456789-0123456789-0123');
    const calls: string[] = [];
    const fetchImpl = fakeFetch((url, init) => {
      calls.push(`${url.pathname} ${new URLSearchParams(String(init?.body)).get('client_id')}`);
      return url.pathname === '/auth/token' ? { body: { refresh_token: 'apple-refresh' } } : { body: {} };
    });
    const adapter = new AppleIdentityAdapter(['com.vibe.app'], { teamId: 'TEAM', keyId: 'KEY', privateKey: await exportPKCS8(signin.privateKey) }, box, fetchImpl, a.keys);
    const nonce = 'raw-nonce-123456';
    const token = await a.sign({ nonce: createHash('sha256').update(nonce).digest('hex'), email: 'x@privaterelay.appleid.com', email_verified: 'true' }, { iss: 'https://appleid.apple.com', aud: 'com.vibe.app', sub: 'apple-sub' });
    const id = await adapter.verify({ idToken: token, nonce, authorizationCode: 'code', name: 'Zara' });
    expect(id).toMatchObject({ provider: 'APPLE', subject: 'apple-sub', emailVerified: true, name: 'Zara' });
    expect(JSON.parse(box.open(id.refreshToken!))).toEqual({ clientId: 'com.vibe.app', token: 'apple-refresh' });
    await adapter.revoke(id.refreshToken!);
    expect(calls).toEqual(['/auth/token com.vibe.app', '/auth/revoke com.vibe.app']);
    await expect(adapter.verify({ idToken: token, nonce: 'a-different-nonce' })).rejects.toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
  });

  it('Facebook: access token must be valid and issued to our app', async () => {
    const graph = (appId: string, valid = true) =>
      fakeFetch((url) => (url.pathname.endsWith('/debug_token') ? { body: { data: { app_id: appId, is_valid: valid, user_id: 'fb1' } } } : { body: { id: 'fb1', name: 'Hina', email: 'h@x.com' } }));
    await expect(new FacebookIdentityAdapter('APP', 'SECRET', graph('APP')).verify({ accessToken: 't' })).resolves.toEqual({ provider: 'FACEBOOK', subject: 'fb1', name: 'Hina', email: 'h@x.com', emailVerified: false });
    await expect(new FacebookIdentityAdapter('APP', 'SECRET', graph('OTHER')).verify({ accessToken: 't' })).rejects.toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
    await expect(new FacebookIdentityAdapter('APP', 'SECRET', graph('APP', false)).verify({ accessToken: 't' })).rejects.toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
  });

  it('Facebook Limited Login: ID token with audience = app id', async () => {
    const f = await issuer('RS256');
    const adapter = new FacebookIdentityAdapter('APP', 'SECRET', undefined, f.keys);
    const token = await f.sign({ nonce: 'n-12345678', name: 'Omar' }, { iss: 'https://www.facebook.com', aud: 'APP', sub: 'fb2' });
    await expect(adapter.verify({ idToken: token, nonce: 'n-12345678' })).resolves.toMatchObject({ subject: 'fb2', name: 'Omar' });
    await expect(adapter.verify({ idToken: token, nonce: 'other-nonce' })).rejects.toMatchObject({ code: 'SOCIAL_TOKEN_INVALID' });
  });
});
