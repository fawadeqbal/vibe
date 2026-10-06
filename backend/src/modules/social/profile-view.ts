import type { PublicProfile } from '../users/user.mapper';
import type { FollowState } from './follows.service';
import type { FriendState } from './friends.service';

export type ProfileTier = 'self' | 'matched' | 'following' | 'friends';

export interface Relationship {
  follow: FollowState;
  followsYou: boolean;
  friend: FriendState | 'none';
}

export interface ProfileCounts {
  followers: number;
  following: number;
}

export interface ProfileStats {
  matches: number;
  likes: number;
  gifts: number;
}

/** Someone's profile as the viewer may see it. Optional parts are left out, not nulled. */
export interface ProfileView {
  profile: PublicProfile;
  tier: ProfileTier;
  /** Same as profile.level; at every tier. */
  level: number;
  /** Earned badge ids (users/badges.ts), at every tier. */
  badges: string[];
  rel: Relationship;
  counts?: ProfileCounts;
  stats?: ProfileStats | 'hidden';
  online?: boolean;
}

/** Everything the rules need to decide; gathered by ProfilesService. */
export interface ProfileFacts {
  self: boolean;
  met: boolean;
  rel: Relationship;
  hideStats: boolean;
  online: boolean;
  counts: ProfileCounts;
  stats: ProfileStats;
  /** Earned badge ids. */
  badges: string[];
}

export const NO_RELATIONSHIP: Relationship = { follow: 'none', followsYou: false, friend: 'none' };

/** Friends beat following beats matched. Null = may not see this profile at all. */
export function resolveTier(f: Pick<ProfileFacts, 'self' | 'met' | 'rel'>): ProfileTier | null {
  if (f.self) return 'self';
  if (f.rel.friend === 'friends') return 'friends';
  if (f.rel.follow === 'following') return 'following';
  return f.met ? 'matched' : null;
}

/**
 * The profile opens up as the relationship grows: matched → public profile;
 * following → + counts and stats; friends → + online. Bio and interests are
 * public because the live-match card already shows them.
 */
export function buildProfileView(profile: PublicProfile, f: ProfileFacts): ProfileView | null {
  const tier = resolveTier(f);
  if (!tier) return null;
  const view: ProfileView = { profile, tier, level: profile.level, badges: f.badges, rel: f.rel };
  if (tier === 'matched') return view;
  view.counts = f.counts;
  view.stats = f.hideStats && tier !== 'self' ? 'hidden' : f.stats;
  if (tier === 'friends') view.online = f.online;
  return view;
}
