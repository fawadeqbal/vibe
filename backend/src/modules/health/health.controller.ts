import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { SkipMaintenance } from '../settings/maintenance.guard';

@ApiTags('health')
@Public()
@SkipThrottle()
@SkipMaintenance()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: the process is up. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies answer. Load balancers route only to ready instances. */
  @Get('ready')
  async ready() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.client.ping().then((r) => r === 'PONG').catch(() => false),
    ]);
    const body = { status: db && redis ? 'ok' : 'degraded', db, redis };
    if (!db || !redis) throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
