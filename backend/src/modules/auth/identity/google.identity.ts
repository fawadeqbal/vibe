import { AuthProvider } from '@prisma/client';
import { createRemoteJWKSet, JWTVerifyGetKey, jwtVerify } from 'jose';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { IdentityAdapter, SocialCredential, VerifiedIdentity } from './identity.types';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Google Sign-In: the app (google_sign_in, with `serverClientId` = the web
 * client id) sends the ID token; we check Google's signature, issuer and
 * that the audience is one of our OAuth client ids.
 */
export class GoogleIdentityAdapter implements IdentityAdapter {
  readonly provider = AuthProvider.GOOGLE;

  constructor(
    private readonly clientIds: string[],
    private readonly keys: JWTVerifyGetKey = JWKS,
  ) {}

  async verify(c: SocialCredential): Promise<VerifiedIdentity> {
    if (!c.idToken) throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Google sign-in needs an ID token', 400);
    try {
      const { payload } = await jwtVerify(c.idToken, this.keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: this.clientIds });
      if (!payload.sub) throw new Error('no subject');
      return {
        provider: this.provider,
        subject: payload.sub,
        email: payload.email as string | undefined,
        emailVerified: payload.email_verified === true,
        name: (payload.name as string | undefined) ?? c.name,
      };
    } catch {
      throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Could not verify that Google sign-in', 401);
    }
  }
}
