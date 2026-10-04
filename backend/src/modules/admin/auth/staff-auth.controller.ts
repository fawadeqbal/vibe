import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';

import { OK } from '../../../common/dto/ok.dto';
import { AllowIncompleteSetup, Audit, CurrentStaff, StaffApi, StaffPublic } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';
import { StaffAuthService } from './staff-auth.service';
import { StaffClient, StaffTokenService } from './staff-token.service';

class LoginDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}

class TwoFactorLoginDto {
  @IsString()
  @Length(10, 100)
  challenge!: string;

  /** 6-digit authenticator code or a recovery code. */
  @IsString()
  @Length(6, 20)
  code!: string;
}

class RefreshDto {
  @IsString()
  @Length(10, 200)
  refreshToken!: string;
}

class CodeDto {
  @IsString()
  @Length(6, 20)
  code!: string;
}

class PasswordChangeDto {
  @IsString()
  @Length(1, 200)
  currentPassword!: string;

  @IsString()
  @Length(10, 200)
  newPassword!: string;
}

class DisableTotpDto {
  @IsString()
  @Length(1, 200)
  password!: string;

  @IsString()
  @Length(6, 20)
  code!: string;
}

class ProfileDto {
  @IsString()
  @Length(2, 80)
  name!: string;
}

const client = (req: Request): StaffClient => ({ userAgent: (req.headers['x-forwarded-user-agent'] as string) ?? req.headers['user-agent'], ip: req.ip });

/** Sign-in, session and personal security for staff. */
@StaffApi('auth')
@Controller('admin/auth')
export class StaffAuthController {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly tokens: StaffTokenService,
  ) {}

  @StaffPublic()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'E-mail + password. Returns tokens, or a challenge when 2FA is on.' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, client(req), req);
  }

  @StaffPublic()
  @Post('login/2fa')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Finish sign-in with an authenticator or recovery code' })
  loginTwoFactor(@Body() dto: TwoFactorLoginDto, @Req() req: Request) {
    return this.auth.loginTwoFactor(dto.challenge, dto.code, client(req), req);
  }

  @StaffPublic()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, client(req));
  }

  @StaffPublic()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return OK;
  }

  @AllowIncompleteSetup()
  @Get('me')
  me(@CurrentStaff() me: StaffPrincipal) {
    return this.auth.me(me.id);
  }

  @AllowIncompleteSetup()
  @Patch('me')
  @Audit('staff.profile_updated', { target: 'staff' })
  updateMe(@CurrentStaff() me: StaffPrincipal, @Body() dto: ProfileDto) {
    return this.auth.updateProfile(me, dto.name);
  }

  @AllowIncompleteSetup()
  @Post('password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change your password (signs out your other sessions)' })
  changePassword(@CurrentStaff() me: StaffPrincipal, @Body() dto: PasswordChangeDto, @Req() req: Request) {
    return this.auth.changePassword(me, dto.currentPassword, dto.newPassword, req);
  }

  @AllowIncompleteSetup()
  @Post('2fa/setup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start 2FA: returns the secret and an otpauth:// URL for a QR code' })
  setup(@CurrentStaff() me: StaffPrincipal) {
    return this.auth.startTotpSetup(me);
  }

  @AllowIncompleteSetup()
  @Post('2fa/enable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm with a code; returns one-time recovery codes (shown once)' })
  enable(@CurrentStaff() me: StaffPrincipal, @Body() dto: CodeDto, @Req() req: Request) {
    return this.auth.enableTotp(me, dto.code, req);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  disable(@CurrentStaff() me: StaffPrincipal, @Body() dto: DisableTotpDto, @Req() req: Request) {
    return this.auth.disableTotp(me, dto.password, dto.code, req);
  }

  @Post('2fa/recovery-codes')
  @HttpCode(200)
  recovery(@CurrentStaff() me: StaffPrincipal, @Body() dto: CodeDto, @Req() req: Request) {
    return this.auth.regenerateRecoveryCodes(me, dto.code, req);
  }

  @AllowIncompleteSetup()
  @Get('sessions')
  sessions(@CurrentStaff() me: StaffPrincipal) {
    return this.tokens.list(me.id);
  }

  @AllowIncompleteSetup()
  @Delete('sessions/:id')
  @Audit('auth.session_revoked', { target: 'staff_session' })
  async revokeSession(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string) {
    await this.tokens.revokeSession(me.id, id);
    return OK;
  }
}
