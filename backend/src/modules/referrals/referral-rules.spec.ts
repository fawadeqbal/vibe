import { DEFAULT_RULES } from '../catalog/economy';
import {
  activationSteps,
  addMonths,
  affiliateFlags,
  balanceOf,
  fraudReason,
  hasSevereFlag,
  inviteLink,
  isQualified,
  milestonesReached,
  milestoneTrack,
  normalizeChannel,
  normalizeCode,
  partnerCodeProblem,
  payoutAllowed,
  revShare,
  sourceOf,
  termsOf,
  toPkr,
  withinCommissionWindow,
} from './referral-rules';

describe('codes and links', () => {
  it('normalizes codes to upper case and rejects anything else', () => {
    expect(normalizeCode(' k7p2qxm ')).toBe('K7P2QXM');
    expect(normalizeCode('ali_vlogs')).toBe('ALI_VLOGS');
    expect(normalizeCode('ab')).toBeNull();
    expect(normalizeCode('a'.repeat(21))).toBeNull();
    expect(normalizeCode('ali-vlogs')).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });

  it('channels are lower-case [a-z0-9_-]{1,24}', () => {
    expect(normalizeChannel('TikTok')).toBe('tiktok');
    expect(normalizeChannel('yt_shorts-2')).toBe('yt_shorts-2');
    expect(normalizeChannel('a b')).toBeNull();
    expect(normalizeChannel('x'.repeat(25))).toBeNull();
    expect(normalizeChannel('')).toBeNull();
  });

  it('partner codes: format and reserved words', () => {
    expect(partnerCodeProblem('ALI')).toBeNull();
    expect(partnerCodeProblem('vibe')).toBe('reserved');
    expect(partnerCodeProblem('no spaces')).toBe('invalid');
  });

  it('builds share links with an optional channel', () => {
    expect(inviteLink('https://vibe.fawadiqbal.dev/i/', 'ALI')).toBe('https://vibe.fawadiqbal.dev/i/ALI');
    expect(inviteLink('https://vibe.fawadiqbal.dev/i', 'ALI', 'TikTok')).toBe('https://vibe.fawadiqbal.dev/i/ALI?s=tiktok');
    expect(inviteLink('https://vibe.fawadiqbal.dev/i', 'ALI', 'bad channel!')).toBe('https://vibe.fawadiqbal.dev/i/ALI');
  });

  it('source defaults to link', () => {
    expect(sourceOf('install')).toBe('install');
    expect(sourceOf('web')).toBe('web');
    expect(sourceOf(undefined)).toBe('link');
    expect(sourceOf('nonsense')).toBe('link');
  });
});

describe('fraud checks', () => {
  const base = { inviteeIsBot: false, inviteeDevice: 'd1', inviterDevice: 'd0', sameDeviceRecent: 0 };
  it('passes normal sign-ups', () => {
    expect(fraudReason(base)).toBeNull();
    expect(fraudReason({ ...base, inviteeDevice: null, inviterDevice: null, sameDeviceRecent: 10 })).toBeNull();
  });
  it('rejects the inviter’s own device', () => {
    expect(fraudReason({ ...base, inviteeDevice: 'd0' })).toBe('same_device');
  });
  it('rejects the third referred sign-up from one device in 30 days', () => {
    expect(fraudReason({ ...base, sameDeviceRecent: 1 })).toBeNull();
    expect(fraudReason({ ...base, sameDeviceRecent: 2 })).toBe('same_device');
  });
  it('rejects bots', () => {
    expect(fraudReason({ ...base, inviteeIsBot: true })).toBe('bot');
  });
});

describe('activation', () => {
  const r = { referralActivationCalls: 3, referralRequireVerified: 1 };
  const u = { verified: true, goodCallsCount: 3, active: true, banned: false };
  it('needs verification (when required), enough calls, an active unbanned account', () => {
    expect(isQualified(u, r)).toBe(true);
    expect(isQualified({ ...u, verified: false }, r)).toBe(false);
    expect(isQualified({ ...u, verified: false }, { ...r, referralRequireVerified: 0 })).toBe(true);
    expect(isQualified({ ...u, goodCallsCount: 2 }, r)).toBe(false);
    expect(isQualified({ ...u, banned: true }, r)).toBe(false);
    expect(isQualified({ ...u, active: false }, r)).toBe(false);
    expect(isQualified({ ...u, verified: false, goodCallsCount: 0 }, { referralActivationCalls: 0, referralRequireVerified: 0 })).toBe(true);
  });
  it('steps cap calls at what is needed', () => {
    expect(activationSteps({ verified: false, goodCallsCount: 7 }, r)).toEqual({ verified: false, verifyNeeded: true, calls: 3, callsNeeded: 3 });
  });
});

