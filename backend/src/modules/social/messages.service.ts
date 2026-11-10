import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { type Message, MessageKind, Prisma } from '@prisma/client';

import { cursorArgs, CursorQueryDto, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { SOCKET_CONNECTED, SocketLifecycleEvent } from '../../infra/realtime/realtime.gateway';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { StorageProvider } from '../../infra/storage/storage.provider';
import { EconomyService } from '../catalog/economy.service';
import { ChatSafetyService } from '../chat-safety/chat-safety.service';
import { ActivityFeedService, CHAT_TYPES } from '../notifications/activity-feed.service';
import { ImageSafetyService } from '../safety/image-safety.service';
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
  /** Reached their phone or an open tab (two grey ticks); null = sent only (one tick). */
  deliveredAt: string | null;
  /** They read it (two coloured ticks). */
  readAt: string | null;
  /** The message this one replies to (null when none, or it's gone). */
  replyTo: ReplyView | null;
  /** One reaction each: yours and theirs. */
  reactions: { mine: string | null; theirs: string | null };
  /** Unsent by the sender: show "Message unsent". */
  unsent: boolean;
  /** The sender changed the text: show "edited". */
  edited: boolean;
}

export type MediaKind = 'photo' | 'voice';

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
    private readonly safety: ChatSafetyService,
    private readonly images: ImageSafetyService,
    private readonly feed: ActivityFeedService,
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
      deliveredAt: (m.deliveredAt ?? m.readAt)?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      replyTo: reply
        ? { id: reply.id, fromMe: reply.senderId === me, kind: reply.kind.toLowerCase() as MessageKindView, text: reply.unsentAt ? '' : reply.text.slice(0, 140), unsent: !!reply.unsentAt }
        : null,
      reactions: { mine: reactions[me] ?? null, theirs: reactions[friendId] ?? null },
      unsent: !!m.unsentAt,
      edited: !!m.editedAt && !m.unsentAt,
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
    // New friends: phone numbers, handles and e-mails become "****" (the sender sees a note under it).
    const safe = this.safety.screensFriends(f.acceptedAt ?? f.createdAt) ? await this.safety.screen({ userId: me, place: 'chat', refId: f.id, text: clean }) : { text: clean, hidden: false };
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({ data: { friendshipId: f.id, senderId: me, text: safe.text, replyToId: reply, ...(safe.hidden ? { meta: { hidden: true } } : {}) } });
      await tx.friendship.update({ where: { id: f.id }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    await this.push(m, me, friendId);
    await this.streaks.noteMessage(me, friendId);
    return this.viewOf(m, me, friendId);
  }

  /** A photo (JPEG/PNG/WebP in, a clean JPEG stored) or a voice note, sent as a message. */
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
    const voiceExt = VOICE_TYPES[mime];
    if (kind === 'voice' && !voiceExt) throw new AppError(ErrorCode.VALIDATION_FAILED, 'That audio format is not supported', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    const seconds = Math.max(1, Math.round(info.seconds ?? 1));
    if (kind === 'voice' && seconds > this.rules.chatVoiceNoteMaxSeconds + 2)
      throw new AppError(ErrorCode.VALIDATION_FAILED, `Voice notes can be up to ${this.rules.chatVoiceNoteMaxSeconds} seconds`);
    const f = await this.friends.requireFriends(me, friendId);
    const reply = await this.replyTarget(f.id, info.replyToId);
    // Photos: real image bytes only, re-encoded (no GPS or hidden data) and checked for nudity before anything is stored.
    const photo = kind === 'photo' ? await this.images.screen(me, 'chat', f.id, file.buffer) : null;
    const now = this.clock.now();
    const key = `chat/${f.id}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}.${photo ? photo.ext : voiceExt}`;
    const url = photo ? await this.storage.put(key, photo.buffer, photo.mime) : await this.storage.put(key, file.buffer, mime);
    if (photo) await this.images.noteStored(me, 'chat', f.id, key, photo);
    const meta: Record<string, unknown> = photo ? { url, key, w: photo.width, h: photo.height } : { url, key, seconds };
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

  /**
   * Change the text of your own message, within the same window as unsend
   * (chatUnsendMinutes). Screened like a new message; both get
   * `message:updated` with the new text and `edited: true`.
   */
  async edit(me: string, friendId: string, messageId: string, text: string): Promise<MessageView> {
    const clean = text.trim();
    if (!clean) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Message is empty');
    const m = await this.ownedMessage(me, friendId, messageId);
    if (m.senderId !== me) throw new AppError(ErrorCode.FORBIDDEN, 'You can only edit your own messages', HttpStatus.FORBIDDEN);
    if (m.unsentAt || m.kind !== MessageKind.TEXT) throw new AppError(ErrorCode.VALIDATION_FAILED, "That can't be edited");
    const minutes = this.rules.chatUnsendMinutes;
    if (minutes <= 0 || this.clock.now().getTime() - m.createdAt.getTime() > minutes * 60_000)
      throw new AppError(ErrorCode.VALIDATION_FAILED, minutes > 0 ? `Messages can be edited for ${minutes} minutes` : 'Editing is off', HttpStatus.CONFLICT);
    if (clean === m.text) return this.viewOf(m, me, friendId);
    const f = await this.friends.requireFriends(me, friendId);
    const safe = this.safety.screensFriends(f.acceptedAt ?? f.createdAt) ? await this.safety.screen({ userId: me, place: 'chat', refId: f.id, text: clean }) : { text: clean, hidden: false };
    const meta = { ...((m.meta as Record<string, unknown> | null) ?? {}), ...(safe.hidden ? { hidden: true } : {}) };
    const updated = await this.prisma.message.update({
      where: { id: m.id },
      data: { text: safe.text, editedAt: this.clock.now(), meta: Object.keys(meta).length ? (meta as Prisma.InputJsonObject) : Prisma.DbNull },
    });
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
      const msg = await tx.message.create({ data: { friendshipId, senderId: by, kind: MessageKind.SYSTEM, text, meta: meta as Prisma.InputJsonObject, deliveredAt: this.clock.now(), readAt: this.clock.now() } });
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
    // Read the chat (from a push, the chat list or the Notifications page): its notification lines are read too.
    await this.feed.markReadAbout(me, friendId, CHAT_TYPES);
    return r.count;
  }

  /**
   * Their messages reached you (you connected, opened the app or a chat):
   * delivered now, and each sender's ticks turn into two grey ones live.
   */
  async markDelivered(me: string): Promise<number> {
    const pending = await this.prisma.message.findMany({
      where: { deliveredAt: null, senderId: { not: me }, friendship: { OR: [{ userLowId: me }, { userHighId: me }] } },
      select: { id: true, senderId: true },
      take: 5000,
    });
    if (!pending.length) return 0;
    const at = this.clock.now();
    await this.prisma.message.updateMany({ where: { id: { in: pending.map((m) => m.id) }, deliveredAt: null }, data: { deliveredAt: at } });
    for (const sender of new Set(pending.map((m) => m.senderId))) this.realtime.toUser(sender, ServerEvent.MessagesDelivered, { friendId: me, at: at.toISOString() });
    return pending.length;
  }

  @OnEvent(SOCKET_CONNECTED, { async: true, suppressErrors: true })
  async onConnect(e: SocketLifecycleEvent): Promise<void> {
    await this.markDelivered(e.userId);
  }

  private async push(m: Message, me: string, friendId: string): Promise<void> {
    // They're connected (phone or tab): it reached them now, so it goes out with two grey ticks.
    if (await this.realtime.isOnline(friendId)) {
      const at = this.clock.now();
      await this.prisma.message.update({ where: { id: m.id }, data: { deliveredAt: at } });
      m.deliveredAt = at;
    }
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
