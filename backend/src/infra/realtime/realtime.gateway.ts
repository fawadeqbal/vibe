import { Logger, UseFilters } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Server, Socket } from 'socket.io';

import { WsExceptionFilter } from '../../common/filters/ws-exception.filter';
import type { AuthUser } from '../../common/types/auth-user';
import { type ClientKind, socketClient } from '../../modules/platforms/client-kind';
import { userRoom } from './realtime.events';
import { RealtimeService } from './realtime.service';

export const SOCKET_CONNECTED = 'socket.connected';
export const SOCKET_DISCONNECTED = 'socket.disconnected';

export interface SocketLifecycleEvent {
  userId: string;
  socketId: string;
  /** Connect only: this is the user's only socket (they just came online). */
  firstSocket?: boolean;
  /** Connect only: which Vibe this socket is (android / ios / web). */
  client?: ClientKind;
  /** Disconnect only: no sockets left for this user anywhere (they just went offline). */
  lastSocket?: boolean;
}

/**
 * Connection lifecycle and presence. Feature gateways (matching) attach
 * their own handlers to the same server; they learn about connects and
 * disconnects through the events emitted here.
 */
@UseFilters(WsExceptionFilter)
@WebSocketGateway({ transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const user = socket.data.user as AuthUser | undefined;
    if (!user) return void socket.disconnect(true);
    const client = socketClient(socket.handshake);
    socket.data.client = client;
    // `active: false` in the handshake: the app reconnected while in the background.
    socket.data.active = (socket.handshake.auth as { active?: unknown } | undefined)?.active !== false;
    await socket.join(userRoom(user.id));
    await this.realtime.markConnected(user.id);
    if (socket.data.active) await this.realtime.heartbeatActive([user.id]);
    const firstSocket = (await this.realtime.socketCount(user.id)) <= 1;
    this.events.emit(SOCKET_CONNECTED, { userId: user.id, socketId: socket.id, firstSocket, client } satisfies SocketLifecycleEvent);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const user = socket.data.user as AuthUser | undefined;
    if (!user) return;
    try {
      // This socket has already left its rooms, so only the person's other tabs and devices are counted.
      const lastSocket = (await this.realtime.socketCount(user.id)) === 0;
      if (lastSocket) await this.realtime.markOffline(user.id);
      await this.realtime.refreshActive(user.id);
      this.events.emit(SOCKET_DISCONNECTED, { userId: user.id, socketId: socket.id, lastSocket } satisfies SocketLifecycleEvent);
    } catch (e) {
      // Shutting down (Redis already closed) — nothing left to clean up.
      this.logger.debug(`disconnect cleanup skipped: ${(e as Error).message}`);
    }
  }

  /** Clients may ping to keep presence fresh; the interval below covers idle sockets. */
  @SubscribeMessage('presence:ping')
  ping(@ConnectedSocket() socket: Socket): { ok: true } {
    void this.realtime.heartbeat([(socket.data.user as AuthUser).id]);
    return { ok: true };
  }

  /**
   * The app went to the background or came back; a tab was hidden, left
   * idle or used again. While none of your sockets is in use, pushes go to
   * your phone even though you're still connected.
   */
  @SubscribeMessage('presence:active')
  async active(@ConnectedSocket() socket: Socket, @MessageBody() body: { active?: unknown } | undefined): Promise<{ ok: true; data: { active: boolean } }> {
    socket.data.active = body?.active !== false;
    const active = await this.realtime.refreshActive((socket.data.user as AuthUser).id);
    return { ok: true, data: { active } };
  }

  @Interval(30_000)
  async refreshPresence(): Promise<void> {
    await this.realtime.heartbeat(this.realtime.localUserIds());
    await this.realtime.heartbeatActive(this.realtime.localActiveUserIds());
  }
}
