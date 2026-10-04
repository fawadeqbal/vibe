import type { Gender, User, Wallet } from '@prisma/client';

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
}

/** Your own profile, with account state. */
export interface MeProfile extends PublicProfile {
  email: string | null;
  /** Newsletters and announcements by e-mail. */
  marketingEmails: boolean;
  role: User['role'];
  matches: number;
  likes: number;
  inviteCode: string;
  onboarded: boolean;
  profileReady: boolean;
  profileComplete: boolean;
  bannedUntil: string | null;
  createdAt: string;
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
    inviteCode: u.inviteCode,
    onboarded: !!u.onboardedAt,
    profileReady: isProfileReady(u),
    profileComplete: isProfileComplete(u),
    bannedUntil: u.bannedUntil && u.bannedUntil > now ? u.bannedUntil.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Fields joined everywhere a public profile is rendered. */
export const PROFILE_INCLUDE = { wallet: { select: { vipUntil: true } } } as const;
