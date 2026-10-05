import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: 'sara@gmail.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid e-mail address' })
  @MaxLength(254)
  email!: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4}$/, { message: 'The code is 4 digits' })
  code!: string;

  @ApiPropertyOptional({ description: "Inviter's code from a share link" })
  @IsOptional()
  @IsString()
  @Length(4, 12)
  inviteCode?: string;
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

export class SocialSignInDto extends SocialCredentialDto {
  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: SocialProviderName;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(4, 12)
  inviteCode?: string;
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
