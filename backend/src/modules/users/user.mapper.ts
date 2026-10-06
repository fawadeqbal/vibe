import type { Gender, ReferralStatus, User, Wallet } from '@prisma/client';

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
  /** Who invited you (first name, or the creator partner's display name) and how that referral stands. */
  invitedBy: { name: string; status: ReferralStatus } | null;
  /** You can still add an invite code (POST /referrals/claim): no referral yet and the account is under 48 h old. */
  referralClaimable: boolean;
}

/** Invite codes can be added this long after sign-up. */
export const REFERRAL_CLAIM_WINDOW_MS = 48 * 3600_000;

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

type WithWallet = User & { wallet?: Pick<Wallet, 'vipUntil'> | null };
type ReferralGot = { status: ReferralStatus; inviter: { name: string } | null; affiliate: { displayName: string } | null } | null;

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

export function toMeProfile(u: WithWallet & { referralGot?: ReferralGot }, now: Date = new Date()): MeProfile {
  const ref = u.referralGot ?? null;
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
    invitedBy: ref ? { name: ref.affiliate?.displayName ?? firstName(ref.inviter?.name ?? '') ?? '', status: ref.status } : null,
    referralClaimable: !ref && now.getTime() - u.createdAt.getTime() < REFERRAL_CLAIM_WINDOW_MS,
  };
}

/** Fields joined everywhere a public profile is rendered. */
export const PROFILE_INCLUDE = { wallet: { select: { vipUntil: true } } } as const;

/** Your own profile also shows who invited you. */
export const ME_INCLUDE = { ...PROFILE_INCLUDE, referralGot: { select: { status: true, inviter: { select: { name: true } }, affiliate: { select: { displayName: true } } } } } as const;
