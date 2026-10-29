import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Message, MessageKind, Prisma } from '@prisma/client';

import { cursorArgs, CursorQueryDto, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { StorageProvider } from '../../infra/storage/storage.provider';
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

export type MessageKindView = 'text' | 'gift' | 'system' | 'photo' | 'voice';

/** A short look at the message being replied to. */
export interface ReplyView {
  id: string;
  fromMe: boolean;
  kind: MessageKindView;
  text: string;
  unsent: boolean;
}

export interface MessageView {
  id: string;
  friendId: string;
  fromMe: boolean;
  /** `system` lines come from Vibe (matched in Discover, call events): show them centred, not as a bubble. */
  kind: MessageKindView;
  /** System lines: `{ event, ... }`. Photos: `{ url, w, h }`. Voice notes: `{ url, seconds }`. */
  meta: Record<string, unknown> | null;
  text: string;
  giftId: string | null;
  at: string;
  readAt: string | null;
  /** The message this one replies to (null when none, or it's gone). */
  replyTo: ReplyView | null;
  /** One reaction each: yours and theirs. */
  reactions: { mine: string | null; theirs: string | null };
  /** Unsent by the sender: show "Message unsent". */
  unsent: boolean;
}

export type MediaKind = 'photo' | 'voice';

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const VOICE_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};
/** What a photo or voice note says in previews, pushes and the chat list. */
const MEDIA_TEXT: Record<MediaKind, string> = { photo: '📷 Photo', voice: '🎤 Voice message' };
const TYPING = (from: string, to: string) => `typing:${from}:${to}`;
/** One reaction: a short emoji, no letters or digits. */
const isEmoji = (s: string) => s.length > 0 && [...s].length <= 4 && !/[\p{L}\p{N}<>]/u.test(s);