describe('milestones', () => {
  it('reaches each milestone once its count is met, skipping empty rewards', () => {
    expect(milestonesReached(DEFAULT_RULES, 2)).toEqual([]);
    expect(milestonesReached(DEFAULT_RULES, 3).map((m) => m.index)).toEqual([1]);
    expect(milestonesReached(DEFAULT_RULES, 26).map((m) => [m.index, m.reward.kind, m.reward.amount])).toEqual([
      [1, 'vip', 7],
      [2, 'vip', 30],
      [3, 'coins', 1000],
    ]);
    expect(milestonesReached({ ...DEFAULT_RULES, referralMilestone1VipDays: 0 }, 3)).toEqual([]);
  });
  it('track shows reached and the next target', () => {
    const t = milestoneTrack(DEFAULT_RULES, 4);
    expect(t.milestones.map((m) => [m.count, m.reached])).toEqual([
      [3, true],
      [10, false],
      [25, false],
    ]);
    expect(t.next).toEqual({ count: 10, remaining: 6 });
    expect(milestoneTrack(DEFAULT_RULES, 25).next).toBeNull();
  });
});

describe('commissions', () => {
  it('takes the store fee off Play / App Store purchases only, then the share (whole cents, down)', () => {
    expect(revShare({ usdCents: 999, method: 'GOOGLE_PLAY' }, 20, 15)).toEqual({ baseUsdCents: 849, usdCents: 169 });
    expect(revShare({ usdCents: 999, method: 'APP_STORE' }, 20, 15)).toEqual({ baseUsdCents: 849, usdCents: 169 });
    expect(revShare({ usdCents: 999, method: 'JAZZCASH' }, 20, 15)).toEqual({ baseUsdCents: 999, usdCents: 199 });
    expect(revShare({ usdCents: 99, method: 'CARD' }, 0, 15)).toEqual({ baseUsdCents: 99, usdCents: 0 });
  });

  it('only purchases within N calendar months of sign-up earn', () => {
    const signup = new Date('2026-01-31T10:00:00Z');
    expect(addMonths(signup, 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(signup, 6).toISOString()).toBe('2026-07-31T10:00:00.000Z');
    expect(withinCommissionWindow(signup, new Date('2026-07-31T09:59:59Z'), 6)).toBe(true);
    expect(withinCommissionWindow(signup, new Date('2026-07-31T10:00:00Z'), 6)).toBe(false);
    expect(withinCommissionWindow(signup, new Date('2026-01-30T00:00:00Z'), 6)).toBe(false);
  });

  it('partner terms override the defaults', () => {
    expect(termsOf({ revSharePercent: null, cpaUsdCents: null }, DEFAULT_RULES)).toEqual({ revSharePercent: 20, cpaUsdCents: 10 });
    expect(termsOf({ revSharePercent: 35, cpaUsdCents: 0 }, DEFAULT_RULES)).toEqual({ revSharePercent: 35, cpaUsdCents: 0 });
  });
});

describe('payout balance', () => {
  it('sums pending (incl. held), available (net of refund adjustments) and paid', () => {
    const b = balanceOf([
      { status: 'PENDING', usdCents: 100 },
      { status: 'HELD', usdCents: 50 },
      { status: 'AVAILABLE', usdCents: 900 },
      { status: 'AVAILABLE', usdCents: -200 },
      { status: 'PAID', usdCents: 300 },
      { status: 'REVERSED', usdCents: 999 },
    ]);
    expect(b).toEqual({ pendingUsdCents: 150, availableUsdCents: 700, paidUsdCents: 300 });
  });
  it('needs at least the minimum and a positive balance', () => {
    expect(payoutAllowed(999, 1000)).toBe(false);
    expect(payoutAllowed(1000, 1000)).toBe(true);
    expect(payoutAllowed(0, 0)).toBe(false);
    expect(payoutAllowed(-5, 0)).toBe(false);
  });
  it('converts to whole rupees', () => {
    expect(toPkr(1234, 280)).toBe(3455);
  });
});

describe('partner fraud flags', () => {
  const clean = { matureUsers: 20, idleUsers: 2, deviceClusters: 0, purchases: 10, refunds: 0, clicks: 500, signups: 20 };
  it('no flags for a healthy partner or small samples', () => {
    expect(affiliateFlags(clean)).toEqual([]);
    expect(affiliateFlags({ ...clean, matureUsers: 4, idleUsers: 4, purchases: 2, refunds: 2, signups: 9, clicks: 0 })).toEqual([]);
  });
  it('flags idle users, device clusters, refunds and click anomalies', () => {
    const f = affiliateFlags({ matureUsers: 20, idleUsers: 19, deviceClusters: 2, purchases: 10, refunds: 5, clicks: 5, signups: 20 });
    expect(f.map((x) => [x.key, x.level])).toEqual([
      ['idle_users', 'severe'],
      ['device_clusters', 'severe'],
      ['refunds', 'severe'],
      ['click_ratio', 'warn'],
    ]);
    expect(hasSevereFlag(f)).toBe(true);
    const warn = affiliateFlags({ ...clean, idleUsers: 15, deviceClusters: 1, refunds: 3 });
    expect(warn.map((x) => x.level)).toEqual(['warn', 'warn', 'warn']);
    expect(hasSevereFlag(warn)).toBe(false);
  });
});
