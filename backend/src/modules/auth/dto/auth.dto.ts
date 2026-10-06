import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * Where a new account came from (share link, Play install referrer, web
 * `?ref=`). Only used when the account is created.
 */
export class InviteFields {
  @ApiPropertyOptional({ description: 'Invite or creator-partner code from a share link (3–20 letters, digits or _)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,20}$/, { message: 'That invite code does not look right' })
  inviteCode?: string;

  @ApiPropertyOptional({ description: 'The link\'s `s=` channel (tiktok, youtube, whatsapp…): lower-case letters, digits, _ or -, up to 24' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[a-z0-9_-]{1,24}$/, { message: 'inviteSource: 1–24 lower-case letters, digits, _ or -' })
  inviteSource?: string;

  @ApiPropertyOptional({ enum: ['link', 'install', 'web'], description: 'How the code was captured: app link / deep link, Play install referrer, or the web app' })
  @IsOptional()
  @IsIn(['link', 'install', 'web'])
  inviteVia?: 'link' | 'install' | 'web';

  @ApiPropertyOptional({ description: 'Random install id generated once by the app/web (stored only as a peppered hash)' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{8,128}$/, { message: 'deviceId: 8–128 letters, digits or . _ : -' })
  deviceId?: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: 'sara@gmail.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid e-mail address' })
  @MaxLength(254)
  email!: string;
}

export class VerifyOtpDto extends InviteFields {
  @ApiProperty({ example: 'sara@gmail.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid e-mail address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4}$/, { message: 'The code is 4 digits' })
  code!: string;
}

const PROVIDERS = ['google', 'apple', 'facebook'] as const;
export type SocialProviderName = (typeof PROVIDERS)[number];

/** Tokens from the platform SDK. Which ones depend on the provider (see each field). */
export class SocialCredentialDto {
  @ApiPropertyOptional({ description: 'ID token: Google, Apple, Facebook Limited Login (dev: "dev:<id>[:<name>]")' })
  @IsOptional()
  @IsString()
  @Length(3, 8192)
  idToken?: string;

  @ApiPropertyOptional({ description: 'Facebook access token (classic login)' })
  @IsOptional()
  @IsString()
  @Length(3, 4096)
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Apple authorization code (lets the server revoke access on account deletion)' })
  @IsOptional()
  @IsString()
  @Length(3, 2048)
  authorizationCode?: string;

  @ApiPropertyOptional({ description: 'Raw nonce the app generated (Apple, Facebook Limited Login)' })
  @IsOptional()
  @IsString()
  @Length(8, 200)
  nonce?: string;

  @ApiPropertyOptional({ description: 'Display name (Apple gives it to the app only on first sign-in)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}

export class SocialSignInDto extends IntersectionType(SocialCredentialDto, InviteFields) {
  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: SocialProviderName;
}

export class LinkIdentityDto extends SocialCredentialDto {
  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: SocialProviderName;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}
