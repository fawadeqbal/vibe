import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthProvider } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AppConfig } from '../../config/app-config.service';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OK } from '../../common/dto/ok.dto';
import { AuthService } from './auth.service';
import { InviteFields, LinkIdentityDto, RefreshDto, RequestOtpDto, SocialProviderName, SocialSignInDto, VerifyOtpDto } from './dto/auth.dto';
import { IdentityService } from './identity/identity.service';
import { ClientInfo } from './token.service';

const client = (req: Request): ClientInfo => ({ userAgent: req.headers['user-agent'], ip: req.ip });
const toProvider = (p: SocialProviderName): AuthProvider => p.toUpperCase() as AuthProvider;
const invite = (dto: InviteFields) => ({ inviteCode: dto.inviteCode, inviteSource: dto.inviteSource, inviteVia: dto.inviteVia, deviceId: dto.deviceId });
const credential = (dto: SocialSignInDto | LinkIdentityDto) => ({ idToken: dto.idToken, accessToken: dto.accessToken, authorizationCode: dto.authorizationCode, nonce: dto.nonce, name: dto.name });

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly identities: IdentityService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Sign in with Apple on Android uses Apple's web flow: Apple form-POSTs the
   * result here (set this URL as the Services ID return URL and as the app's
   * APPLE_REDIRECT_URI), and we hand it back to the app through an Android
   * intent link that sign_in_with_apple listens for. Nothing is verified
   * here — the app sends the tokens to POST /auth/social as usual.
   */
  @Post('apple/callback')
  @ApiOperation({ summary: 'Sign in with Apple (Android web flow) return URL' })
  appleCallback(@Body() body: Record<string, string>, @Res() res: Response) {
    const params = new URLSearchParams();
    for (const k of ['code', 'id_token', 'state', 'user', 'error']) if (typeof body?.[k] === 'string') params.set(k, body[k]);
    const pkg = this.config.get('ANDROID_PACKAGE_NAME');
    return res.redirect(HttpStatus.SEE_OTHER, `intent://callback?${params.toString()}#Intent;package=${pkg};scheme=signinwithapple;end`);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Social sign-in buttons to show (providers that are live or in dev mode)' })
  providers() {
    return { providers: this.identities.available().map((p) => p.toLowerCase()) };
  }

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
    return this.auth.verifyOtp(dto.email, dto.code, invite(dto), client(req));
  }

  @Post('social')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with Google, Apple or Facebook' })
  social(@Body() dto: SocialSignInDto, @Req() req: Request) {
    return this.auth.socialSignIn(toProvider(dto.provider), credential(dto), invite(dto), client(req));
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

/** Sign-in methods on the signed-in account: list, link another provider, unlink. */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me/identities')
export class IdentitiesController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.auth.listIdentities(userId);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Link Google / Apple / Facebook to this account' })
  link(@CurrentUser('id') userId: string, @Body() dto: LinkIdentityDto) {
    return this.auth.linkIdentity(userId, toProvider(dto.provider), credential(dto));
  }

  @Delete(':provider')
  @ApiOperation({ summary: 'Unlink a provider (one sign-in method must remain)' })
  unlink(@CurrentUser('id') userId: string, @Param('provider', new ParseEnumPipe(['google', 'apple', 'facebook'])) provider: SocialProviderName) {
    return this.auth.unlinkIdentity(userId, toProvider(provider));
  }
}
