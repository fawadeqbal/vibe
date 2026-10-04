import { HttpStatus, Injectable } from '@nestjs/common';
import { StaffStatus, StaffUser } from '@prisma/client';
import type { Request } from 'express';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Clock } from '../../../common/utils/clock';
import { randomToken, sha256 } from '../../../common/utils/crypto';
import { DUMMY_PASSWORD_HASH, hashPassword, passwordProblem, verifyPassword } from '../../../common/utils/password';
import { SecretBox } from '../../../common/utils/secret-box';
import { newTotpSecret, otpauthUrl, verifyTotp } from '../../../common/utils/totp';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditService } from '../core/audit.service';
import { StaffContextService } from '../core/staff-context.service';
import type { StaffPrincipal } from '../core/staff.types';
import { StaffClient, StaffTokenService, StaffTokens } from './staff-token.service';

const FAILS = (email: string) => `staff:login:fails:${email}`;
const LOCK = (email: string) => `staff:login:lock:${email}`;
const CHALLENGE = (token: string) => `staff:2fa:challenge:${token}`;
const PENDING_TOTP = (id: string) => `staff:2fa:pending:${id}`;
const USED_STEP = (id: string, step: number) => `staff:2fa:used:${id}:${step}`;

export type LoginResult = { status: 'ok'; tokens: StaffTokens; me: Awaited<ReturnType<StaffAuthService['me']>> } | { status: 'two_factor_required'; challenge: string };

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Staff sign-in: e-mail + password, then an authenticator code when 2FA is
 * on. Failed attempts lock the account for a while; every sign-in, failure
 * and security change is audited.
 */
