import { AuthProvider } from '@prisma/client';
import { createRemoteJWKSet, JWTVerifyGetKey, jwtVerify } from 'jose';
import { createHash, createHmac } from 'node:crypto';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { FetchLike, ProviderHttp } from '../../../integrations/core/provider-http';
import { IdentityAdapter, SocialCredential, VerifiedIdentity } from './identity.types';

const GRAPH = 'https://graph.facebook.com/v21.0';
const LIMITED_JWKS = createRemoteJWKSet(new URL('https://limited.facebook.com/.well-known/oauth/openid/jwks/'));

/**
 * Facebook Login.
 * - Classic (Android, iOS with tracking allowed): an access token. We ask
 *   Graph `debug_token` (with the app token) that it was issued to *our* app
 *   and is valid, then read id/name/email with `appsecret_proof`.
 * - Limited Login (iOS without tracking): an OIDC ID token, checked against
 *   Facebook's JWKS, audience = app id, nonce = sha256 of the app's nonce.
 * Facebook e-mails are not marked verified, so they never auto-link accounts.
 */
export class FacebookIdentityAdapter implements IdentityAdapter {
  readonly provider = AuthProvider.FACEBOOK;
  private readonly http: ProviderHttp;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    fetchImpl?: FetchLike,
    private readonly limitedJwks: JWTVerifyGetKey = LIMITED_JWKS,
  ) {
    this.http = new ProviderHttp('facebook', GRAPH, fetchImpl);
  }

  async verify(c: SocialCredential): Promise<VerifiedIdentity> {
    if (c.accessToken) return this.fromAccessToken(c.accessToken, c.name);
    if (c.idToken) return this.fromLimitedToken(c.idToken, c.nonce, c.name);
    throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Facebook sign-in needs an access token', 400);
  }

  private async fromAccessToken(token: string, fallbackName?: string): Promise<VerifiedIdentity> {
    try {
      const debug = await this.http.request<{ data?: { app_id?: string; is_valid?: boolean; user_id?: string } }>('/debug_token', {
        query: { input_token: token, access_token: `${this.appId}|${this.appSecret}` },
        retries: 1,
      });
      const d = debug.body.data;
      if (!d?.is_valid || d.app_id !== this.appId || !d.user_id) throw new Error('token not for this app');
      const proof = createHmac('sha256', this.appSecret).update(token).digest('hex');
      const me = await this.http.request<{ id: string; name?: string; email?: string }>('/me', { query: { fields: 'id,name,email', access_token: token, appsecret_proof: proof }, retries: 1 });
      if (me.body.id !== d.user_id) throw new Error('user mismatch');
      return { provider: this.provider, subject: me.body.id, name: me.body.name ?? fallbackName, email: me.body.email, emailVerified: false };
    } catch {
      throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Could not verify that Facebook sign-in', 401);
    }
  }

  private async fromLimitedToken(idToken: string, nonce?: string, fallbackName?: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(idToken, this.limitedJwks, { issuer: ['https://www.facebook.com', 'https://limited.facebook.com'], audience: this.appId });
      if (nonce && payload.nonce !== nonce && payload.nonce !== createHash('sha256').update(nonce).digest('hex')) throw new Error('nonce');
      return { provider: this.provider, subject: String(payload.sub), name: (payload.name as string | undefined) ?? fallbackName, email: payload.email as string | undefined, emailVerified: false };
    } catch {
      throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Could not verify that Facebook sign-in', 401);
    }
  }
}
