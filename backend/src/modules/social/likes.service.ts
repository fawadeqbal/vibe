import { Injectable } from '@nestjs/common';

import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PROFILE_INCLUDE, toPublicProfile } from '../users/user.mapper';
import { WalletService } from '../wallet/wallet.service';
import { BlocksService } from './blocks.service';

/**
 * "Who liked you" this week. VIP sees who; everyone else sees how many and
 * a few faces to blur (no names or ids).
 */
@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly blocks: BlocksService,
    private readonly clock: Clock,
  ) {}

  async received(me: string) {
    const since = new Date(this.clock.now().getTime() - 7 * MS.day);
    const likes = await this.prisma.matchLike.findMany({ where: { toId: me, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, distinct: ['fromId'], take: 100 });
    const excluded = await this.blocks.excluded(me);
    const ids = likes.map((l) => l.fromId).filter((id) => !excluded.has(id));
    const users = await this.prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: PROFILE_INCLUDE });
    const order = new Map(ids.map((id, i) => [id, i]));
    users.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    const vip = await this.wallet.isVip(me);
    return {
      count: users.length,
      unlocked: vip,
      people: vip ? users.map((u) => toPublicProfile(u, this.clock.now())) : [],
      previews: users.slice(0, 4).map((u) => u.avatarUrl).filter(Boolean),
    };
  }
}
