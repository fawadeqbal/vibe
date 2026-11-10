import type { UserRole } from '@prisma/client';

/** What the access token carries and what handlers receive as the caller. */
export interface AuthUser {
  id: string;
  role: UserRole;
  sessionId: string;
  /** The sign-in this token belongs to (one per device; Settings → Devices). Missing on tokens from before. */
  family?: string;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  sid: string;
  /** Session family = one sign-in on one device (survives refreshes). */
  fam?: string;
}
