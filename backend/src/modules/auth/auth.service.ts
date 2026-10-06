import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthProvider, Prisma, User, UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { normalizeEmail } from '../../common/utils/text';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MeProfile } from '../users/user.mapper';
import { NewUserInput, UsersService } from '../users/users.service';

/** Invite attribution sent with sign-in; used only when the account is created. */
export type SignUpInvite = Pick<NewUserInput, 'inviteCode' | 'inviteSource' | 'inviteVia' | 'deviceId'>;
import { OtpService } from './otp.service';
import { IdentityService } from './identity/identity.service';
import { SocialCredential, VerifiedIdentity } from './identity/identity.types';
import { ClientInfo, TokenPair, TokenService } from './token.service';

export interface AuthResult {
  tokens: TokenPair;
  user: MeProfile;
  isNew: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly identities: IdentityService,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
  ) {}

  requestOtp(rawEmail: string) {
    return this.otp.request(normalizeEmail(rawEmail));
  }

  async verifyOtp(rawEmail: string, code: string, invite: SignUpInvite, client: ClientInfo): Promise<AuthResult> {
    const email = normalizeEmail(rawEmail);
    await this.otp.verify(email, code);
    const find = () => this.prisma.user.findUnique({ where: { email } });
    return this.signIn(find, () => this.users.create({ email, ...invite, ip: client.ip }), client, find);
  }

  /**
   * Social sign-in. Finds the account by the provider identity; otherwise a
   * provider-verified e-mail that matches an existing account links to it;
   * otherwise a new account is made with the identity attached.
   */
  async socialSignIn(provider: AuthProvider, credential: SocialCredential, invite: SignUpInvite, client: ClientInfo): Promise<AuthResult> {
    const id = await this.identities.verify(provider, credential);
    const linked = await this.prisma.authIdentity.findUnique({ where: { provider_subject: { provider, subject: id.subject } } });
    if (linked) {
      await this.touchIdentity(linked.id, id);
      return this.signIn(() => this.prisma.user.findUnique({ where: { id: linked.userId } }), null, client);
    }
    const email = id.email && id.emailVerified ? normalizeEmail(id.email) : undefined;
    const byEmail = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    if (byEmail && byEmail.status === UserStatus.ACTIVE) {
      await this.attach(byEmail.id, id);
      return this.signIn(async () => byEmail, null, client);
    }
    return this.signIn(
      async () => null,
      () => this.users.create({ email: byEmail ? undefined : email, identity: { provider, subject: id.subject, email: id.email, refreshToken: id.refreshToken }, name: id.name, ...invite, ip: client.ip }),
      client,
      async () => {
        const winner = await this.prisma.authIdentity.findUnique({ where: { provider_subject: { provider, subject: id.subject } } });
        return winner ? this.prisma.user.findUnique({ where: { id: winner.userId } }) : null;
      },
    );
  }

  /** Sign-in methods on the account (e-mail + linked providers). */
  async listIdentities(userId: string) {
    const [user, ids] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      this.prisma.authIdentity.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      email: user.email,
      identities: ids.map((i) => ({ provider: i.provider, email: i.email, linkedAt: i.createdAt.toISOString(), lastUsedAt: i.lastUsedAt?.toISOString() ?? null })),
      available: this.identities.available().map((p) => p.toLowerCase()),
    };
  }

  /** Link another provider to the signed-in account. */
  async linkIdentity(userId: string, provider: AuthProvider, credential: SocialCredential) {
    const id = await this.identities.verify(provider, credential);
    const existing = await this.prisma.authIdentity.findUnique({ where: { provider_subject: { provider, subject: id.subject } } });
    if (existing && existing.userId !== userId) throw AppError.conflict('That account is already linked to another Vibe profile');
    if (existing) await this.touchIdentity(existing.id, id);
    else await this.attach(userId, id);
    return this.listIdentities(userId);
  }

  /** Unlink a provider; the account must keep at least one way to sign in. */
  async unlinkIdentity(userId: string, provider: AuthProvider) {
    const { email, identities } = await this.listIdentities(userId);
    if (!identities.some((i) => i.provider === provider)) throw AppError.notFound('Linked sign-in');
    if (!email && identities.length <= 1) throw AppError.conflict('Add another way to sign in before removing this one');
    await this.prisma.authIdentity.deleteMany({ where: { userId, provider } });
    return this.listIdentities(userId);
  }

  private async attach(userId: string, id: VerifiedIdentity): Promise<void> {
    await this.prisma.authIdentity.create({ data: { userId, provider: id.provider, subject: id.subject, email: id.email, refreshToken: id.refreshToken, lastUsedAt: new Date() } });
  }

  private async touchIdentity(identityId: string, id: VerifiedIdentity): Promise<void> {
    await this.prisma.authIdentity.update({ where: { id: identityId }, data: { lastUsedAt: new Date(), ...(id.email ? { email: id.email } : {}), ...(id.refreshToken ? { refreshToken: id.refreshToken } : {}) } });
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<{ tokens: TokenPair; user: MeProfile }> {
    const { tokens, userId } = await this.tokens.rotate(refreshToken, client);
    return { tokens, user: await this.users.me(userId) };
  }

  logout(refreshToken: string) {
    return this.tokens.revoke(refreshToken);
  }

  /**
   * Shared tail of every sign-in: load the account (or create it when
   * `create` is given and sign-ups are open), then issue tokens.
   * `onRace` re-reads the winner when two devices create the same account at once.
   */
  private async signIn(find: () => Promise<User | null>, create: (() => Promise<User>) | null, client: ClientInfo, onRace?: () => Promise<User | null>): Promise<AuthResult> {
    let user = await find();
    let isNew = false;
    if (user && user.status !== UserStatus.ACTIVE) throw AppError.forbidden('This account was deleted');
    if (!user) {
      if (!create) throw AppError.notFound('Account');
      if (!(await this.settings.get('signups.enabled'))) {
        throw new AppError(ErrorCode.SIGNUPS_CLOSED, "We're not taking new sign-ups right now. Please try again later.", HttpStatus.FORBIDDEN);
      }
      try {
        user = await create();
        isNew = true;
      } catch (e) {
        // Two devices signing up the same number at once: use the winner.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && onRace) user = await onRace();
        else throw e;
        if (!user) throw e;
      }
    }
    const tokens = await this.tokens.issue(user, client);
    return { tokens, user: await this.users.me(user.id), isNew };
  }
}
