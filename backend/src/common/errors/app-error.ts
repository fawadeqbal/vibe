import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from './error-codes';

/**
 * The one exception type domain code throws. Carries an [ErrorCode], an
 * HTTP status for REST, and optional details (e.g. `{ needed: 15, have: 4 }`).
 * Works the same over HTTP (exception filter) and sockets (ack error).
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(what: string, details?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND, details);
  }

  static forbidden(message = 'Not allowed', code = ErrorCode.FORBIDDEN): AppError {
    return new AppError(code, message, HttpStatus.FORBIDDEN);
  }

  static conflict(message: string, code = ErrorCode.CONFLICT, details?: Record<string, unknown>): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }

  static unauthenticated(message = 'Sign in required', code = ErrorCode.UNAUTHENTICATED): AppError {
    return new AppError(code, message, HttpStatus.UNAUTHORIZED);
  }

  static insufficientCoins(needed: number, have: number): AppError {
    return new AppError(ErrorCode.INSUFFICIENT_COINS, 'Not enough coins', HttpStatus.PAYMENT_REQUIRED, { needed, have });
  }

  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}