/**
 * Chat between friends: text, gifts, photos and voice notes, replies,
 * reactions, unsend, typing and read receipts — every change pushed live.
 */
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
    private readonly storage: StorageProvider,
    private readonly redis: RedisService,
  ) {}

  private get rules() {
    return this.economy.rules;
  }

  private toView(m: Message, me: string, friendId: string, replies: Map<string, Message> = new Map()): MessageView {
    const reactions = (m.reactions as Record<string, string> | null) ?? {};
    const reply = m.replyToId ? replies.get(m.replyToId) : undefined;
    return {
      id: m.id,
      friendId,
      fromMe: m.senderId === me,
      kind: m.kind.toLowerCase() as MessageKindView,
      meta: m.unsentAt ? null : ((m.meta as Record<string, unknown> | null) ?? null),
      text: m.unsentAt ? '' : m.text,
      giftId: m.giftId,
      at: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
      replyTo: reply
        ? { id: reply.id, fromMe: reply.senderId === me, kind: reply.kind.toLowerCase() as MessageKindView, text: reply.unsentAt ? '' : reply.text.slice(0, 140), unsent: !!reply.unsentAt }
        : null,
      reactions: { mine: reactions[me] ?? null, theirs: reactions[friendId] ?? null },
      unsent: !!m.unsentAt,
    };
  }

  private async repliesFor(rows: Message[]): Promise<Map<string, Message>> {
    const ids = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
    if (!ids.length) return new Map();
    const found = await this.prisma.message.findMany({ where: { id: { in: ids } } });
    return new Map(found.map((m) => [m.id, m]));
  }

  private async viewOf(m: Message, me: string, friendId: string): Promise<MessageView> {
    return this.toView(m, me, friendId, await this.repliesFor([m]));
  }

  async list(me: string, friendId: string, q: CursorQueryDto) {
    const f = await this.friends.requireFriends(me, friendId);
    const rows = await this.prisma.message.findMany({ where: { friendshipId: f.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...cursorArgs(q) });
    const replies = await this.repliesFor(rows);
    return toPage(rows, q.limit, (m) => this.toView(m, me, friendId, replies));
  }

  /** A reply must point at a message in the same chat. */
  private async replyTarget(friendshipId: string, replyToId?: string): Promise<string | null> {
    if (!replyToId) return null;
    const target = await this.prisma.message.findFirst({ where: { id: replyToId, friendshipId }, select: { id: true, kind: true } });
    if (!target || target.kind === MessageKind.SYSTEM) throw new AppError(ErrorCode.VALIDATION_FAILED, "That message can't be replied to");
    return target.id;
  }

  async send(me: string, friendId: string, text: string, replyToId?: string): Promise<MessageView> {
    const clean = text.trim();
    if (!clean) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Message is empty');
    const f = await this.friends.requireFriends(me, friendId);
    const reply = await this.replyTarget(f.id, replyToId);
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({ data: { friendshipId: f.id, senderId: me, text: clean, replyToId: reply } });
      await tx.friendship.update({ where: { id: f.id }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    await this.push(m, me, friendId);
    await this.streaks.noteMessage(me, friendId);
    return this.viewOf(m, me, friendId);
  }

  /** A photo (JPEG/PNG/WebP) or a voice note, stored and sent as a message. */
  async sendMedia(
    me: string,
    friendId: string,
    kind: MediaKind,
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    info: { seconds?: number; w?: number; h?: number; replyToId?: string } = {},
  ): Promise<MessageView> {
    if (!file) throw new AppError(ErrorCode.VALIDATION_FAILED, kind === 'photo' ? 'Add a photo' : 'Record a voice note');
    if (kind === 'photo' && !this.rules.chatPhotosEnabled) throw new AppError(ErrorCode.FEATURE_DISABLED, 'Photos in chat are off for now', HttpStatus.FORBIDDEN);
    if (kind === 'voice' && !this.rules.chatVoiceNotesEnabled) throw new AppError(ErrorCode.FEATURE_DISABLED, 'Voice notes are off for now', HttpStatus.FORBIDDEN);
    const mime = file.mimetype.split(';')[0].trim().toLowerCase();
    const ext = (kind === 'photo' ? PHOTO_TYPES : VOICE_TYPES)[mime];
    if (!ext) throw new AppError(ErrorCode.VALIDATION_FAILED, kind === 'photo' ? 'Use a JPEG, PNG or WebP photo' : 'That audio format is not supported', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    const seconds = Math.max(1, Math.round(info.seconds ?? 1));
    if (kind === 'voice' && seconds > this.rules.chatVoiceNoteMaxSeconds + 2)
      throw new AppError(ErrorCode.VALIDATION_FAILED, `Voice notes can be up to ${this.rules.chatVoiceNoteMaxSeconds} seconds`);
    const f = await this.friends.requireFriends(me, friendId);
    const reply = await this.replyTarget(f.id, info.replyToId);
    const now = this.clock.now();
    const key = `chat/${f.id}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await this.storage.put(key, file.buffer, mime);
    const meta: Record<string, unknown> =
      kind === 'photo' ? { url, key, ...(info.w && info.h ? { w: info.w, h: info.h } : {}) } : { url, key, seconds };
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: { friendshipId: f.id, senderId: me, kind: kind === 'photo' ? MessageKind.PHOTO : MessageKind.VOICE, text: MEDIA_TEXT[kind], meta: meta as Prisma.InputJsonObject, replyToId: reply },
      });
      await tx.friendship.update({ where: { id: f.id }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    await this.push(m, me, friendId);
    await this.streaks.noteMessage(me, friendId);
    return this.viewOf(m, me, friendId);
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
      const msg = await tx.message.create({ data: { friendshipId: f.id, senderId: me, kind: MessageKind.GIFT, text: `Sent a ${gift.name}`, giftId: gift.id } });
      await tx.friendship.update({ where: { id: f.id }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    await this.push(m, me, friendId);
    await this.streaks.noteMessage(me, friendId);
    return this.toView(m, me, friendId);
  }

  private async ownedMessage(me: string, friendId: string, messageId: string) {
    const f = await this.friends.requireFriends(me, friendId);
    const m = await this.prisma.message.findFirst({ where: { id: messageId, friendshipId: f.id } });
    if (!m) throw AppError.notFound('Message');
    return m;
  }

  /** React to a message with one emoji (again with the same one, or empty, removes it). */
  async react(me: string, friendId: string, messageId: string, emoji?: string | null): Promise<MessageView> {
    const m = await this.ownedMessage(me, friendId, messageId);
    if (m.kind === MessageKind.SYSTEM || m.unsentAt) throw new AppError(ErrorCode.VALIDATION_FAILED, "You can't react to that");
    const clean = (emoji ?? '').trim();
    if (clean && !isEmoji(clean)) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Use one emoji');
    const reactions = { ...((m.reactions as Record<string, string> | null) ?? {}) };
    if (!clean || reactions[me] === clean) delete reactions[me];
    else reactions[me] = clean;
    const updated = await this.prisma.message.update({
      where: { id: m.id },
      data: { reactions: Object.keys(reactions).length ? reactions : Prisma.DbNull },
    });
    await this.pushUpdate(updated, me, friendId);
    return this.viewOf(updated, me, friendId);
  }

  /** Take back your own message within `chatUnsendMinutes`: text and media are removed for both. */
  async unsend(me: string, friendId: string, messageId: string): Promise<MessageView> {
    const m = await this.ownedMessage(me, friendId, messageId);
    if (m.senderId !== me) throw new AppError(ErrorCode.FORBIDDEN, 'You can only unsend your own messages', HttpStatus.FORBIDDEN);
    if (m.unsentAt) return this.viewOf(m, me, friendId);
    if (m.kind === MessageKind.SYSTEM || m.kind === MessageKind.GIFT) throw new AppError(ErrorCode.VALIDATION_FAILED, "That can't be unsent");
    const minutes = this.rules.chatUnsendMinutes;
    if (minutes <= 0 || this.clock.now().getTime() - m.createdAt.getTime() > minutes * 60_000)
      throw new AppError(ErrorCode.VALIDATION_FAILED, minutes > 0 ? `Messages can be unsent for ${minutes} minutes` : 'Unsend is off', HttpStatus.CONFLICT);
    const key = (m.meta as { key?: string } | null)?.key;
    const updated = await this.prisma.message.update({ where: { id: m.id }, data: { unsentAt: this.clock.now(), text: '', meta: Prisma.DbNull, reactions: Prisma.DbNull } });
    if (key) await this.storage.delete(key).catch(() => undefined);
    await this.pushUpdate(updated, me, friendId);
    return this.viewOf(updated, me, friendId);
  }

  /** "typing…" for your friend (at most one signal every 2 s). */
  async typing(me: string, friendId: string): Promise<void> {
    if ((await this.redis.client.set(TYPING(me, friendId), '1', 'EX', 2, 'NX')) !== 'OK') return;
    await this.friends.requireFriends(me, friendId);
    this.realtime.toUser(friendId, ServerEvent.ChatTyping, { friendId: me });
  }

  /**
   * A line from Vibe in a chat ("You matched in Discover", call events),
   * shown to both people. `by` is who it is about (the sender column).
   * Not counted as unread and never pushed as a message.
   */
  async system(friendshipId: string, by: string, otherId: string, text: string, meta: Record<string, unknown>): Promise<MessageView> {
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({ data: { friendshipId, senderId: by, kind: MessageKind.SYSTEM, text, meta: meta as Prisma.InputJsonObject, readAt: this.clock.now() } });
      await tx.friendship.update({ where: { id: friendshipId }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    this.realtime.toUser(otherId, ServerEvent.Message, this.toView(m, otherId, by));
    this.realtime.toUser(by, ServerEvent.Message, this.toView(m, by, otherId));
    return this.toView(m, by, otherId);
  }

  /** Marks their messages read; they see "Seen" (`message:read`). */
  async markRead(me: string, friendId: string): Promise<number> {
    const f = await this.friends.requireFriends(me, friendId);
    const at = this.clock.now();
    const r = await this.prisma.message.updateMany({ where: { friendshipId: f.id, senderId: friendId, readAt: null }, data: { readAt: at } });
    if (r.count > 0) this.realtime.toUser(friendId, ServerEvent.MessagesRead, { friendId: me, at: at.toISOString() });
    return r.count;
  }

  private async push(m: Message, me: string, friendId: string): Promise<void> {
    const replies = await this.repliesFor([m]);
    this.realtime.toUser(friendId, ServerEvent.Message, this.toView(m, friendId, me, replies));
    this.realtime.toUser(me, ServerEvent.Message, this.toView(m, me, friendId, replies));
    this.events.emit(FRIEND_MESSAGE, { from: me, to: friendId, text: m.text, giftId: m.giftId } satisfies FriendMessageEvent);
  }

  private async pushUpdate(m: Message, me: string, friendId: string): Promise<void> {
    const replies = await this.repliesFor([m]);
    this.realtime.toUser(friendId, ServerEvent.MessageUpdated, this.toView(m, friendId, me, replies));
    this.realtime.toUser(me, ServerEvent.MessageUpdated, this.toView(m, me, friendId, replies));
  }
}
