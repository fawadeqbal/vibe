import { AuthProvider } from '@prisma/client';

import { IntegrationMode } from '../../../integrations/core/integration.types';

/** What the app sends after the platform SDK signs the person in. */
export interface SocialCredential {
  /** OpenID ID token (Google, Apple, Facebook Limited Login). */
  idToken?: string;
  /** Facebook classic login access token. */
  accessToken?: string;
  /** Apple authorization code: lets the server get a refresh token (needed to revoke on deletion). */
  authorizationCode?: string;
  /** The raw nonce the app generated (Apple / Facebook Limited Login put its sha256 in the token). */
  nonce?: string;
  /** Apple only sends the name to the app, once, on first sign-in. */
  name?: string;
}

/** A sign-in the provider vouched for. */
export interface VerifiedIdentity {
  provider: AuthProvider;
  subject: string;
  email?: string;
  /** Only verified e-mails may link to an existing account. */
  emailVerified: boolean;
  name?: string;
  /** Sealed provider refresh token to keep (Apple). */
  refreshToken?: string;
}

/** One social login provider. Live adapters verify real tokens; the dev adapter accepts `dev:<id>[:<name>]`. */
export interface IdentityAdapter {
  readonly provider: AuthProvider;
  verify(credential: SocialCredential): Promise<VerifiedIdentity>;
  /** Revoke the app's access at the provider (account deletion). Best effort. */
  revoke?(sealedRefreshToken: string): Promise<void>;
}

export interface IdentityProviderState {
  mode: IntegrationMode;
  adapter?: IdentityAdapter;
}
