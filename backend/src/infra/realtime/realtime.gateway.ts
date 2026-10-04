import { Logger, UseFilters } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  ConnectedSocket,
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
import { userRoom } from './realtime.events';
import { RealtimeService } from './realtime.service';

export const SOCKET_CONNECTED = 'socket.connected';
export const SOCKET_DISCONNECTED = 'socket.disconnected';

export interface SocketLifecycleEvent {
  userId: string;
  socketId: string;
  /** Disconnect only: no sockets left for this user anywhere. */
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
    await socket.join(userRoom(user.id));
    await this.realtime.markConnected(user.id);
    this.events.emit(SOCKET_CONNECTED, { userId: user.id, socketId: socket.id } satisfies SocketLifecycleEvent);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const user = socket.data.user as AuthUser | undefined;
    if (!user) return;
    try {
      const lastSocket = await this.realtime.markDisconnected(user.id);
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

  @Interval(30_000)
  async refreshPresence(): Promise<void> {
    if (!this.server) return;
    const ids = new Set<string>();
    for (const s of this.server.sockets.sockets.values()) {
      const u = s.data.user as AuthUser | undefined;
      if (u) ids.add(u.id);
    }
    await this.realtime.heartbeat([...ids]);
  }
}
