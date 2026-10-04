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

export class SocialSignInDto {
  @ApiProperty({ enum: ['google', 'apple'] })
  @IsIn(['google', 'apple'])
  provider!: 'google' | 'apple';

  @ApiProperty({ description: 'ID token from the platform SDK (dev: "dev:<id>")' })
  @IsString()
  @Length(3, 4096)
  idToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(4, 12)
  inviteCode?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}
