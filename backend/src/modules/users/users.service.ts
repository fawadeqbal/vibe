import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthProvider, Gender, Prisma, User, UserStatus } from '@prisma/client';

import { cursorArgs, CursorQueryDto, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { friendlyCode } from '../../common/utils/crypto';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { StorageProvider } from '../../infra/storage/storage.provider';
import { EconomyService } from '../catalog/economy.service';
import { WalletService } from '../wallet/wallet.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { isProfileComplete, PROFILE_COMPLETED, ProfileCompletedEvent } from './profile.rules';
import { VerificationService } from './verification/verification.service';
import { MeProfile, PROFILE_INCLUDE, PublicProfile, toMeProfile, toPublicProfile } from './user.mapper';

export interface NewUserInput {
  email?: string;
  /** A social login to link at creation (Google/Apple/Facebook). */
  identity?: { provider: AuthProvider; subject: string; email?: string; refreshToken?: string };
  name?: string;
  inviteCode?: string;
}

/** Emitted (awaited) just before an account is wiped, so integrations can revoke what they hold. */
export const USER_DELETING = 'user.deleting';
export interface UserDeletingEvent {
  userId: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly storage: StorageProvider,
    private readonly verification: VerificationService,
    private readonly realtime: RealtimeService,
    private readonly economy: EconomyService,
  ) {}

  /** Creates the account and its wallet (with the welcome bonus) atomically. */
  async create(input: NewUserInput, tx?: Tx): Promise<User> {
    return this.prisma.tx(async (t) => {
      const inviter = input.inviteCode ? await t.user.findUnique({ where: { inviteCode: input.inviteCode.toUpperCase() }, select: { id: true } }) : null;
      const user = await t.user.create({
        data: {
          email: input.email,
          name: input.name ?? '',
          inviteCode: await this.uniqueInviteCode(t),
          invitedById: inviter?.id,
          ...(input.identity ? { identities: { create: { ...input.identity, lastUsedAt: this.clock.now() } } } : {}),
        },
      });
      await this.wallet.open(user.id, t);
      return user;
    }, tx);
  }

  private async uniqueInviteCode(tx: Tx): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = friendlyCode(7);
      if (!(await tx.user.findUnique({ where: { inviteCode: code }, select: { id: true } }))) return code;
    }
    return friendlyCode(10);
  }

  async findActive(id: string): Promise<User & { wallet: { vipUntil: Date | null } | null }> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: PROFILE_INCLUDE });
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

  async update(id: string, dto: UpdateProfileDto): Promise<MeProfile> {
    if (dto.age !== undefined && dto.age < this.economy.rules.minAge) {
      throw new AppError(ErrorCode.UNDERAGE, `Vibe is for people ${this.economy.rules.minAge} and over`, HttpStatus.FORBIDDEN);
    }
    const before = await this.findActive(id);
    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      age: dto.age,
      gender: dto.gender ? (dto.gender.toUpperCase() as Gender) : undefined,
      countryCode: dto.countryCode,
      bio: dto.bio,
      interests: dto.interests ? [...new Set(dto.interests)] : undefined,
      marketingEmails: dto.marketingEmails,
      avatarUrl: dto.avatarUrl,
    };
    // A new photo invalidates the selfie match.
    if (dto.avatarUrl && dto.avatarUrl !== before.avatarUrl && before.verified) Object.assign(data, { verified: false, verifiedAt: null });
    const after = await this.prisma.user.update({ where: { id }, data, include: PROFILE_INCLUDE });
    this.emitIfCompleted(before, after);
    return toMeProfile(after, this.clock.now());
  }

  async setAvatar(id: string, file: { buffer: Buffer; mimetype: string }): Promise<MeProfile> {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype];
    if (!ext) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Use a JPEG, PNG or WebP image', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    const url = await this.storage.put(`avatars/${id}/${Date.now()}.${ext}`, file.buffer, file.mimetype);
    return this.update(id, { avatarUrl: url });
  }

  async completeOnboarding(id: string): Promise<MeProfile> {
    const u = await this.findActive(id);
    if (u.name.trim().length < 2 || (u.age ?? 0) < this.economy.rules.minAge) {
      throw new AppError(ErrorCode.PROFILE_INCOMPLETE, 'Add your name and age first');
    }
    const after = await this.prisma.user.update({ where: { id }, data: { onboardedAt: u.onboardedAt ?? this.clock.now() }, include: PROFILE_INCLUDE });
    return toMeProfile(after, this.clock.now());
  }

  /**
   * Selfie verification. Approved → the badge at once; rejected → a readable
   * reason; close calls (or the manual provider) → `verification: pending`
   * until staff decide.
   */
  async verifySelfie(id: string, selfie: Buffer | null): Promise<MeProfile & { verification: { status: string; reason: string | null } }> {
    const u = await this.findActive(id);
    if (u.verified) return { ...toMeProfile(u, this.clock.now()), verification: { status: 'APPROVED', reason: null } };
    const r = await this.verification.submit(id, selfie, u.avatarUrl);
    if (r.status === 'REJECTED') throw new AppError(ErrorCode.VALIDATION_FAILED, r.reason ?? 'We could not verify you. Try again in good light.');
    const after = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: PROFILE_INCLUDE });
    return { ...toMeProfile(after, this.clock.now()), verification: { status: r.status, reason: r.reason } };
  }

  async verificationStatus(id: string) {
    const r = await this.verification.latest(id);
    return r ? { status: r.status, reason: r.reason, at: r.createdAt.toISOString() } : { status: 'NONE', reason: null, at: null };
  }

  /** Profile-page numbers: matches today, average length, quick-skip rate. */
  async stats(id: string) {
    const since = this.clock.dayOf();
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
        data: { status: UserStatus.DELETED, deletedAt: this.clock.now(), email: null, name: 'Deleted user', bio: '', avatarUrl: '', interests: [] },
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
