import type { Gender } from '@prisma/client';

export type WantedGender = 'ANYONE' | 'WOMEN' | 'MEN';

export interface MatchPrefs {
  gender: WantedGender;
  countryCode: string | null;
  safeMode: boolean;
  autoBlur: boolean;
}

/** A person waiting in the queue: who they are and who they want to meet. */
export interface Ticket {
  userId: string;
  gender: Gender;
  countryCode: string;
  verified: boolean;
  prefs: MatchPrefs;
  /** Coins this match will cost them (0 for VIP / no paid filters). */
  cost: number;
  vip: boolean;
  boosted: boolean;
  enqueuedAt: number;
  /** People they must not meet: blocks both ways and the last partner. */
  exclude: string[];
}

export interface ActiveMatch {
  id: string;
  a: string;
  b: string;
  startedAt: number;
}

/** Why a match ended, from the point of view of the person told about it. */
export type EndedReason = 'skipped' | 'partner_left' | 'stopped' | 'reported' | 'blocked' | 'disconnected' | 'banned';
