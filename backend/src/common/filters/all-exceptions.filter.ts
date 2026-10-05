import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

/** Maps anything thrown into one predictable error shape. */
export function toErrorBody(exception: unknown): { status: number; body: ErrorBody['error'] } {
  if (exception instanceof AppError) {
    return { status: exception.status, body: exception.toJSON() };
  }
  if (exception instanceof ThrottlerException) {
    return { status: HttpStatus.TOO_MANY_REQUESTS, body: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests, slow down' } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const message = typeof res === 'string' ? res : ((res as { message?: unknown }).message ?? exception.message);
    if (status === HttpStatus.BAD_REQUEST && Array.isArray(message)) {
      return { status, body: { code: ErrorCode.VALIDATION_FAILED, message: 'Some fields are invalid', details: { fields: message } } };
    }
    const code =
      status === HttpStatus.UNAUTHORIZED
        ? ErrorCode.UNAUTHENTICATED
        : status === HttpStatus.FORBIDDEN
          ? ErrorCode.FORBIDDEN
          : status === HttpStatus.NOT_FOUND
            ? ErrorCode.NOT_FOUND
            : status === HttpStatus.PAYLOAD_TOO_LARGE || status === HttpStatus.BAD_REQUEST || status === HttpStatus.UNSUPPORTED_MEDIA_TYPE
              ? ErrorCode.VALIDATION_FAILED
              : ErrorCode.INTERNAL;
    return { status, body: { code, message: String(message) } };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') return { status: HttpStatus.CONFLICT, body: { code: ErrorCode.CONFLICT, message: 'Already exists' } };
    if (exception.code === 'P2025') return { status: HttpStatus.NOT_FOUND, body: { code: ErrorCode.NOT_FOUND, message: 'Not found' } };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { code: ErrorCode.INTERNAL, message: 'Something went wrong' } };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception; // sockets handle their own (see WsExceptionFilter)
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const { status, body } = toErrorBody(exception);
    if (status >= 500 && !(exception instanceof AppError)) this.logger.error({ err: exception, path: req.url }, 'Unhandled error');
    else if (status >= 500) this.logger.warn({ code: (exception as AppError).code, path: req.url }, (exception as AppError).message);
    const payload: ErrorBody = { error: body, requestId: req.id ? String(req.id) : undefined };
    res.status(status).json(payload);
  }
}
