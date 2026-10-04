import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { OK } from '../../common/dto/ok.dto';
import { AuthService } from './auth.service';
import { RefreshDto, RequestOtpDto, SocialSignInDto, VerifyOtpDto } from './dto/auth.dto';
import { ClientInfo } from './token.service';

const client = (req: Request): ClientInfo => ({ userAgent: req.headers['user-agent'], ip: req.ip });

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'E-mail a 4-digit sign-in code' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.email);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in (or sign up) with the code' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto.email, dto.code, dto.inviteCode, client(req));
  }

  @Post('social')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with Google or Apple' })
  social(@Body() dto: SocialSignInDto, @Req() req: Request) {
    return this.auth.socialSignIn(dto.provider, dto.idToken, dto.inviteCode, client(req));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Swap a refresh token for a new pair (rotation)' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, client(req));
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return OK;
  }
}