@Injectable()
export class StaffAuthService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: StaffTokenService,
    private readonly contexts: StaffContextService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {
    this.box = new SecretBox(config.staffDataKey);
  }

  async login(emailRaw: string, password: string, client: StaffClient, req?: Request): Promise<LoginResult> {
    const email = normalizeEmail(emailRaw);
    const lockTtl = await this.redis.client.ttl(LOCK(email));
    if (lockTtl > 0) throw this.locked(lockTtl);

    const staff = await this.prisma.staffUser.findUnique({ where: { email } });
    const ok = await verifyPassword(password, staff?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!staff || !ok || staff.status !== StaffStatus.ACTIVE) {
      await this.noteFailure(email, req);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Wrong e-mail or password', HttpStatus.UNAUTHORIZED);
    }
    await this.redis.client.del(FAILS(email));

    if (staff.totpEnabledAt && staff.totpSecret) {
      const challenge = randomToken(24);
      await this.redis.setJson(CHALLENGE(challenge), { staffId: staff.id, attempts: 0 }, 300);
      return { status: 'two_factor_required', challenge };
    }
    return this.complete(staff, client, req);
  }

  async loginTwoFactor(challenge: string, code: string, client: StaffClient, req?: Request): Promise<LoginResult> {
    const state = await this.redis.getJson<{ staffId: string; attempts: number }>(CHALLENGE(challenge));
    if (!state) throw new AppError(ErrorCode.TWO_FACTOR_INVALID, 'This sign-in expired. Start again.', HttpStatus.UNAUTHORIZED);
    const staff = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: state.staffId } });
    if (!(await this.checkSecondFactor(staff, code))) {
      state.attempts += 1;
      if (state.attempts >= 5) await this.redis.client.del(CHALLENGE(challenge));
      else await this.redis.setJson(CHALLENGE(challenge), state, 300);
      void this.audit.record({ actor: { id: staff.id, email: staff.email }, action: 'auth.2fa_failed', targetType: 'staff', targetId: staff.id, req });
      throw new AppError(ErrorCode.TWO_FACTOR_INVALID, 'That code is not right', HttpStatus.UNAUTHORIZED, { attemptsLeft: Math.max(0, 5 - state.attempts) });
    }
    await this.redis.client.del(CHALLENGE(challenge));
    return this.complete(staff, client, req);
  }

  async refresh(refreshToken: string, client: StaffClient): Promise<StaffTokens> {
    return (await this.tokens.rotate(refreshToken, client)).tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeToken(refreshToken);
  }

  async me(staffId: string) {
    const s = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffId }, include: { role: true } });
    const ctx = (await this.contexts.get(staffId))!;
    const require2fa = await this.settings.get('security.require2fa');
    return {
      id: s.id,
      email: s.email,
      name: s.name,
      role: { id: s.role.id, key: s.role.key, name: s.role.name },
      permissions: ctx.permissions,
      twoFactorEnabled: !!s.totpEnabledAt,
      recoveryCodesLeft: s.recoveryCodes.length,
      mustChangePassword: s.mustChangePassword,
      twoFactorSetupRequired: require2fa && !s.totpEnabledAt,
      lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  }

  async updateProfile(me: StaffPrincipal, name: string) {
    await this.prisma.staffUser.update({ where: { id: me.id }, data: { name: name.trim() } });
    await this.contexts.invalidate(me.id);
    return this.me(me.id);
  }

  async changePassword(me: StaffPrincipal, current: string, next: string, req?: Request) {
    const s = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(current, s.passwordHash))) throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Your current password is not right', HttpStatus.BAD_REQUEST);
    const problem = passwordProblem(next);
    if (problem) throw new AppError(ErrorCode.VALIDATION_FAILED, problem);
    if (await verifyPassword(next, s.passwordHash)) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Choose a password you have not used here');
    await this.prisma.staffUser.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: this.clock.now() } });
    await this.tokens.revokeAll(me.id, me.sessionId);
    await this.contexts.invalidate(me.id);
    void this.audit.record({ actor: me, action: 'auth.password_changed', targetType: 'staff', targetId: me.id, req });
    return this.me(me.id);
  }

  // ── two-factor ──────────────────────────────────────────────────────────

  async startTotpSetup(me: StaffPrincipal) {
    if (me.twoFactorEnabled) throw AppError.conflict('Two-factor is already on');
    const secret = newTotpSecret();
    await this.redis.client.set(PENDING_TOTP(me.id), this.box.seal(secret), 'EX', 600);
    return { secret, otpauthUrl: otpauthUrl(secret, me.email, this.config.get('STAFF_TOTP_ISSUER')) };
  }

  async enableTotp(me: StaffPrincipal, code: string, req?: Request) {
    const sealed = await this.redis.client.get(PENDING_TOTP(me.id));
    if (!sealed) throw new AppError(ErrorCode.TWO_FACTOR_INVALID, 'Setup expired. Start again.');
    const secret = this.box.open(sealed);
    if (verifyTotp(secret, code, this.clock.now().getTime()) === null) throw new AppError(ErrorCode.TWO_FACTOR_INVALID, 'That code is not right. Check the time on your phone.');
    const recoveryCodes = this.newRecoveryCodes();
    await this.prisma.staffUser.update({
      where: { id: me.id },
      data: { totpSecret: sealed, totpEnabledAt: this.clock.now(), recoveryCodes: recoveryCodes.map((c) => sha256(c)) },
    });
    await this.redis.client.del(PENDING_TOTP(me.id));
    await this.contexts.invalidate(me.id);
    void this.audit.record({ actor: me, action: 'auth.2fa_enabled', targetType: 'staff', targetId: me.id, req });
    return { recoveryCodes };
  }

  async disableTotp(me: StaffPrincipal, password: string, code: string, req?: Request) {
    const s = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: me.id } });
    if (!s.totpEnabledAt) return this.me(me.id);
    if (await this.settings.get('security.require2fa')) throw AppError.forbidden('Two-factor is required for staff here');
    if (!(await verifyPassword(password, s.passwordHash)) || !(await this.checkSecondFactor(s, code))) {
      throw new AppError(ErrorCode.TWO_FACTOR_INVALID, 'Password or code is not right');
    }
    await this.prisma.staffUser.update({ where: { id: me.id }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] } });
    await this.contexts.invalidate(me.id);
    void this.audit.record({ actor: me, action: 'auth.2fa_disabled', targetType: 'staff', targetId: me.id, req });
    return this.me(me.id);
  }

  async regenerateRecoveryCodes(me: StaffPrincipal, code: string, req?: Request) {
    const s = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: me.id } });
    if (!s.totpEnabledAt || !(await this.checkSecondFactor(s, code, { allowRecovery: false }))) throw new AppError(ErrorCode.TWO_FACTOR_INVALID, 'That code is not right');
    const recoveryCodes = this.newRecoveryCodes();
    await this.prisma.staffUser.update({ where: { id: me.id }, data: { recoveryCodes: recoveryCodes.map((c) => sha256(c)) } });
    void this.audit.record({ actor: me, action: 'auth.recovery_codes_regenerated', targetType: 'staff', targetId: me.id, req });
    return { recoveryCodes };
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async complete(staff: StaffUser, client: StaffClient, req?: Request): Promise<LoginResult> {
    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { lastLoginAt: this.clock.now(), lastLoginIp: client.ip } });
    const tokens = await this.tokens.issue(staff.id, client);
    void this.audit.record({ actor: { id: staff.id, email: staff.email }, action: 'auth.login', targetType: 'staff', targetId: staff.id, req });
    return { status: 'ok', tokens, me: await this.me(staff.id) };
  }

  /** TOTP (each step usable once) or a one-time recovery code. */
  private async checkSecondFactor(staff: StaffUser, input: string, opts: { allowRecovery?: boolean } = {}): Promise<boolean> {
    const code = input.replace(/\s/g, '');
    if (!staff.totpSecret) return false;
    const step = verifyTotp(this.box.open(staff.totpSecret), code, this.clock.now().getTime());
    if (step !== null) return (await this.redis.client.set(USED_STEP(staff.id, step), '1', 'EX', 120, 'NX')) === 'OK';
    if (opts.allowRecovery === false) return false;
    const hash = sha256(code.toLowerCase());
    if (!staff.recoveryCodes.includes(hash)) return false;
    const used = await this.prisma.staffUser.updateMany({ where: { id: staff.id, recoveryCodes: { has: hash } }, data: { recoveryCodes: staff.recoveryCodes.filter((h) => h !== hash) } });
    return used.count === 1;
  }

  private newRecoveryCodes(): string[] {
    return Array.from({ length: 10 }, () => {
      const t = randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(10, '0').slice(0, 10);
      return `${t.slice(0, 5)}-${t.slice(5)}`;
    });
  }

  private async noteFailure(email: string, req?: Request): Promise<void> {
    const windowSeconds = this.config.get('STAFF_LOGIN_LOCK_MINUTES') * 60;
    const fails = await this.redis.incrWithTtl(FAILS(email), windowSeconds);
    void this.audit.record({ actor: { id: null, email }, action: 'auth.login_failed', summary: `Failed sign-in #${fails}`, req });
    if (fails >= this.config.get('STAFF_LOGIN_MAX_FAILURES')) {
      await this.redis.client.multi().set(LOCK(email), '1', 'EX', windowSeconds).del(FAILS(email)).exec();
      void this.audit.record({ actor: { id: null, email }, action: 'auth.locked', summary: `Locked for ${windowSeconds / 60} minutes after ${fails} failures`, req });
      throw this.locked(windowSeconds);
    }
  }

  private locked(seconds: number): AppError {
    return new AppError(ErrorCode.ACCOUNT_LOCKED, `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`, HttpStatus.TOO_MANY_REQUESTS, { retryAfterSeconds: seconds });
  }
}
