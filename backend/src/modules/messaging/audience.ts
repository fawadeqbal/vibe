import { CampaignAudience, Gender, Prisma, UserStatus } from '@prisma/client';

/** Who a message goes to, as staff describe it. */
export interface Segment {
  vip?: boolean;
  countries?: string[];
  gender?: Gender;
  verified?: boolean;
  /** Seen in the app in the last N days. */
  activeWithinDays?: number;
  /** Joined on or after / before (ISO dates). */
  joinedAfter?: string;
  joinedBefore?: string;
}

export interface AudienceSpec {
  audience: CampaignAudience;
  userIds?: string[];
  segment?: Segment | null;
}

/**
 * The people a message reaches: active, real (not dev bots), not currently
 * banned, narrowed by the audience. One function so the count staff see,
 * the preview and the sender always agree.
 */
export function audienceWhere(spec: AudienceSpec, now: Date): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { status: UserStatus.ACTIVE, isBot: false, OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] };
  if (spec.audience === CampaignAudience.USERS) return { ...base, id: { in: spec.userIds ?? [] } };
  if (spec.audience === CampaignAudience.ALL) return base;
  const s = spec.segment ?? {};
  const and: Prisma.UserWhereInput[] = [];
  if (s.vip !== undefined) and.push(s.vip ? { wallet: { vipUntil: { gt: now } } } : { wallet: { OR: [{ vipUntil: null }, { vipUntil: { lte: now } }] } });
  if (s.countries?.length) and.push({ countryCode: { in: s.countries } });
  if (s.gender) and.push({ gender: s.gender });
  if (s.verified !== undefined) and.push({ verified: s.verified });
  if (s.activeWithinDays) and.push({ lastSeenAt: { gte: new Date(now.getTime() - s.activeWithinDays * 86_400_000) } });
  if (s.joinedAfter) and.push({ createdAt: { gte: new Date(s.joinedAfter) } });
  if (s.joinedBefore) and.push({ createdAt: { lt: new Date(s.joinedBefore) } });
  return { ...base, AND: and };
}

/** Who among them can get it by e-mail (have an address, and haven't opted out unless it's important). */
export function emailableWhere(important: boolean): Prisma.UserWhereInput {
  return { email: { not: null }, ...(important ? {} : { marketingEmails: true }) };
}
