import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { randomDigits, safeEqual, sha256 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { MailProvider } from '../../infra/mail/mail.provider';
import { RedisService } from '../../infra/redis/redis.service';
import { MailTemplatesService } from '../messaging/mail-templates.service';

interface OtpState {
  hash: string;
  attempts: number;
}

const KEY = (email: string) => `otp:${email}`;
const RESEND = (email: string) => `otp:resend:${email}`;
const HOURLY = (email: string) => `otp:hourly:${email}`;
const RESEND_SECONDS = 30;

/**
 * 4-digit sign-in codes sent by e-mail, kept (hashed) in Redis with a TTL,
 * a resend cooldown, an hourly cap per address, and a limited number of
 * guesses. Keys are the normalised (lower-case) address.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly mail: MailProvider,
    private readonly templates: MailTemplatesService,
    private readonly config: AppConfig,
  ) {}

  async request(email: string): Promise<{ expiresIn: number; resendIn: number }> {
    const ttl = this.config.get('OTP_TTL_SECONDS');
    if (!(await this.redis.client.set(RESEND(email), '1', 'EX', RESEND_SECONDS, 'NX'))) {
      const wait = await this.redis.client.ttl(RESEND(email));
      throw new AppError(ErrorCode.RATE_LIMITED, `Wait ${wait}s before asking for another code`, HttpStatus.TOO_MANY_REQUESTS, { retryIn: wait });
    }
    if ((await this.redis.incrWithTtl(HOURLY(email), 3600)) > 5) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'Too many codes for this address. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const fixed = this.config.isProduction ? undefined : this.config.get('OTP_FIXED_CODE');
    const code = fixed ?? randomDigits(4);
    await this.redis.setJson(KEY(email), { hash: sha256(`${email}:${code}`), attempts: 0 } satisfies OtpState, ttl);
    try {
      const m = await this.templates.render('sign_in_code', { code, minutes: Math.round(ttl / 60), email, name: 'there' });
      await this.mail.send({ to: email, subject: m.subject, html: m.html, text: m.text });
    } catch (e) {
      // Nothing was delivered: let them try again straight away.
      await this.redis.client.del(KEY(email), RESEND(email));
      this.logger.error({ err: e }, `Sign-in e-mail to ${email} failed`);
      throw new AppError(ErrorCode.EMAIL_NOT_SENT, "We couldn't send the e-mail. Check the address and try again.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { expiresIn: ttl, resendIn: RESEND_SECONDS };
  }

  /** Throws unless the code matches; a correct code works once. */
  async verify(email: string, code: string): Promise<void> {
    const state = await this.redis.getJson<OtpState>(KEY(email));
    if (!state) throw new AppError(ErrorCode.OTP_EXPIRED, 'That code expired. Ask for a new one.', HttpStatus.UNAUTHORIZED);
    if (state.attempts >= this.config.get('OTP_MAX_ATTEMPTS')) {
      await this.redis.client.del(KEY(email));
      throw new AppError(ErrorCode.OTP_TOO_MANY_ATTEMPTS, 'Too many wrong codes. Ask for a new one.', HttpStatus.UNAUTHORIZED);
    }
    if (!safeEqual(state.hash, sha256(`${email}:${code}`))) {
      const ttl = await this.redis.client.ttl(KEY(email));
      await this.redis.setJson(KEY(email), { ...state, attempts: state.attempts + 1 }, Math.max(ttl, 1));
      throw new AppError(ErrorCode.OTP_INVALID, 'Wrong code', HttpStatus.UNAUTHORIZED, { attemptsLeft: this.config.get('OTP_MAX_ATTEMPTS') - state.attempts - 1 });
    }
    await this.redis.client.del(KEY(email));
  }
}
