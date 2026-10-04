import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Cursor pagination: pass back `nextCursor` to get the next page. */
export class CursorQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Builds a page from rows fetched with `take: limit + 1`, ordered newest
 * first. The cursor is the id of the last returned row.
 */
export function toPage<T extends { id: string }, R>(rows: T[], limit: number, map: (row: T) => R): Page<R> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return { items: slice.map(map), nextCursor: hasMore ? slice[slice.length - 1].id : null };
}

/** Prisma args for `toPage`. */
export function cursorArgs(q: CursorQueryDto): { take: number; skip?: number; cursor?: { id: string } } {
  return q.cursor ? { take: q.limit + 1, skip: 1, cursor: { id: q.cursor } } : { take: q.limit + 1 };
}
