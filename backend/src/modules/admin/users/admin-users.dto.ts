import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, NotEquals } from 'class-validator';

import { AdminListQuery, QueryBool } from '../core/admin-query';

export const USER_SORTS = ['newest', 'oldest', 'lastSeen', 'mostMatches'] as const;
export type UserSort = (typeof USER_SORTS)[number];

export class UserListQuery extends AdminListQuery {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @QueryBool()
  @IsBoolean()
  banned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @QueryBool()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @QueryBool()
  @IsBoolean()
  vip?: boolean;

  @ApiPropertyOptional({ description: 'Include dev bots (hidden by default)' })
  @IsOptional()
  @QueryBool()
  @IsBoolean()
  bots?: boolean;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @ApiPropertyOptional({ enum: USER_SORTS })
  @IsOptional()
  @IsIn(USER_SORTS)
  sort: UserSort = 'newest';
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(100)
  age?: number;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  /** Removes the profile photo (and the verified badge that depends on it). */
  @IsOptional()
  @IsBoolean()
  removeAvatar?: boolean;

  @IsString()
  @Length(3, 200)
  reason!: string;
}

export class BanDto {
  /** Hours; 87600 ≈ 10 years for a permanent ban. */
  @IsInt()
  @Min(1)
  @Max(87_600)
  hours!: number;

  @IsString()
  @Length(3, 200)
  reason!: string;
}

export class ReasonDto {
  @IsString()
  @Length(3, 200)
  reason!: string;
}

export class VerificationDto {
  @IsBoolean()
  verified!: boolean;

  @IsString()
  @Length(3, 200)
  reason!: string;
}

export class WalletAdjustDto {
  @Type(() => Number)
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  coins: number = 0;

  @Type(() => Number)
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  gems: number = 0;

  /** Shown to the user in their wallet history. */
  @IsString()
  @Length(3, 80)
  title!: string;

  /** Internal; goes to the audit log. */
  @IsString()
  @Length(3, 200)
  reason!: string;

  /** Client-generated; a retried request with the same key applies once. */
  @IsString()
  @Length(8, 80)
  idempotencyKey!: string;
}

export class GrantVipDto {
  @IsInt()
  @Min(1)
  @Max(366)
  @NotEquals(0)
  days!: number;

  @IsString()
  @Length(3, 200)
  reason!: string;
}

export class NoteDto {
  @IsString()
  @Length(1, 2000)
  text!: string;
}
