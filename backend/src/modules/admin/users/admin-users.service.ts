import { Injectable } from '@nestjs/common';
import { CashoutStatus, LedgerKind, Prisma, PurchaseStatus, ReportStatus, SubscriptionStatus, User, UserStatus, Wallet } from '@prisma/client';

import { CursorQueryDto } from '../../../common/dto/pagination.dto';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Clock } from '../../../common/utils/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { TokenService } from '../../auth/token.service';
import { MatchingService } from '../../matching/matching.service';
import { ModerationService } from '../../moderation/moderation.service';
import { VipService } from '../../payments/vip.service';
import { UsersService } from '../../users/users.service';
import { LedgerService } from '../../wallet/ledger.service';
import { WalletService } from '../../wallet/wallet.service';
import { createdRange, emailFor, looksLikeId, pageArgs, toAdminPage } from '../core/admin-query';
import type { StaffPrincipal } from '../core/staff.types';
import { UpdateUserDto, UserListQuery, UserSort, WalletAdjustDto } from './admin-users.dto';

type UserRow = User & { wallet: Wallet | null; _count?: { reportsGot: number } };

const ORDER: Record<UserSort, Prisma.UserOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  lastSeen: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
  mostMatches: [{ matchesCount: 'desc' }, { id: 'desc' }],
};

