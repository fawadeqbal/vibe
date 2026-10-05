import { Logger } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import { createRemoteJWKSet, importPKCS8, JWTVerifyGetKey, jwtVerify, SignJWT } from 'jose';
import { createHash } from 'node:crypto';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { SecretBox } from '../../../common/utils/secret-box';
import { FetchLike, ProviderHttp } from '../../../integrations/core/provider-http';
import { IdentityAdapter, SocialCredential, VerifiedIdentity } from './identity.types';

const APPLE = 'https://appleid.apple.com';
const JWKS = createRemoteJWKSet(new URL(`${APPLE}/auth/keys`));

export interface AppleSignInKeys {
  teamId: string;
  keyId: string;
  /** Sign in with Apple private key (.p8). */
  privateKey: string;
}

/**
 * Sign in with Apple.
 * - verify: Apple's ID token (signature, issuer, audience = bundle id or
 *   Services id, nonce = sha256 of the raw nonce the app made).
 * - with keys + the authorization code, the code is exchanged for a refresh
 *   token, kept sealed, and revoked when the account is deleted (required by
 *   App Store Review Guideline 5.1.1(v)).
 */
export class AppleIdentityAdapter implements IdentityAdapter {
  readonly provider = AuthProvider.APPLE;
  private readonly logger = new Logger(AppleIdentityAdapter.name);
  private readonly http: ProviderHttp;

  constructor(
    private readonly clientIds: string[],
    private readonly keys: AppleSignInKeys | undefined,
    private readonly box: SecretBox,
    fetchImpl?: FetchLike,
    private readonly jwks: JWTVerifyGetKey = JWKS,
  ) {
    this.http = new ProviderHttp('apple-signin', APPLE, fetchImpl);
  }

  async verify(c: SocialCredential): Promise<VerifiedIdentity> {
    if (!c.idToken) throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Apple sign-in needs an ID token', 400);
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(c.idToken, this.jwks, { issuer: APPLE, audience: this.clientIds }));
    } catch {
      throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Could not verify that Apple sign-in', 401);
    }
    if (c.nonce) {
      const expected = createHash('sha256').update(c.nonce).digest('hex');
      if (payload.nonce !== expected && payload.nonce !== c.nonce) throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Apple sign-in nonce mismatch', 401);
    }
    const clientId = Array.isArray(payload.aud) ? String(payload.aud[0]) : String(payload.aud);
    const refreshToken = c.authorizationCode ? await this.exchange(c.authorizationCode, clientId) : undefined;
    return {
      provider: this.provider,
      subject: String(payload.sub),
      email: payload.email as string | undefined,
      // Apple sends booleans as strings in some token versions.
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: c.name,
      refreshToken,
    };
  }

  async revoke(sealed: string): Promise<void> {
    if (!this.keys) return;
    const { clientId, token } = JSON.parse(this.box.open(sealed)) as { clientId: string; token: string };
    await this.http.request('/auth/revoke', {
      method: 'POST',
      body: new URLSearchParams({ client_id: clientId, client_secret: await this.clientSecret(clientId), token, token_type_hint: 'refresh_token' }),
      retries: 2,
    });
  }

  /** Authorization code → refresh token (sealed with the client id it belongs to). Failure doesn't block sign-in. */
  private async exchange(code: string, clientId: string): Promise<string | undefined> {
    if (!this.keys) return undefined;
    try {
      const res = await this.http.request<{ refresh_token?: string }>('/auth/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: clientId, client_secret: await this.clientSecret(clientId), code, grant_type: 'authorization_code' }),
      });
      return res.body.refresh_token ? this.box.seal(JSON.stringify({ clientId, token: res.body.refresh_token })) : undefined;
    } catch (e) {
      this.logger.warn(`Apple code exchange failed: ${(e as Error).message}`);
      return undefined;
    }
  }

  /** The ES256 "client secret" Apple wants: a short JWT signed with the Sign in with Apple key. */
  private async clientSecret(clientId: string): Promise<string> {
    const k = this.keys!;
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: k.keyId })
      .setIssuer(k.teamId)
      .setSubject(clientId)
      .setAudience(APPLE)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(await importPKCS8(k.privateKey, 'ES256'));
  }
}
