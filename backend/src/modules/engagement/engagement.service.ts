import { Injectable } from '@nestjs/common';

import { Clock } from '../../common/utils/clock';
import { EconomyService } from '../catalog/economy.service';
import { vibeHourWindow, VibeHourWindow } from './vibe-hour';

export interface VibeHourView {
  active: boolean;
  /** Current window if active, else the next one (null when Vibe Hour is off). */
  startsAt: string | null;
  endsAt: string | null;
}

/**
 * Vibe Hour: a daily window (economy rules `vibeHourStart`, `vibeHourMinutes`)
 * with free filters, double XP and optional bonus gems on gifts. Pure
 * clock + rules, so every instance agrees without coordination.
 */
@Injectable()
export class EngagementService {
  constructor(
    private readonly clock: Clock,
    private readonly economy: EconomyService,
  ) {}

  window(now: Date = this.clock.now()): VibeHourWindow {
    const r = this.economy.rules;
    return vibeHourWindow(now.getTime(), this.clock.offsetMinutes, r.vibeHourStart, r.vibeHourMinutes);
  }

  vibeHour(now: Date = this.clock.now()): VibeHourView {
    const w = this.window(now);
    return { active: w.active, startsAt: w.startsAt?.toISOString() ?? null, endsAt: w.endsAt?.toISOString() ?? null };
  }

  isVibeHour(now: Date = this.clock.now()): boolean {
    return this.window(now).active;
  }

  /** Extra gems the house adds to a gift right now (0 outside Vibe Hour). */
  bonusGems(gems: number, now: Date = this.clock.now()): number {
    const pct = this.economy.rules.vibeHourGemBonusPercent;
    if (pct <= 0 || gems <= 0 || !this.isVibeHour(now)) return 0;
    return Math.round((gems * pct) / 100);
  }
}
