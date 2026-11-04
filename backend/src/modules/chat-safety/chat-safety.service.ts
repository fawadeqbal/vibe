import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { completesNumber, fragmentDigits, MASK, maskContacts, type HiddenKind } from './contact-mask';

export type ChatPlace = 'match' | 'chat';

export interface Screened {
  /** What to send and store. */
  text: string;
  /** Contact details were hidden: tell the sender (it's shown under their message). */
  hidden: boolean;
}

/** Fragments of a number sent a few digits at a time are remembered this long. */
const FRAGMENT_TTL_S = 120;

/**
 * Keeps contact details out of chat: phone numbers, chat-app and social
 * handles or links, and e-mails become "****" (CONTACT_FILTER=mask), or are
 * only recorded (log) while checking for false alarms. Every hidden message
 * is kept 30 days as a ContactFlag so moderators can see who keeps trying.
 *
 * Random calls are always screened (strangers, and any link too). Friend
 * chats for the first CONTACT_FILTER_FRIEND_DAYS days of the friendship.
 */
@Injectable()
export class ChatSafetyService {
  private readonly log = new Logger(ChatSafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /** Friends since `since`: still screened? */
  screensFriends(since: Date): boolean {
    const days = this.config.get('CONTACT_FILTER_FRIEND_DAYS');
    return days > 0 && this.clock.now().getTime() - since.getTime() < days * MS.day;
  }

  async screen(input: { userId: string; place: ChatPlace; refId: string; text: string }): Promise<Screened> {
    const mode = this.config.get('CONTACT_FILTER');
    if (mode === 'off') return { text: input.text, hidden: false };

    let r = maskContacts(input.text, { links: input.place === 'match' });
    const kinds = new Set<HiddenKind>(r.hidden);

    // A number sent a few digits at a time: "0300", then "1234567".
    const key = `cs:frag:${input.place}:${input.refId}:${input.userId}`;
    const frag = fragmentDigits(input.text);
    if (!kinds.size && frag) {
      const before = (await this.redis.client.get(key)) ?? '';
      if (completesNumber(before, frag)) {
        r = { text: MASK, hidden: ['phone'] };
        kinds.add('phone');
        await this.redis.client.del(key);
      } else {
        await this.redis.client.set(key, (before + frag).slice(-20), 'EX', FRAGMENT_TTL_S);
      }
    } else if (kinds.size) {
      await this.redis.client.del(key);
    }

    if (!kinds.size) return { text: input.text, hidden: false };
    await this.prisma.contactFlag
      .create({
        data: { userId: input.userId, place: input.place, refId: input.refId, original: input.text.slice(0, 1000), sent: (mode === 'mask' ? r.text : input.text).slice(0, 1000), kinds: [...kinds] },
      })
      .catch((e: Error) => this.log.warn(`contact flag not saved: ${e.message}`));
    return mode === 'mask' ? { text: r.text, hidden: true } : { text: input.text, hidden: false };
  }

  /** Hidden messages are kept 30 days. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanup(): Promise<void> {
    await this.prisma.contactFlag.deleteMany({ where: { createdAt: { lt: new Date(this.clock.now().getTime() - 30 * MS.day) } } });
  }
}
