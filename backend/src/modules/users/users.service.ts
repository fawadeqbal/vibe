import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthProvider, Gender, Prisma, User, UserStatus } from '@prisma/client';

import { cursorArgs, CursorQueryDto, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { friendlyCode, hmacSha256Hex } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { StorageProvider } from '../../infra/storage/storage.provider';
import { EconomyService } from '../catalog/economy.service';
import { RegionService } from '../region/region.service';
import { ImageSafetyService } from '../safety/image-safety.service';
import { WalletService } from '../wallet/wallet.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { isProfileComplete, PRIVACY_OPENED, PrivacyOpenedEvent, PROFILE_COMPLETED, ProfileCompletedEvent, USER_ONBOARDED, UserOnboardedEvent, USER_SIGNED_UP, UserSignedUpEvent } from './profile.rules';
import { SelfieCapture, VerificationService } from './verification/verification.service';
import { ME_INCLUDE, MeProfile, PROFILE_INCLUDE, PublicProfile, toMeProfile, toPublicProfile } from './user.mapper';

export interface NewUserInput {
  email?: string;
  /** A social login to link at creation (Google/Apple/Facebook). */
  identity?: { provider: AuthProvider; subject: string; email?: string; refreshToken?: string };
  name?: string;
  /** Invite attribution (see USER_SIGNED_UP). */
  inviteCode?: string;
  inviteSource?: string;
  inviteVia?: 'link' | 'install' | 'web';
  /** Raw install id; only its peppered hash is stored. */
  deviceId?: string;
  ip?: string;
}

/** Emitted (awaited) just before an account is wiped, so integrations can revoke what they hold. */
export const USER_DELETING = 'user.deleting';
export interface UserDeletingEvent {
  userId: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly storage: StorageProvider,
    private readonly verification: VerificationService,
    private readonly realtime: RealtimeService,
    private readonly economy: EconomyService,
    private readonly config: AppConfig,
    private readonly images: ImageSafetyService,
    private readonly region: RegionService,
  ) {}

  /**
   * Creates the account and its wallet (with the welcome bonus) atomically,
   * then (outside a caller's transaction) announces the sign-up so the
   * referral is attributed before the sign-in response goes out.
   */
  async create(input: NewUserInput, tx?: Tx): Promise<User> {
    const deviceHash = input.deviceId ? hmacSha256Hex(this.config.devicePepper, input.deviceId) : null;
    const user = await this.prisma.tx(async (t) => {
      // Signing up means agreeing to the Terms shown at sign-up: remember which version.
      const terms = await t.legalDocument.findUnique({ where: { slug: 'terms' }, select: { version: true } });
      const created = await t.user.create({
        data: {
          termsVersion: terms?.version ?? null,
          termsAcceptedAt: this.clock.now(),
          email: input.email,
          name: input.name ?? '',
          inviteCode: await this.uniqueInviteCode(t),
          signupDeviceHash: deviceHash,
          ...(input.identity ? { identities: { create: { ...input.identity, lastUsedAt: this.clock.now() } } } : {}),
        },
      });
      await this.wallet.open(created.id, t);
      return created;
    }, tx);
    if (!tx) {
      await this.events
        .emitAsync(USER_SIGNED_UP, { userId: user.id, inviteCode: input.inviteCode, inviteSource: input.inviteSource, inviteVia: input.inviteVia, deviceHash, ip: input.ip } satisfies UserSignedUpEvent)
        .catch((e: Error) => this.logger.error(`sign-up listeners failed for ${user.id}: ${e.message}`));
    }
    return user;
  }

  /** Invite codes share one namespace with creator-partner codes. */
  private async uniqueInviteCode(tx: Tx): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = friendlyCode(7);
      const [user, partner] = await Promise.all([tx.user.findUnique({ where: { inviteCode: code }, select: { id: true } }), tx.affiliate.findUnique({ where: { code }, select: { id: true } })]);
      if (!user && !partner) return code;
    }
    return friendlyCode(10);
  }

  async findActive(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: ME_INCLUDE });
    if (!u || u.status !== UserStatus.ACTIVE) throw AppError.notFound('User');
    return u;
  }

  async me(id: string): Promise<MeProfile> {
    return toMeProfile(await this.findActive(id), this.clock.now());
  }

  async publicProfile(viewerId: string, id: string): Promise<PublicProfile> {
    const blocked = await this.prisma.block.findFirst({ where: { OR: [{ blockerId: viewerId, blockedId: id }, { blockerId: id, blockedId: viewerId }] } });
    if (blocked) throw AppError.notFound('User');
    return toPublicProfile(await this.findActive(id), this.clock.now());
  }

  /** `trusted`: the avatar URL comes from our own upload (setAvatar), not from the client. */
  async update(id: string, dto: UpdateProfileDto, opts: { trusted?: boolean } = {}): Promise<MeProfile> {
    if (dto.age !== undefined && dto.age < this.economy.rules.minAge) {
      throw new AppError(ErrorCode.UNDERAGE, `Vibe is for people ${this.economy.rules.minAge} and over`, HttpStatus.FORBIDDEN);
    }
    // Not a country Vibe is offered in (admin → Settings → Region).
    await this.region.assertCountry(dto.countryCode);
    const before = await this.findActive(id);
    // A new profile photo must be one this person uploaded through POST /me/avatar (and so passed the photo checks):
    // an outside URL would skip them.
    if (dto.avatarUrl && dto.avatarUrl !== before.avatarUrl && !opts.trusted && !this.storage.keyFromUrl(dto.avatarUrl)?.startsWith(`avatars/${id}/`)) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Upload your profile photo from the app', HttpStatus.BAD_REQUEST);
    }
    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      age: dto.age,
      gender: dto.gender ? (dto.gender.toUpperCase() as Gender) : undefined,
      countryCode: dto.countryCode,
      bio: dto.bio,
      interests: dto.interests ? [...new Set(dto.interests)] : undefined,
      intent: dto.intent,
      marketingEmails: dto.marketingEmails,
      privateAccount: dto.privateAccount,
      hideStats: dto.hideStats,
      avatarUrl: dto.avatarUrl,
      gemGoal: dto.gemGoal,
      quietHoursStart: dto.quietHoursStart,
      quietHoursEnd: dto.quietHoursEnd,
      tzOffsetMinutes: dto.tzOffsetMinutes,
      breakReminderMinutes: dto.breakReminderMinutes,
    };
    // A new photo invalidates the selfie match.
    if (dto.avatarUrl && dto.avatarUrl !== before.avatarUrl && before.verified) Object.assign(data, { verified: false, verifiedAt: null });
    const after = await this.prisma.user.update({ where: { id }, data, include: ME_INCLUDE });
    this.emitIfCompleted(before, after);
    if (before.privateAccount && !after.privateAccount) {
      // Waiting follow requests are accepted before we answer, so the counts below are current.
      await this.events.emitAsync(PRIVACY_OPENED, { userId: id } satisfies PrivacyOpenedEvent);
      return toMeProfile(await this.findActive(id), this.clock.now());
    }
    return toMeProfile(after, this.clock.now());
  }

  async setAvatar(id: string, file: { buffer: Buffer; mimetype: string }): Promise<MeProfile> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Use a JPEG, PNG or WebP image', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    // Real image bytes only, re-encoded (no GPS or hidden data) and checked for nudity before it's stored.
    const photo = await this.images.screen(id, 'avatar', id, file.buffer);
    const key = `avatars/${id}/${Date.now()}.jpg`;
    const url = await this.storage.put(key, photo.buffer, photo.mime);
    await this.images.noteStored(id, 'avatar', id, key, photo);
    const me = await this.update(id, { avatarUrl: url }, { trusted: true });
    // Checked just now: the photo sweeper can skip it (it re-checks anything else).
    if (photo.score != null) await this.prisma.user.update({ where: { id }, data: { avatarCheckedUrl: url } });
    return me;
  }

  async completeOnboarding(id: string): Promise<MeProfile> {
    const u = await this.findActive(id);
    if (u.name.trim().length < 2 || (u.age ?? 0) < this.economy.rules.minAge) {
      throw new AppError(ErrorCode.PROFILE_INCOMPLETE, 'Add your name and age first');
    }
    const after = await this.prisma.user.update({ where: { id }, data: { onboardedAt: u.onboardedAt ?? this.clock.now() }, include: ME_INCLUDE });
    if (!u.onboardedAt) this.events.emit(USER_ONBOARDED, { userId: id } satisfies UserOnboardedEvent);
    return toMeProfile(after, this.clock.now());
  }

  /**
   * Selfie verification. Approved → the badge at once; rejected → a readable
   * reason; close calls (or the manual provider) → `verification: pending`
   * until staff decide.
   */
  async verifySelfie(id: string, capture: SelfieCapture): Promise<MeProfile & { verification: { status: string; reason: string | null } }> {
    const u = await this.findActive(id);
    if (u.verified) return { ...toMeProfile(u, this.clock.now()), verification: { status: 'APPROVED', reason: null } };
    const r = await this.verification.submit(id, capture, u.avatarUrl);
    if (r.status === 'REJECTED') throw new AppError(ErrorCode.VALIDATION_FAILED, r.reason ?? 'We could not verify you. Try again in good light.');
    const after = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: ME_INCLUDE });
    return { ...toMeProfile(after, this.clock.now()), verification: { status: r.status, reason: r.reason } };
  }

  async verificationChallenge(id: string) {
    const u = await this.findActive(id);
    if (u.verified) throw AppError.conflict('You are already verified');
    return this.verification.createChallenge(id);
  }

  async verificationStatus(id: string) {
    const r = await this.verification.latest(id);
    return r ? { status: r.status, reason: r.reason, at: r.createdAt.toISOString() } : { status: 'NONE', reason: null, at: null };
  }

  /** Profile-page numbers: matches today, average length, quick-skip rate. */
  async stats(id: string) {
    const since = this.clock.startOfDay();
    const [today, agg, quick, total] = await Promise.all([
      this.prisma.match.count({ where: { OR: [{ userAId: id }, { userBId: id }], startedAt: { gte: since } } }),
      this.prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")))::float AS avg
          FROM "Match" WHERE ("userAId" = ${id} OR "userBId" = ${id}) AND "endedAt" IS NOT NULL`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "Match"
         WHERE ("userAId" = ${id} OR "userBId" = ${id}) AND "endedAt" IS NOT NULL
           AND "endedAt" - "startedAt" < interval '10 seconds'`,
      this.prisma.match.count({ where: { OR: [{ userAId: id }, { userBId: id }] } }),
    ]);
    return {
      matchesToday: today,
      averageLengthSeconds: Math.round(agg[0]?.avg ?? 0),
      skipRate: total ? Number(quick[0].n) / total : 0,
    };
  }

  /** Recent matches with who-liked-whom and gifts, for "Recent matches". */
  async matchHistory(id: string, q: CursorQueryDto) {
    const rows = await this.prisma.match.findMany({
      where: { OR: [{ userAId: id }, { userBId: id }] },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      include: { likes: true, gifts: { select: { toId: true, fromId: true } } },
      ...cursorArgs(q),
    });
    const partnerIds = [...new Set(rows.map((m) => (m.userAId === id ? m.userBId : m.userAId)))];
    const partners = await this.prisma.user.findMany({ where: { id: { in: partnerIds } }, include: PROFILE_INCLUDE });
    const byId = new Map(partners.map((p) => [p.id, p]));
    const now = this.clock.now();
    return toPage(rows, q.limit, (m) => {
      const pid = m.userAId === id ? m.userBId : m.userAId;
      const p = byId.get(pid);
      return {
        id: m.id,
        partner: p ? toPublicProfile(p, now) : null,
        startedAt: m.startedAt.toISOString(),
        endedAt: m.endedAt?.toISOString() ?? null,
        endReason: m.endReason,
        liked: m.likes.some((l) => l.fromId === id),
        likedMe: m.likes.some((l) => l.toId === id),
        giftsSent: m.gifts.filter((g) => g.fromId === id).length,
        giftsReceived: m.gifts.filter((g) => g.toId === id).length,
        coinsSpent: m.userAId === id ? m.coinsSpentA : m.coinsSpentB,
      };
    });
  }

  /**
   * Everyone who liked you on a call (the "Likes" number on your profile),
   * newest first, one row per like. They already met you, so this isn't the
   * VIP "liked you" list (Discover likes waiting for an answer).
   * Cursor: `<iso time>|<matchId>` of the last row.
   */
  async likesReceived(id: string, q: CursorQueryDto) {
    const [at, matchId] = (q.cursor ?? '').split('|');
    const after = q.cursor && matchId && !Number.isNaN(Date.parse(at)) ? { at: new Date(at), matchId } : null;
    const rows = await this.prisma.matchLike.findMany({
      where: {
        toId: id,
        ...(after ? { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, matchId: { lt: after.matchId } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { matchId: 'desc' }],
      take: q.limit + 1,
    });
    const hasMore = rows.length > q.limit;
    const slice = hasMore ? rows.slice(0, q.limit) : rows;
    const people = await this.prisma.user.findMany({ where: { id: { in: [...new Set(slice.map((r) => r.fromId))] } }, include: PROFILE_INCLUDE });
    const byId = new Map(people.map((p) => [p.id, p]));
    const now = this.clock.now();
    const last = slice[slice.length - 1];
    return {
      items: slice.flatMap((r) => {
        const p = byId.get(r.fromId);
        return p ? [{ id: r.matchId, profile: toPublicProfile(p, now), likedAt: r.createdAt.toISOString() }] : [];
      }),
      nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.matchId}` : null,
    };
  }

  /**
   * Store requirement: users can delete their account. Personal data is
   * wiped; the ledger and reports stay (pseudonymous) for accounting/safety.
   */
  async deleteAccount(id: string): Promise<void> {
    // Let integrations revoke what they hold first (Sign in with Apple tokens, push tokens…).
    await this.events.emitAsync(USER_DELETING, { userId: id } satisfies UserDeletingEvent).catch(() => undefined);
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId: id } }),
      this.prisma.authIdentity.deleteMany({ where: { userId: id } }),
      this.prisma.pushToken.deleteMany({ where: { userId: id } }),
      this.prisma.payoutAccount.updateMany({ where: { userId: id, deletedAt: null }, data: { deletedAt: this.clock.now(), isDefault: false } }),
      this.prisma.user.update({
        where: { id },
        data: { status: UserStatus.DELETED, deletedAt: this.clock.now(), email: null, name: 'Deleted user', bio: '', avatarUrl: '', interests: [], intent: null },
      }),
    ]);
    this.realtime.disconnectUser(id);
  }

  private emitIfCompleted(before: User, after: User): void {
    if (!isProfileComplete(before) && isProfileComplete(after)) {
      this.events.emit(PROFILE_COMPLETED, { userId: after.id } satisfies ProfileCompletedEvent);
    }
  }
}
