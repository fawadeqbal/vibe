import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

import { toErrorBody } from './all-exceptions.filter';

/**
 * Socket handlers return `{ ok: true, data }` or `{ ok: false, error }` via the
 * ack callback; anything thrown becomes the error shape REST uses too.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger('WsExceptions');

  override catch(exception: unknown, host: ArgumentsHost): void {
    const ws = host.switchToWs();
    const client = ws.getClient<Socket>();
    const { status, body } = toErrorBody(exception);
    if (status >= 500) this.logger.error({ err: exception }, 'Unhandled socket error');
    const args = host.getArgs();
    const ack = args.find((a) => typeof a === 'function') as ((r: unknown) => void) | undefined;
    if (ack) ack({ ok: false, error: body });
    else client.emit('error', { ok: false, error: body });
  }
}
