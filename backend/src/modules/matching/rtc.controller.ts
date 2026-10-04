import { Controller, Get, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { hmacSha1Base64 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { MatchingService } from './matching.service';

@ApiTags('match')
@ApiBearerAuth()
@Controller()
export class RtcController implements OnApplicationBootstrap {
  private readonly logger = new Logger(RtcController.name);

  constructor(
    private readonly config: AppConfig,
    private readonly matching: MatchingService,
  ) {}

  onApplicationBootstrap(): void {
    const turn = this.config.list('TURN_URLS');
    if (turn.length) this.logger.log(`TURN relay on: ${turn.join(', ')}`);
    else if (this.config.isProduction) this.logger.warn('TURN is not configured (TURN_URLS/TURN_SECRET): many calls between different networks will fail. See turn/README.md');
  }

  /**
   * STUN + short-lived TURN credentials (coturn "REST API" scheme:
   * username = expiry:userId, credential = base64(hmac-sha1(secret, username))).
   */
  @Get('rtc/ice-servers')
  @ApiOperation({ summary: 'ICE servers for the WebRTC peer connection' })
  iceServers(@CurrentUser('id') userId: string) {
    const servers: { urls: string[]; username?: string; credential?: string }[] = [{ urls: this.config.list('STUN_URLS') }];
    const turn = this.config.list('TURN_URLS');
    const secret = this.config.get('TURN_SECRET');
    if (turn.length && secret) {
      const ttl = this.config.get('TURN_TTL_SECONDS');
      const username = `${Math.floor(Date.now() / 1000) + ttl}:${userId}`;
      servers.push({ urls: turn, username, credential: hmacSha1Base64(secret, username) });
    }
    return { iceServers: servers, ttlSeconds: this.config.get('TURN_TTL_SECONDS') };
  }

  @Public()
  @Get('match/online')
  @ApiOperation({ summary: 'How many people are online / searching right now' })
  online() {
    return this.matching.onlineCount();
  }
}
