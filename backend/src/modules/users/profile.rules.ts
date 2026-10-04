import type { User } from '@prisma/client';

/** "Photo, bio and 3 interests" unlocks the profile bonus and the inviter's reward. */
export const isProfileComplete = (u: Pick<User, 'avatarUrl' | 'bio' | 'interests'>): boolean =>
  u.avatarUrl.trim().length > 0 && u.bio.trim().length > 0 && u.interests.length >= 3;

/** Enough to be matched: a name and an adult age. */
export const isProfileReady = (u: Pick<User, 'name' | 'age'>): boolean => u.name.trim().length >= 2 && (u.age ?? 0) >= 18;

export const PROFILE_COMPLETED = 'user.profile-completed';
export interface ProfileCompletedEvent {
  userId: string;
}
