import type { User } from '@prisma/client';

/** "Photo, bio and 3 interests" unlocks the profile bonus. */
export const isProfileComplete = (u: Pick<User, 'avatarUrl' | 'bio' | 'interests'>): boolean =>
  u.avatarUrl.trim().length > 0 && u.bio.trim().length > 0 && u.interests.length >= 3;

/** Enough to be matched: a name and an adult age. */
export const isProfileReady = (u: Pick<User, 'name' | 'age'>): boolean => u.name.trim().length >= 2 && (u.age ?? 0) >= 18;

export const PROFILE_COMPLETED = 'user.profile-completed';
export interface ProfileCompletedEvent {
  userId: string;
}

/** Emitted (awaited) when an account switches from private to public; waiting follow requests get accepted. */
export const PRIVACY_OPENED = 'user.privacy-opened';
export interface PrivacyOpenedEvent {
  userId: string;
}

/** Emitted (awaited) right after a new account is created, with how they arrived (referrals attribute it). */
export const USER_SIGNED_UP = 'user.signed-up';
export interface UserSignedUpEvent {
  userId: string;
  inviteCode?: string;
  /** `s=` channel of the share link (tiktok, whatsapp…). */
  inviteSource?: string;
  /** How the code was captured: link | install | web. */
  inviteVia?: string;
  deviceHash?: string | null;
  ip?: string;
}

/** Emitted when a person passes selfie verification (automatic or staff). */
export const USER_VERIFIED = 'user.verified';
export interface UserVerifiedEvent {
  userId: string;
}

/** Emitted the first time someone finishes profile setup (POST /me/onboarding/complete). */
export const USER_ONBOARDED = 'user.onboarded';
export interface UserOnboardedEvent {
  userId: string;
}
