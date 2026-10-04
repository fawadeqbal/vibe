import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

import { CursorQueryDto, Page } from '../../../common/dto/pagination.dto';
import { maskEmail } from '../../../common/utils/text';
import type { Permission } from './permissions';
import type { StaffPrincipal } from './staff.types';

/**
 * Base for every admin list: cursor paging + free-text search + a created
 * date range. Feature DTOs extend it with their own filters, so every
 * table in the panel pages, searches and filters the same way.
 */
export class AdminListQuery extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  q?: string;

  @ApiPropertyOptional({ description: 'Created at or after (ISO date)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Created before (ISO date)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

/** `?verified=true` → true; anything else → undefined/false. */
export const QueryBool = () => Transform(({ value }) => (value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1'));

/** `?status=OPEN,ACTIONED` → ['OPEN', 'ACTIONED'] (pair with `@IsIn([...], { each: true })`). */
export const QueryList = () => Transform(({ value }) => (value === undefined || value === '' ? undefined : Array.isArray(value) ? value : String(value).split(',').map((s) => s.trim()).filter(Boolean)));

export function createdRange(q: { from?: string; to?: string }): { gte?: Date; lt?: Date } | undefined {
  if (!q.from && !q.to) return undefined;
  return { gte: q.from ? new Date(q.from) : undefined, lt: q.to ? new Date(q.to) : undefined };
}

/** Newest first with a stable tie-break, so cursors never skip or repeat rows. */
export const NEWEST_FIRST = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

export function pageArgs(q: CursorQueryDto) {
  return { orderBy: NEWEST_FIRST, take: q.limit + 1, ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}) };
}

export function toAdminPage<T extends { id: string }, R>(rows: T[], limit: number, map: (row: T) => R): Page<R> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return { items: slice.map(map), nextCursor: hasMore ? slice[slice.length - 1].id : null };
}

export const can = (staff: StaffPrincipal, p: Permission): boolean => staff.permissions.includes(p);

/** Full e-mail for people allowed to see contact details, masked otherwise. */
export const emailFor = (staff: StaffPrincipal, email: string | null): string | null => (email ? (can(staff, 'users.pii') ? email : maskEmail(email)) : null);

export const looksLikeId = (s: string): boolean => /^c[a-z0-9]{20,30}$/.test(s);
