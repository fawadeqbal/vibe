import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AppConfig } from '../../../config/app-config.service';

export type SocialProvider = 'google' | 'apple';

export interface SocialIdentity {
  provider: SocialProvider;
  subject: string;
  email?: string;
  name?: string;
}

/** Turns an ID token from Google/Apple Sign-In into a verified identity. */
export abstract class SocialVerifier {
  abstract verify(provider: SocialProvider, idToken: string): Promise<SocialIdentity>;
}

/** Dev: accepts `dev:<subject>[:<name>]` so the flow works without keys. */
@Injectable()
export class DevSocialVerifier extends SocialVerifier {
  async verify(provider: SocialProvider, idToken: string): Promise<SocialIdentity> {
    const [scheme, subject, name] = idToken.split(':');
    if (scheme !== 'dev' || !subject) throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Dev tokens look like dev:<id>', 401);
    return { provider, subject, name };
  }
}

const ISSUERS: Record<SocialProvider, { jwks: string; issuer: string[] }> = {
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuer: ['https://accounts.google.com', 'accounts.google.com'] },
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuer: ['https://appleid.apple.com'] },
};

/** Production: verifies the token signature against Google's/Apple's JWKS. */
@Injectable()
export class JwksSocialVerifier extends SocialVerifier {
  private readonly sets = {
    google: createRemoteJWKSet(new URL(ISSUERS.google.jwks)),
    apple: createRemoteJWKSet(new URL(ISSUERS.apple.jwks)),
  };

  constructor(private readonly config: AppConfig) {
    super();
  }

  async verify(provider: SocialProvider, idToken: string): Promise<SocialIdentity> {
    const audience = this.config.list(provider === 'google' ? 'GOOGLE_CLIENT_IDS' : 'APPLE_CLIENT_IDS');
    try {
      const { payload } = await jwtVerify(idToken, this.sets[provider], { issuer: ISSUERS[provider].issuer, audience });
      if (!payload.sub) throw new Error('no subject');
      return { provider, subject: payload.sub, email: payload.email as string | undefined, name: payload.name as string | undefined };
    } catch {
      throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Could not verify that sign-in', 401);
    }
  }
}
