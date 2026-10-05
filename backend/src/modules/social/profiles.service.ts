import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { PROFILE_INCLUDE, toPublicProfile } from '../users/user.mapper';
import { BlocksService } from './blocks.service';
import { FollowsService } from './follows.service';
import { FriendsService } from './friends.service';
import { haveMet } from './met';
import { buildProfileView, NO_RELATIONSHIP, ProfileView, Relationship } from './profile-view';

/** Gathers the facts about you and them, then lets `buildProfileView` decide. */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly friends: FriendsService,
    private readonly follows: FollowsService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  async view(me: string, id: string): Promise<ProfileView> {
    const self = me === id;
    if (!self && (await this.blocks.eitherBlocked(me, id))) throw AppError.notFound('User');
    const u = await this.prisma.user.findUnique({ where: { id }, include: PROFILE_INCLUDE });
    if (!u || u.status !== UserStatus.ACTIVE) throw AppError.notFound('User');

    let rel: Relationship = NO_RELATIONSHIP;
    let met = true;
    let online = false;
    if (!self) {
      const [friend, follow, back, m, on] = await Promise.all([this.friends.state(me, id), this.follows.state(me, id), this.follows.state(id, me), haveMet(this.prisma, me, id), this.realtime.isOnline(id)]);
      rel = { friend, follow, followsYou: back === 'following' };
      met = m;
      online = on;
    }

    const view = buildProfileView(toPublicProfile(u, this.clock.now()), {
      self,
      met,
      rel,
      online,
      hideStats: u.hideStats,
      counts: { followers: u.followersCount, following: u.followingCount },
      stats: { matches: u.matchesCount, likes: u.likesCount, gifts: u.giftsReceivedCount },
    });
    if (!view) throw AppError.notFound('User');
    return view;
  }
}
