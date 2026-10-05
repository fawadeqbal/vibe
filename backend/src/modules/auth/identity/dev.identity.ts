import { AuthProvider } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { IdentityAdapter, SocialCredential, VerifiedIdentity } from './identity.types';

/**
 * Development stand-in for every provider: the "token" is `dev:<subject>[:<name>[:<email>]]`,
 * so the whole sign-in flow works without any provider account. Never used in live mode.
 */
export class DevIdentityAdapter implements IdentityAdapter {
  constructor(readonly provider: AuthProvider) {}

  async verify(c: SocialCredential): Promise<VerifiedIdentity> {
    const token = c.idToken ?? c.accessToken ?? '';
    const [scheme, subject, name, email] = token.split(':');
    if (scheme !== 'dev' || !subject) throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, 'Dev tokens look like dev:<id>', 401);
    return { provider: this.provider, subject, name: name || c.name, email: email || undefined, emailVerified: !!email };
  }
}
