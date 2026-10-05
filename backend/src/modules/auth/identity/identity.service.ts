import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuthProvider } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { SecretBox } from '../../../common/utils/secret-box';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { Integration, IntegrationReporter, IntegrationStatus, missingKeys, resolveMode } from '../../../integrations/core/integration.types';
import { readSecret } from '../../../integrations/core/secrets';
import { USER_DELETING, UserDeletingEvent } from '../../users/users.service';
import { AppleIdentityAdapter } from './apple.identity';
import { DevIdentityAdapter } from './dev.identity';
import { FacebookIdentityAdapter } from './facebook.identity';
import { GoogleIdentityAdapter } from './google.identity';
import { IdentityAdapter, IdentityProviderState, SocialCredential, VerifiedIdentity } from './identity.types';

const REQUIRED: Record<AuthProvider, string[]> = {
  GOOGLE: ['GOOGLE_CLIENT_IDS'],
  APPLE: ['APPLE_CLIENT_IDS'],
  FACEBOOK: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
};
const LABEL: Record<AuthProvider, string> = { GOOGLE: 'Google sign-in', APPLE: 'Sign in with Apple', FACEBOOK: 'Facebook Login' };

/**
 * Picks the adapter for each social login (live with keys, dev stand-in
 * otherwise — see SOCIAL_VERIFIER) and revokes provider access when an
 * account is deleted.
 */
@Integration()
@Injectable()
export class IdentityService implements IntegrationReporter {
  private readonly logger = new Logger(IdentityService.name);
  private readonly states: Record<AuthProvider, IdentityProviderState>;
  private readonly box: SecretBox;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {
    this.box = new SecretBox(config.dataKey('identities'));
    this.states = {
      GOOGLE: this.build(AuthProvider.GOOGLE, () => new GoogleIdentityAdapter(config.list('GOOGLE_CLIENT_IDS'))),
      APPLE: this.build(AuthProvider.APPLE, () => new AppleIdentityAdapter(config.list('APPLE_CLIENT_IDS'), this.appleKeys(), this.box)),
      FACEBOOK: this.build(AuthProvider.FACEBOOK, () => new FacebookIdentityAdapter(config.get('FACEBOOK_APP_ID'), config.get('FACEBOOK_APP_SECRET'))),
    };
  }

  private build(provider: AuthProvider, live: () => IdentityAdapter): IdentityProviderState {
    const configured = missingKeys(this.config.env, REQUIRED[provider]).length === 0;
    const mode = resolveMode(this.config.get('SOCIAL_VERIFIER') as 'dev' | 'live' | 'auto', configured, this.config.isProduction);
    return { mode, adapter: mode === 'live' ? live() : mode === 'dev' ? new DevIdentityAdapter(provider) : undefined };
  }

  private appleKeys() {
    const privateKey = readSecret(this.config.get('APPLE_SIGNIN_PRIVATE_KEY'));
    const teamId = this.config.get('APPLE_TEAM_ID');
    const keyId = this.config.get('APPLE_SIGNIN_KEY_ID');
    return privateKey && teamId && keyId ? { privateKey, teamId, keyId } : undefined;
  }

  /** Which providers the app should show buttons for. */
  available(): AuthProvider[] {
    return (Object.keys(this.states) as AuthProvider[]).filter((p) => this.states[p].adapter);
  }

  async verify(provider: AuthProvider, credential: SocialCredential): Promise<VerifiedIdentity> {
    const adapter = this.states[provider].adapter;
    if (!adapter) throw new AppError(ErrorCode.SOCIAL_TOKEN_INVALID, `${LABEL[provider]} isn't available yet`, HttpStatus.SERVICE_UNAVAILABLE);
    return adapter.verify(credential);
  }

  /** Account deletion: revoke what providers granted us (Apple requires it). Best effort. */
  @OnEvent(USER_DELETING, { async: true, promisify: true })
  async onUserDeleting(e: UserDeletingEvent): Promise<void> {
    const ids = await this.prisma.authIdentity.findMany({ where: { userId: e.userId, refreshToken: { not: null } } });
    for (const id of ids) {
      const adapter = this.states[id.provider].adapter;
      if (!adapter?.revoke || !id.refreshToken) continue;
      try {
        await adapter.revoke(id.refreshToken);
      } catch (err) {
        this.logger.warn({ err, provider: id.provider }, 'Revoking provider access failed');
      }
    }
  }

  integrationStatus(): IntegrationStatus[] {
    return (Object.keys(this.states) as AuthProvider[]).map((p) => {
      const notes: string[] = [];
      if (p === AuthProvider.APPLE && !this.appleKeys()) notes.push('Add APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID and APPLE_SIGNIN_PRIVATE_KEY so tokens can be revoked when users delete their account (App Store rule).');
      if (this.states[p].mode === 'dev') notes.push('Dev: tokens "dev:<id>[:<name>]" sign in without the provider.');
      return {
        key: `login.${p.toLowerCase()}`,
        kind: 'login' as const,
        label: LABEL[p],
        mode: this.states[p].mode,
        requiredEnv: REQUIRED[p],
        missingEnv: missingKeys(this.config.env, REQUIRED[p]),
        endpoints: p === AuthProvider.APPLE ? [{ label: 'Services ID return URL (Android web flow)', url: this.config.url('/v1/auth/apple/callback') }] : undefined,
        notes,
      };
    });
  }
}
