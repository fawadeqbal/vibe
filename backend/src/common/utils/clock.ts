import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single source of "now" and of business days. Daily limits (check-in,
 * ads, free friend requests) reset at local midnight of the business
 * timezone, not at UTC midnight. Tests swap `now` to travel in time.
 */
@Injectable()
export class Clock {
  private offsetMs: number;
  private override: Date | null = null;

  constructor(config: AppConfig) {
    this.offsetMs = config.get('BUSINESS_TZ_OFFSET_MINUTES') * 60_000;
  }

  now(): Date {
    return this.override ? new Date(this.override) : new Date();
  }

  /** Test helper. */
  set(date: Date | null): void {
    this.override = date;
  }

  /** Midnight (as a UTC Date) of the business day containing `at`. */
  dayOf(at: Date = this.now()): Date {
    const local = at.getTime() + this.offsetMs;
    const midnightLocal = Math.floor(local / DAY_MS) * DAY_MS;
    return new Date(midnightLocal); // stored in @db.Date columns: the calendar day
  }

  sameDay(a: Date | null | undefined, b: Date = this.now()): boolean {
    return !!a && this.dayOf(a).getTime() === this.dayOf(b).getTime();
  }

  /** True when `a` falls on the business day before `b`. */
  isYesterday(a: Date | null | undefined, b: Date = this.now()): boolean {
    return !!a && this.dayOf(b).getTime() - this.dayOf(a).getTime() === DAY_MS;
  }

  /** `@db.Date` columns come back as UTC midnight of the stored day. */
  isToday(dateColumn: Date | null | undefined): boolean {
    return !!dateColumn && dateColumn.getTime() === this.dayOf().getTime();
  }

  plus(ms: number, from: Date = this.now()): Date {
    return new Date(from.getTime() + ms);
  }
}

export const MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: DAY_MS };
