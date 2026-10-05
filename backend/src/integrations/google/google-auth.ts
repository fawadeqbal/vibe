import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, importPKCS8, JWTPayload, jwtVerify, SignJWT } from 'jose';

import { FetchLike, ProviderHttp } from '../core/provider-http';
import { ServiceAccountKey } from '../core/secrets';

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Google service-account access tokens (Play Developer API, FCM), cached
 * per account + scope until a minute before they expire; and verification
 * of Google-signed OIDC tokens (Pub/Sub push authentication).
 */
@Injectable()
export class GoogleAuth {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();
  private readonly jwks = createRemoteJWKSet(new URL(GOOGLE_CERTS));
  /** Swappable for tests. */
  fetchImpl: FetchLike = (i, init) => fetch(i, init);

  async accessToken(sa: ServiceAccountKey, scopes: string[]): Promise<string> {
    const key = `${sa.client_email}|${scopes.join(' ')}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
    const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const assertion = await new SignJWT({ scope: scopes.join(' ') })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(sa.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(sa.private_key, 'RS256'));
    const http = new ProviderHttp('google-oauth', '', this.fetchImpl);
    const res = await http.request<{ access_token: string; expires_in: number }>(tokenUri, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      retries: 2,
    });
    this.cache.set(key, { token: res.body.access_token, expiresAt: Date.now() + (res.body.expires_in ?? 3600) * 1000 });
    return res.body.access_token;
  }

  /** Verifies a Google-signed ID token (e.g. `Authorization: Bearer` on Pub/Sub push). */
  async verifyOidc(token: string, audience: string, email?: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.jwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience });
    if (email && payload.email !== email) throw new Error('Unexpected service account');
    if (email && payload.email_verified === false) throw new Error('E-mail not verified');
    return payload;
  }
}
