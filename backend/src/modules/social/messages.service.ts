import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Message } from '@prisma/client';

import { cursorArgs, CursorQueryDto, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { EconomyService } from '../catalog/economy.service';
import { WalletService } from '../wallet/wallet.service';
import { FriendsService } from './friends.service';
import { StreakService } from './streak.service';

export const FRIEND_MESSAGE = 'social.message';
export interface FriendMessageEvent {
  from: string;
  to: string;
  text: string;
  giftId: string | null;
}

export interface MessageView {
  id: string;
  friendId: string;
  fromMe: boolean;
  text: string;
  giftId: string | null;
  at: string;
  readAt: string | null;
}

/** Text chat and gifts between friends; every message is pushed live. */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly economy: EconomyService,
    private readonly streaks: StreakService,
  ) {}

  private toView(m: Message, me: string, friendId: string): MessageView {
    return { id: m.id, friendId, fromMe: m.senderId === me, text: m.text, giftId: m.giftId, at: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null };
  }

  async list(me: string, friendId: string, q: CursorQueryDto) {
    const f = await this.friends.requireFriends(me, friendId);
    const rows = await this.prisma.message.findMany({ where: { friendshipId: f.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...cursorArgs(q) });
    return toPage(rows, q.limit, (m) => this.toView(m, me, friendId));
  }

  async send(me: string, friendId: string, text: string): Promise<MessageView> {
    const clean = text.trim();
    if (!clean) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Message is empty');
    const f = await this.friends.requireFriends(me, friendId);
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({ data: { friendshipId: f.id, senderId: me, text: clean } });
      await tx.friendship.update({ where: { id: f.id }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    this.push(m, me, friendId);
    await this.streaks.noteMessage(me, friendId);
    return this.toView(m, me, friendId);
  }

  async sendGift(me: string, friendId: string, giftId: string, idempotencyKey?: string): Promise<MessageView> {
    const gift = this.economy.findGift(giftId);
    if (!gift) throw AppError.notFound('Gift');
    const f = await this.friends.requireFriends(me, friendId);
    const [meUser, friend] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: me }, select: { name: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: friendId }, select: { name: true } }),
    ]);
    await this.wallet.sendGift(me, friendId, gift, { fromName: meUser.name, toName: friend.name, idempotencyKey });
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({ data: { friendshipId: f.id, senderId: me, text: `Sent a ${gift.name}`, giftId: gift.id } });
      await tx.friendship.update({ where: { id: f.id }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    this.push(m, me, friendId);
    await this.streaks.noteMessage(me, friendId);
    return this.toView(m, me, friendId);
  }

  async markRead(me: string, friendId: string): Promise<number> {
    const f = await this.friends.requireFriends(me, friendId);
    const r = await this.prisma.message.updateMany({ where: { friendshipId: f.id, senderId: friendId, readAt: null }, data: { readAt: this.clock.now() } });
    return r.count;
  }

  private push(m: Message, me: string, friendId: string): void {
    this.realtime.toUser(friendId, ServerEvent.Message, this.toView(m, friendId, me));
    this.realtime.toUser(me, ServerEvent.Message, this.toView(m, me, friendId));
    this.events.emit(FRIEND_MESSAGE, { from: me, to: friendId, text: m.text, giftId: m.giftId } satisfies FriendMessageEvent);
  }
}