/**
 * Everything support and moderation do to one person. All writes reuse the
 * domain services (ledger, moderation, VIP, users), so the admin panel can
 * never take a shortcut around a business rule.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly moderation: ModerationService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly vip: VipService,
    private readonly tokens: TokenService,
    private readonly realtime: RealtimeService,
    private readonly matching: MatchingService,
    private readonly clock: Clock,
  ) {}

  async list(staff: StaffPrincipal, q: UserListQuery) {
    const now = this.clock.now();
    const and: Prisma.UserWhereInput[] = [];
    if (q.q) and.push(this.search(q.q));
    if (q.banned !== undefined) and.push(q.banned ? { bannedUntil: { gt: now } } : { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] });
    if (q.vip !== undefined) and.push(q.vip ? { wallet: { vipUntil: { gt: now } } } : { wallet: { OR: [{ vipUntil: null }, { vipUntil: { lte: now } }] } });
    const where: Prisma.UserWhereInput = {
      status: q.status,
      verified: q.verified,
      gender: q.gender,
      countryCode: q.country,
      isBot: q.bots ? undefined : false,
      createdAt: createdRange(q),
      AND: and,
    };
    const rows = await this.prisma.user.findMany({
      where,
      include: { wallet: true, _count: { select: { reportsGot: { where: { status: ReportStatus.OPEN } } } } },
      ...pageArgs(q),
      orderBy: ORDER[q.sort],
    });
    const online = await this.realtime.onlineMap(rows.map((r) => r.id));
    return toAdminPage(rows, q.limit, (u) => ({ ...this.summary(staff, u), online: !!online[u.id] }));
  }

  async get(staff: StaffPrincipal, id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { wallet: true, invitedBy: { select: { id: true, name: true } }, identities: { select: { provider: true } } } });
    if (!u) throw AppError.notFound('User');
    const pair = { OR: [{ userAId: id }, { userBId: id }] };
    const [online, inCall, counts, spent, giftsSent, giftsReceived, cashedOut, sessions, sub] = await Promise.all([
      this.realtime.isOnline(id),
      this.matching.isInCall(id),
      this.prisma.$transaction([
        this.prisma.match.count({ where: pair }),
        this.prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ userLowId: id }, { userHighId: id }] } }),
        this.prisma.report.count({ where: { reportedId: id } }),
        this.prisma.report.count({ where: { reportedId: id, status: ReportStatus.OPEN } }),
        this.prisma.report.count({ where: { reporterId: id } }),
        this.prisma.block.count({ where: { blockedId: id } }),
        this.prisma.user.count({ where: { invitedById: id } }),
        this.prisma.purchase.count({ where: { userId: id } }),
      ]),
      this.prisma.purchase.aggregate({ where: { userId: id, status: PurchaseStatus.SUCCEEDED }, _sum: { usdCents: true } }),
      this.prisma.giftTransfer.aggregate({ where: { fromId: id }, _sum: { coins: true }, _count: true }),
      this.prisma.giftTransfer.aggregate({ where: { toId: id }, _sum: { gems: true }, _count: true }),
      this.prisma.cashout.aggregate({ where: { userId: id, status: CashoutStatus.PAID }, _sum: { usdCents: true } }),
      this.prisma.session.findMany({ where: { userId: id, revokedAt: null, expiresAt: { gt: this.clock.now() } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.subscription.findFirst({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const [matches, friends, reportsGot, openReports, reportsMade, blockedBy, invitees, purchases] = counts;
    return {
      ...this.summary(staff, { ...u, _count: { reportsGot: openReports } }),
      online,
      inCall,
      bio: u.bio,
      interests: u.interests,
      signIn: { email: emailFor(staff, u.email), google: u.identities.some((i) => i.provider === 'GOOGLE'), apple: u.identities.some((i) => i.provider === 'APPLE'), facebook: u.identities.some((i) => i.provider === 'FACEBOOK') },
      inviteCode: u.inviteCode,
      invitedBy: u.invitedBy,
      onboardedAt: u.onboardedAt?.toISOString() ?? null,
      verifiedAt: u.verifiedAt?.toISOString() ?? null,
      deletedAt: u.deletedAt?.toISOString() ?? null,
      wallet: u.wallet && {
        coins: u.wallet.coins,
        gems: u.wallet.gems,
        vipUntil: u.wallet.vipUntil?.toISOString() ?? null,
        boostUntil: u.wallet.boostUntil?.toISOString() ?? null,
        streakDay: u.wallet.streakDay,
        lastCheckInAt: u.wallet.lastCheckInAt?.toISOString() ?? null,
        profileBonusClaimed: u.wallet.profileBonusClaimed,
      },
      subscription: sub && { planId: sub.planId, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd.toISOString(), trialEndsAt: sub.trialEndsAt?.toISOString() ?? null },
      counts: { matches, friends, reportsGot, openReports, reportsMade, blockedBy, invitees, purchases, likes: u.likesCount },
      money: {
        spentUsd: (spent._sum.usdCents ?? 0) / 100,
        giftsSent: giftsSent._count,
        giftsSentCoins: giftsSent._sum.coins ?? 0,
        giftsReceived: giftsReceived._count,
        giftsReceivedGems: giftsReceived._sum.gems ?? 0,
        cashedOutUsd: (cashedOut._sum.usdCents ?? 0) / 100,
      },
      sessions: sessions.map((s) => ({ id: s.id, userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString() })),
    };
  }

  // ── related lists ─────────────────────────────────────────────────────────

  async ledgerFor(userId: string, q: CursorQueryDto) {
    const rows = await this.prisma.ledgerEntry.findMany({ where: { userId }, ...pageArgs(q) });
    return toAdminPage(rows, q.limit, (e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
  }

  async matchesFor(userId: string, q: CursorQueryDto) {
    const rows = await this.prisma.match.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: q.limit + 1, ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}) });
    const partnerIds = rows.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
    const partners = new Map((await this.prisma.user.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true, avatarUrl: true, isBot: true } })).map((p) => [p.id, p]));
    return toAdminPage(rows, q.limit, (m) => {
      const partnerId = m.userAId === userId ? m.userBId : m.userAId;
      return {
        id: m.id,
        partner: partners.get(partnerId) ?? { id: partnerId, name: 'Unknown', avatarUrl: '', isBot: false },
        startedAt: m.startedAt.toISOString(),
        endedAt: m.endedAt?.toISOString() ?? null,
        seconds: m.endedAt ? Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 1000) : null,
        endReason: m.endReason,
        endedByMe: m.endedById === userId,
        coinsSpent: m.userAId === userId ? m.coinsSpentA : m.coinsSpentB,
        reconnect: m.reconnect,
      };
    });
  }

  async reportsFor(userId: string, q: CursorQueryDto & { direction?: 'received' | 'made' }) {
    const where = q.direction === 'made' ? { reporterId: userId } : { reportedId: userId };
    const rows = await this.prisma.report.findMany({
      where,
      include: { reporter: { select: { id: true, name: true, avatarUrl: true } }, reported: { select: { id: true, name: true, avatarUrl: true } } },
      ...pageArgs(q),
    });
    return toAdminPage(rows, q.limit, (r) => ({ ...r, createdAt: r.createdAt.toISOString(), reviewedAt: r.reviewedAt?.toISOString() ?? null }));
  }

  async notesFor(userId: string) {
    const rows = await this.prisma.staffNote.findMany({ where: { userId }, include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((n) => ({ id: n.id, text: n.text, author: n.author, createdAt: n.createdAt.toISOString() }));
  }

  // ── actions ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto) {
    const u = await this.active(id);
    const data: Prisma.UserUpdateInput = { name: dto.name?.trim(), bio: dto.bio, age: dto.age, gender: dto.gender, countryCode: dto.countryCode };
    if (dto.removeAvatar && u.avatarUrl) Object.assign(data, { avatarUrl: '', verified: false, verifiedAt: null });
    await this.prisma.user.update({ where: { id }, data });
  }

  async ban(id: string, hours: number, reason: string) {
    await this.active(id);
    const until = await this.moderation.ban(id, hours, `staff: ${reason}`);
    return { bannedUntil: until.toISOString() };
  }

  async unban(id: string) {
    await this.moderation.unban(id);
  }

  async setVerified(id: string, verified: boolean) {
    await this.active(id);
    await this.prisma.user.update({ where: { id }, data: { verified, verifiedAt: verified ? this.clock.now() : null } });
  }

  async signOut(id: string) {
    await this.tokens.revokeAll(id);
    this.realtime.disconnectUser(id);
  }

  async adjustWallet(id: string, dto: WalletAdjustDto) {
    if (!dto.coins && !dto.gems) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Enter an amount');
    await this.active(id);
    const r = await this.ledger.move(id, { coins: dto.coins, gems: dto.gems, kind: LedgerKind.ADJUSTMENT, title: dto.title.trim(), reference: 'staff', idempotencyKey: `staff-adjust:${dto.idempotencyKey}` });
    this.wallet.changed([id]);
    return { coins: r.coins, gems: r.gems, applied: r.applied, entryId: r.entry.id };
  }

  async grantVip(id: string, days: number, reason: string) {
    await this.active(id);
    return { vipUntil: (await this.vip.grant(id, days, reason)).toISOString() };
  }

  async revokeVip(id: string, reason: string) {
    await this.active(id);
    await this.vip.revoke(id, reason);
  }

  async addNote(staff: StaffPrincipal, userId: string, text: string) {
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } }).catch(() => {
      throw AppError.notFound('User');
    });
    const n = await this.prisma.staffNote.create({ data: { userId, authorId: staff.id, text: text.trim() } });
    return { id: n.id, text: n.text, author: { id: staff.id, name: staff.name, email: staff.email }, createdAt: n.createdAt.toISOString() };
  }

  async delete(id: string) {
    await this.active(id);
    // Stop anything still running for them before wiping the profile.
    await this.prisma.subscription.updateMany({ where: { userId: id, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } }, data: { status: SubscriptionStatus.CANCELED, canceledAt: this.clock.now() } });
    await this.users.deleteAccount(id);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async active(id: string): Promise<User> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw AppError.notFound('User');
    if (u.status !== UserStatus.ACTIVE) throw AppError.conflict('This account was deleted');
    return u;
  }

  /** id, e-mail (or part of one), invite code, or part of a name — whatever was pasted. */
  private search(raw: string): Prisma.UserWhereInput {
    const q = raw.trim();
    if (looksLikeId(q)) return { id: q };
    if (q.includes('@')) return { email: { contains: q.toLowerCase() } };
    const or: Prisma.UserWhereInput[] = [{ name: { contains: q, mode: 'insensitive' } }, { email: { startsWith: q.toLowerCase() } }];
    if (/^[A-Z0-9]{6,10}$/i.test(q)) or.push({ inviteCode: q.toUpperCase() });
    return { OR: or };
  }

  private summary(staff: StaffPrincipal, u: UserRow) {
    const now = this.clock.now();
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      age: u.age,
      gender: u.gender,
      countryCode: u.countryCode,
      email: emailFor(staff, u.email),
      status: u.status,
      verified: u.verified,
      isBot: u.isBot,
      bannedUntil: u.bannedUntil && u.bannedUntil > now ? u.bannedUntil.toISOString() : null,
      vipUntil: u.wallet?.vipUntil && u.wallet.vipUntil > now ? u.wallet.vipUntil.toISOString() : null,
      coins: u.wallet?.coins ?? 0,
      gems: u.wallet?.gems ?? 0,
      matchesCount: u.matchesCount,
      openReports: u._count?.reportsGot ?? 0,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
