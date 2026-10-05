import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent, ServerEventName } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { PushMessage } from './push-sender';
import { PushService } from './push.service';

type Payload = Record<string, unknown>;
type Builder = (payload: Payload, userId: string) => Promise<PushMessage | null> | PushMessage | null;

/**
 * Turns realtime events into push notifications for people who are not
 * connected (the app shows its own in-app UI when it is open). Adding a
 * notification = one entry in `builders`.
 */
@Injectable()
export class PushBridge implements OnModuleInit {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly builders: Partial<Record<ServerEventName, Builder>> = {
    [ServerEvent.Message]: async (p) => {
      if (p.fromMe) return null;
      const friend = await this.prisma.user.findUnique({ where: { id: String(p.friendId) }, select: { name: true } });
      return { title: friend?.name || 'New message', body: p.giftId ? 'Sent you a gift 🎁' : String(p.text ?? '').slice(0, 140), data: { route: 'chat', friendId: String(p.friendId) }, category: 'messages', collapseKey: `chat:${p.friendId}` };
    },
    [ServerEvent.FriendRequest]: (p) => {
      const from = (p.from ?? {}) as { id?: string; name?: string };
      return { title: 'New friend request', body: `${from.name || 'Someone'} wants to be friends`, data: { route: 'friends', userId: String(from.id ?? '') }, category: 'social' };
    },
    [ServerEvent.FriendAccepted]: (p) => {
      const f = (p.friend ?? {}) as { id?: string; name?: string };
      return { title: "You're friends now", body: `${f.name || 'Your friend'} accepted your request`, data: { route: 'chat', friendId: String(f.id ?? '') }, category: 'social' };
    },
    [ServerEvent.InboxMessage]: (p) => ({ title: String(p.title ?? 'Message from Vibe'), body: String(p.body ?? '').slice(0, 160), data: { route: 'inbox' }, category: 'inbox' }),
    [ServerEvent.PaymentUpdated]: (p) => {
      if (p.status === 'SUCCEEDED') return { title: 'Payment received', body: p.productType === 'VIP_PLAN' ? 'Your VIP is active. Enjoy!' : 'Your coins are in your wallet.', data: { route: 'wallet', purchaseId: String(p.id) }, category: 'payments', collapseKey: `pay:${p.id}` };
      if (p.status === 'FAILED' || p.status === 'EXPIRED') return { title: 'Payment not completed', body: String(p.failureReason ?? 'The payment did not go through. Nothing was charged.'), data: { route: 'store', purchaseId: String(p.id) }, category: 'payments', collapseKey: `pay:${p.id}` };
      return null;
    },
    [ServerEvent.CashoutUpdated]: (p) => {
      if (p.status === 'PAID') return { title: 'Cash-out sent 💸', body: 'Your money is on its way to your account.', data: { route: 'wallet', cashoutId: String(p.id) }, category: 'payments' };
      if (p.status === 'REJECTED') return { title: 'Cash-out returned', body: `Your gems are back in your wallet. ${String(p.failureReason ?? '')}`.trim(), data: { route: 'wallet', cashoutId: String(p.id) }, category: 'payments' };
      return null;
    },
  };

  onModuleInit(): void {
    this.realtime.onUserEvent((userId, event, payload) => {
      const build = this.builders[event];
      if (build) void this.deliver(userId, build, (payload ?? {}) as Payload);
    });
  }

  private async deliver(userId: string, build: Builder, payload: Payload): Promise<void> {
    try {
      if (await this.realtime.isOnline(userId)) return;
      const msg = await build(payload, userId);
      if (msg) await this.push.sendToUser(userId, msg);
    } catch {
      // Notifications are best effort.
    }
  }
}
