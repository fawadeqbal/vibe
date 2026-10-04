import type { UserRole } from '@prisma/client';

/** What the access token carries and what handlers receive as the caller. */
export interface AuthUser {
  id: string;
  role: UserRole;
  sessionId: string;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  sid: string;
}
