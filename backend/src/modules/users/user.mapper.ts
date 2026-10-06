import type { Gender, User, Wallet } from '@prisma/client';

import { levelOf } from './levels';
import { isProfileComplete, isProfileReady } from './profile.rules';

export type GenderView = 'male' | 'female' | 'other';
export const genderView = (g: Gender): GenderView => g.toLowerCase() as GenderView;

/** What anyone may see about a person (match partner, friend). */
export interface PublicProfile {
  id: string;
  name: string;
  age: number | null;
  gender: GenderView;
  countryCode: string;
  avatarUrl: string;
  bio: string;
  interests: string[];
  verified: boolean;
  vip: boolean;
  /** From XP (users/levels.ts); shown as a "Lv 7" chip. */
  level: number;
}

/** Your own profile, with account state. */
export interface MeProfile extends PublicProfile {
  email: string | null;
  /** Newsletters and announcements by e-mail. */
  marketingEmails: boolean;
  role: User['role'];
  matches: number;
  likes: number;
  followers: number;
  following: number;
  /** Follows need approval. */
  privateAccount: boolean;
  /** Stats are hidden from other people. */
  hideStats: boolean;
  inviteCode: string;
  onboarded: boolean;
  profileReady: boolean;
  profileComplete: boolean;
  bannedUntil: string | null;
  createdAt: string;
  xp: number;
  /** Gems the wallet goal card counts toward (null = none). */
  gemGoal: number | null;
  /** Minutes after midnight in `tzOffsetMinutes`; quiet hours are on when both are set. */
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  tzOffsetMinutes: number;
  /** 30 / 60 / 90 / 120, or null when off. */
  breakReminderMinutes: number | null;
}

type WithWallet = User & { wallet?: Pick<Wallet, 'vipUntil'> | null };

const vipNow = (u: WithWallet, now: Date) => !!u.wallet?.vipUntil && u.wallet.vipUntil > now;

export function toPublicProfile(u: WithWallet, now: Date = new Date()): PublicProfile {
  return {
    id: u.id,
    name: u.name,
    age: u.age,
    gender: genderView(u.gender),
    countryCode: u.countryCode,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    interests: u.interests,
    verified: u.verified,
    vip: vipNow(u, now),
    level: levelOf(u.xp),
  };
}

export function toMeProfile(u: WithWallet, now: Date = new Date()): MeProfile {
  return {
    ...toPublicProfile(u, now),
    email: u.email,
    marketingEmails: u.marketingEmails,
    role: u.role,
    matches: u.matchesCount,
    likes: u.likesCount,
    followers: u.followersCount,
    following: u.followingCount,
    privateAccount: u.privateAccount,
    hideStats: u.hideStats,
    inviteCode: u.inviteCode,
    onboarded: !!u.onboardedAt,
    profileReady: isProfileReady(u),
    profileComplete: isProfileComplete(u),
    bannedUntil: u.bannedUntil && u.bannedUntil > now ? u.bannedUntil.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    xp: u.xp,
    gemGoal: u.gemGoal,
    quietHoursStart: u.quietHoursStart,
    quietHoursEnd: u.quietHoursEnd,
    tzOffsetMinutes: u.tzOffsetMinutes,
    breakReminderMinutes: u.breakReminderMinutes,
  };
}

/** Fields joined everywhere a public profile is rendered. */
export const PROFILE_INCLUDE = { wallet: { select: { vipUntil: true } } } as const;
