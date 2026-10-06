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

  get offsetMinutes(): number {
    return this.offsetMs / 60_000;
  }

  /** Business day number: `floor((epochMs + offset) / day)`. Streaks and once-a-day jobs key on it. */
  dayIndex(at: Date = this.now()): number {
    return dayIndexOf(at.getTime(), this.offsetMinutes);
  }

  /** The instant business day `dayIndex` starts (local midnight). */
  dayStart(dayIndex: number): Date {
    return new Date(dayIndex * DAY_MS - this.offsetMs);
  }

  /** Minutes since business midnight (0–1439). */
  minuteOfDay(at: Date = this.now()): number {
    return Math.floor((((at.getTime() + this.offsetMs) % DAY_MS) + DAY_MS) % DAY_MS / 60_000);
  }

  /** Business week number; weeks start Monday 00:00 business time. */
  weekIndex(at: Date = this.now()): number {
    return weekIndexOfDay(this.dayIndex(at));
  }

  /** Monday 00:00 (business time) of week `weekIndex`. */
  weekStart(weekIndex: number): Date {
    return this.dayStart(weekIndex * 7 - MONDAY_SHIFT);
  }

  /** 0 = Monday … 6 = Sunday, business time. */
  weekday(at: Date = this.now()): number {
    return (this.dayIndex(at) + MONDAY_SHIFT) % 7;
  }
}

/** Day 0 (1970-01-01) was a Thursday: shifting by 3 puts week boundaries on Mondays. */
const MONDAY_SHIFT = 3;

export const dayIndexOf = (epochMs: number, offsetMinutes: number): number => Math.floor((epochMs + offsetMinutes * 60_000) / DAY_MS);
export const weekIndexOfDay = (dayIndex: number): number => Math.floor((dayIndex + MONDAY_SHIFT) / 7);

export const MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: DAY_MS };
