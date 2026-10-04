import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { normalizeEmail } from '../../common/utils/text';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MeProfile } from '../users/user.mapper';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp.service';
import { SocialVerifier } from './providers/social-verifier';
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
    private readonly social: SocialVerifier,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
  ) {}

  requestOtp(rawEmail: string) {
    return this.otp.request(normalizeEmail(rawEmail));
  }

  async verifyOtp(rawEmail: string, code: string, inviteCode: string | undefined, client: ClientInfo): Promise<AuthResult> {
    const email = normalizeEmail(rawEmail);
    await this.otp.verify(email, code);
    return this.signIn({ email }, () => this.users.create({ email, inviteCode }), client);
  }

  async socialSignIn(provider: 'google' | 'apple', idToken: string, inviteCode: string | undefined, client: ClientInfo): Promise<AuthResult> {
    const id = await this.social.verify(provider, idToken);
    const where: Prisma.UserWhereUniqueInput = provider === 'google' ? { googleSub: id.subject } : { appleSub: id.subject };
    return this.signIn(
      where,
      () => this.users.create({ ...(provider === 'google' ? { googleSub: id.subject } : { appleSub: id.subject }), name: id.name, inviteCode }),
      client,
    );
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<{ tokens: TokenPair; user: MeProfile }> {
    const { tokens, userId } = await this.tokens.rotate(refreshToken, client);
    return { tokens, user: await this.users.me(userId) };
  }

  logout(refreshToken: string) {
    return this.tokens.revoke(refreshToken);
  }

  private async signIn(where: Prisma.UserWhereUniqueInput, create: () => Promise<User>, client: ClientInfo): Promise<AuthResult> {
    let user = await this.prisma.user.findUnique({ where });
    let isNew = false;
    if (user && user.status !== UserStatus.ACTIVE) throw AppError.forbidden('This account was deleted');
    if (!user) {
      if (!(await this.settings.get('signups.enabled'))) {
        throw new AppError(ErrorCode.SIGNUPS_CLOSED, "We're not taking new sign-ups right now. Please try again later.", HttpStatus.FORBIDDEN);
      }
      try {
        user = await create();
        isNew = true;
      } catch (e) {
        // Two devices signing up the same number at once: use the winner.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') user = await this.prisma.user.findUniqueOrThrow({ where });
        else throw e;
      }
    }
    const tokens = await this.tokens.issue(user, client);
    return { tokens, user: await this.users.me(user.id), isNew };
  }
}
