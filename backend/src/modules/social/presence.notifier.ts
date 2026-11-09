import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { Clock } from '../../common/utils/clock';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { SOCKET_CONNECTED, SOCKET_DISCONNECTED, SocketLifecycleEvent } from '../../infra/realtime/realtime.gateway';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { FriendsService } from './friends.service';

/** A phone that drops off for a moment (lock screen, tunnel, app switch) shouldn't flash "offline" to friends. */
export const OFFLINE_GRACE_MS = 15_000;

export interface PresenceChange {
  userId: string;
  online: boolean;
  /** When they left (offline only). */
  lastSeenAt: string | null;
}

/**
 * Tells friends live when someone comes online or goes offline
 * (`social:presence`), so the green dot and "Last seen" in the chat list,
 * chat header and profile update without reloading. Offline waits a short
 * grace period and is skipped if they came back.
 */
@Injectable()
export class PresenceNotifier implements OnModuleDestroy {
  private readonly log = new Logger(PresenceNotifier.name);
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  /** Swapped in tests. */
  graceMs = OFFLINE_GRACE_MS;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly friends: FriendsService,
    private readonly clock: Clock,
  ) {}

  @OnEvent(SOCKET_CONNECTED, { async: true, suppressErrors: true })
  async onConnect(e: SocketLifecycleEvent): Promise<void> {
    const wasLeaving = this.pending.get(e.userId);
    if (wasLeaving) {
      // Back within the grace period: friends never saw them leave.
      clearTimeout(wasLeaving);
      this.pending.delete(e.userId);
      return;
    }
    if (e.firstSocket) await this.tell({ userId: e.userId, online: true, lastSeenAt: null });
  }

  @OnEvent(SOCKET_DISCONNECTED, { async: true, suppressErrors: true })
  onDisconnect(e: SocketLifecycleEvent): void {
    if (!e.lastSocket) return;
    const leftAt = this.clock.now().toISOString();
    clearTimeout(this.pending.get(e.userId));
    this.pending.set(
      e.userId,
      setTimeout(() => {
        this.pending.delete(e.userId);
        void (async () => {
          if (await this.realtime.isOnline(e.userId)) return; // reconnected on another instance
          await this.tell({ userId: e.userId, online: false, lastSeenAt: leftAt });
        })().catch((err: Error) => this.log.warn(`presence for ${e.userId} failed: ${err.message}`));
      }, this.graceMs),
    );
  }

  private async tell(change: PresenceChange): Promise<void> {
    const ids = await this.friends.friendIds(change.userId);
    if (ids.length) this.realtime.toUsers(ids, ServerEvent.PresenceChanged, change);
  }

  onModuleDestroy(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}
