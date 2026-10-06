import type { Permission } from "@/lib/permissions";

/**
 * Response shapes of the admin API (/v1/admin/*), one section per area.
 * Keep in step with the backend controllers; the API's OpenAPI document at
 * /docs/openapi.json is the reference.
 */

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId?: string;
}

// ── auth & team ───────────────────────────────────────────────────────────

export interface Me {
  id: string;
  email: string;
  name: string;
  role: { id: string; key: string; name: string };
  permissions: Permission[];
  twoFactorEnabled: boolean;
  recoveryCodesLeft: number;
  mustChangePassword: boolean;
  twoFactorSetupRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type LoginResult = { status: "ok"; me: Me } | { status: "two_factor_required"; challenge: string };

export interface StaffSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  signedInAt: string;
  expiresAt: string;
}

export type StaffStatus = "ACTIVE" | "DISABLED";

export interface Staff {
  id: string;
  email: string;
  name: string;
  status: StaffStatus;
  role: { id: string; key: string; name: string };
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  sessions?: StaffSession[];
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  allPermissions: boolean;
  system: boolean;
  staffCount: number;
  updatedAt: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: Permission; label: string; description: string; sensitive?: boolean }[];
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  data: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

// ── users ─────────────────────────────────────────────────────────────────

export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface UserSummary {
  id: string;
  name: string;
  avatarUrl: string;
  age: number | null;
  gender: Gender;
  countryCode: string;
  email: string | null;
  status: "ACTIVE" | "DELETED";
  verified: boolean;
  isBot: boolean;
  bannedUntil: string | null;
  vipUntil: string | null;
  coins: number;
  gems: number;
  matchesCount: number;
  openReports: number;
  lastSeenAt: string | null;
  createdAt: string;
  online: boolean;
}

export interface UserDetail extends UserSummary {
  inCall: { matchId: string; partnerId: string; startedAt: string } | null;
  bio: string;
  interests: string[];
  signIn: { email: string | null; google: boolean; apple: boolean; facebook: boolean };
  inviteCode: string;
  invitedBy: { id: string; name: string } | null;
  onboardedAt: string | null;
  verifiedAt: string | null;
  deletedAt: string | null;
  wallet: {
    coins: number;
    gems: number;
    vipUntil: string | null;
    boostUntil: string | null;
    streakDay: number;
    lastCheckInAt: string | null;
    profileBonusClaimed: boolean;
  } | null;
  subscription: { planId: string; status: SubscriptionStatus; currentPeriodEnd: string; trialEndsAt: string | null } | null;
  counts: { matches: number; friends: number; reportsGot: number; openReports: number; reportsMade: number; blockedBy: number; invitees: number; purchases: number; likes: number };
  money: { spentUsd: number; giftsSent: number; giftsSentCoins: number; giftsReceived: number; giftsReceivedGems: number; cashedOutUsd: number };
  sessions: { id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string }[];
}

export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Verification {
  id: string;
  status: VerificationStatus;
  /** dev | manual | rekognition */
  provider: string;
  /** Face match score 0–100, when the provider gives one. */
  similarity: number | null;
  reason: string | null;
  hasSelfie: boolean;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string; age: number | null; countryCode: string };
}

export interface PersonRef {
  id: string;
  name: string;
  avatarUrl: string;
  verified?: boolean;
  isBot?: boolean;
  bannedUntil?: string | null;
  createdAt?: string;
  countryCode?: string;
}

export interface MatchRow {
  id: string;
  partner: PersonRef;
  startedAt: string;
  endedAt: string | null;
  seconds: number | null;
  endReason: string | null;
  endedByMe: boolean;
  coinsSpent: number;
  reconnect: boolean;
}

export interface StaffNote {
  id: string;
  text: string;
  author: { id: string; name: string; email: string };
  createdAt: string;
}

// ── money ─────────────────────────────────────────────────────────────────

export type LedgerKind = "PURCHASE" | "SPEND" | "EARN" | "GIFT_SENT" | "GIFT_RECEIVED" | "CASHOUT" | "CASHOUT_REVERSAL" | "VIP" | "REFUND" | "ADJUSTMENT";
export type PaymentMethod = "GOOGLE_PLAY" | "APP_STORE" | "JAZZCASH" | "EASYPAISA" | "CARD" | "BANK";
export type PurchaseStatus = "PENDING" | "REQUIRES_ACTION" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "EXPIRED";
export type CashoutStatus = "REVIEW" | "REQUESTED" | "PROCESSING" | "PAID" | "REJECTED";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "CANCELED" | "EXPIRED";

export interface LedgerEntry {
  id: string;
  userId: string;
  kind: LedgerKind;
  title: string;
  coins: number;
  gems: number;
  usdCents: number;
  method: PaymentMethod | null;
  reference: string | null;
  balanceCoins: number;
  balanceGems: number;
  createdAt: string;
  user?: PersonRef;
}

export interface Purchase {
  id: string;
  userId: string;
  productType: "COIN_PACK" | "VIP_PLAN";
  productId: string;
  method: PaymentMethod;
  usdCents: number;
  usd: number;
  status: PurchaseStatus;
  providerRef: string | null;
  nextAction: string | null;
  /** Data for the next step (redirect URL + fields, bank instructions…). */
  actionData: Record<string, unknown> | null;
  failureReason: string | null;
  /** What was actually charged: PKR for local methods, in minor units (paisa). */
  currency: string;
  amountMinor: number | null;
  /** Play purchase token / Apple original transaction id. */
  storeRef: string | null;
  /** Unfinished checkouts expire at this time. */
  expiresAt: string | null;
  lastCheckedAt?: string | null;
  checkAttempts?: number;
  refundedAt: string | null;
  metadata: { refund?: { reason: string; at: string; coinsClawedBack: number; coinsShortfall: number } } & Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
  user?: PersonRef;
  ledger?: LedgerEntry[];
}

export interface Cashout {
  id: string;
  userId: string;
  gems: number;
  usdCents: number;
  usd: number;
  method: PaymentMethod;
  /** Whole rupees, fixed at the day's rate when requested. */
  amountPkr: number | null;
  accountMasked: string;
  payoutAccountId: string | null;
  status: CashoutStatus;
  providerRef: string | null;
  /** The provider's own status for the last attempt, e.g. awaiting_bank_batch. */
  providerStatus: string | null;
  failureReason: string | null;
  batchId: string | null;
  attempts: number;
  lastCheckedAt?: string | null;
  createdAt: string;
  processedAt: string | null;
  user?: PersonRef;
}

/** One step with a payment or payout provider (oldest first). */
export interface PaymentEvent {
  id: string;
  purchaseId: string | null;
  cashoutId: string | null;
  provider: string;
  type: string;
  code: string | null;
  message: string | null;
  data: unknown;
  createdAt: string;
}

export type PayoutBatchStatus = "OPEN" | "EXPORTED" | "PAID" | "CANCELED";

export interface PayoutBatch {
  id: string;
  method: PaymentMethod;
  status: PayoutBatchStatus;
  count: number;
  totalUsdCents: number;
  totalPkr: number;
  reference: string | null;
  createdById: string;
  createdAt: string;
  exportedAt: string | null;
  paidAt: string | null;
}

export interface PayoutBatchDetail extends PayoutBatch {
  cashouts: (Omit<Cashout, "user"> & { user: { id: string; name: string } | null })[];
}

export interface PayoutWaiting {
  count: number;
  totalPkr: number;
  totalUsd: number;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  startedAt: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  user?: PersonRef;
}

export interface FinanceDay {
  day: string;
  grossUsd: number;
  netUsd: number;
  paidOutUsd: number;
  profitUsd: number;
  cumulativeProfitUsd: number;
}

/** Profit and loss for the last N business days (see FinanceService.summary). */
export interface FinanceSummary {
  days: number;
  from: string;
  grossUsd: number;
  salesCount: number;
  refundsUsd: number;
  refundsCount: number;
  feesUsd: number;
  feeRates: { store: number; wallet: number; card: number; bank: number };
  netUsd: number;
  failedCount: number;
  creatorPaidUsd: number;
  creatorPaidCount: number;
  partnerPaidUsd: number;
  partnerPaidCount: number;
  profitUsd: number;
  margin: number | null;
  earned: { creatorGems: number; creatorUsd: number; partnerUsd: number; profitUsd: number; margin: number | null };
  owed: { cashoutsUsd: number; cashoutsCount: number; gems: number; gemsUsd: number; gemsHolders: number; partnersUsd: number; partnerPayoutsRequested: number; totalUsd: number };
  byMethod: { method: PaymentMethod; usd: number; count: number; refundsUsd: number; feeRate: number; feesUsd: number; netUsd: number }[];
  byProduct: { productType: string; productId: string; usd: number; count: number }[];
  payouts: { status: CashoutStatus; usd: number; count: number }[];
  payoutsPendingUsd: number;
  payoutsPendingCount: number;
  series: FinanceDay[];
}

// ── moderation ────────────────────────────────────────────────────────────

export type ReportReason = "NUDITY" | "HARASSMENT" | "UNDERAGE" | "SPAM" | "SCAM" | "OTHER";
export type ReportStatus = "OPEN" | "ACTIONED" | "DISMISSED";

export interface Report {
  id: string;
  reason: ReportReason;
  status: ReportStatus;
  note: string | null;
  matchId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reporter: PersonRef;
  reported: PersonRef;
  reportedOpenReports?: number;
}

export interface ReportDetail extends Report {
  match: { id: string; startedAt: string; endedAt: string | null; seconds: number | null; endReason: string | null } | null;
  otherReports: { id: string; reason: ReportReason; status: ReportStatus; note: string | null; reporter: PersonRef; createdAt: string }[];
  priorActioned: number;
  messages: { id: string; senderId: string; text: string; giftId: string | null; createdAt: string }[] | null;
  canReadMessages: boolean;
}

export interface ReportedPerson {
  user: PersonRef | null;
  openReports: number;
  lastReportAt: string | null;
  reasons: Partial<Record<ReportReason, number>>;
}

export interface ReportStats {
  open: number;
  openByReason: Partial<Record<ReportReason, number>>;
  today: number;
  actioned7d: number;
  dismissed7d: number;
  avgReviewMinutes: number | null;
}

// ── dashboard & ops ───────────────────────────────────────────────────────

export interface DashboardSummary {
  generatedAt: string;
  users: { total: number; newToday: number; new7d: number; activeToday: number; active7d: number; verified: number; banned: number };
  revenue: { todayUsd: number; todayPurchases: number; last30Usd: number; last30Purchases: number; payers30: number; arppuUsd: number; vipActive: number; vipShare: number };
  gifts: { last30Count: number; last30Coins: number; last30Gems: number };
  payouts: { last30Usd: number; last30Count: number };
  liabilities: { coinsOutstanding: number; gemsOutstanding: number; gemsUsd: number };
  queues: { openReports: number; reportsToday: number; cashoutsReview: number; cashoutsStuck: number; pendingPurchases: number; partnersPending: number; partnerPayoutsOpen: number };
  growth: { referredSignups7d: number; partnerSignups7d: number; referralsRewarded7d: number };
  matches: { today: number; last7d: number; avgSeconds: number; quickSkipRate: number };
  live: { online: number; searching: number; calls: number };
}

export interface SeriesPoint {
  day: string;
  signups: number;
  revenueUsd: number;
  purchases: number;
  matches: number;
  matchers: number;
  gifts: number;
  payoutsUsd: number;
  reports: number;
}

export interface LiveState {
  at: string;
  online: number;
  searching: number;
  inCalls: number;
  calls: { id: string; startedAt: string; a: PersonRef | null; b: PersonRef | null; coinsSpent: number }[];
}

export type AnnouncementAudience = "ALL" | "VIP" | "NON_VIP";
export type AnnouncementStatus = "DRAFT" | "LIVE" | "ARCHIVED";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  status: AnnouncementStatus;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export type IntegrationKind = "payment" | "payout" | "login" | "ads" | "push" | "storage" | "kyc" | "mail";
export type IntegrationMode = "live" | "dev" | "off";

export interface IntegrationStatus {
  key: string;
  kind: IntegrationKind;
  label: string;
  mode: IntegrationMode;
  requiredEnv: string[];
  missingEnv: string[];
  endpoints?: { label: string; url: string }[];
  notes?: string[];
  docsUrl?: string;
}

export type WebhookStatus = "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";

export interface IntegrationsOverview {
  items: IntegrationStatus[];
  summary: Record<IntegrationMode, number>;
  webhooks24h: { provider: string; status: WebhookStatus; count: number }[];
}

export interface WebhookEvent {
  id: string;
  provider: string;
  eventId: string;
  eventType: string | null;
  status: WebhookStatus;
  error: string | null;
  attempts: number;
  subjectType: string | null;
  subjectId: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface WebhookEventDetail extends WebhookEvent {
  /** Redacted by the API. */
  payload: unknown;
  headers: unknown;
}

export interface Setting {
  key: string;
  group: string;
  label: string;
  description: string;
  type: "boolean" | "number" | "string";
  value: boolean | number | string;
  default: boolean | number | string;
  updatedAt: string | null;
  updatedById: string | null;
}

// ── economy ───────────────────────────────────────────────────────────────

export type RuleKind = "coins" | "count" | "seconds" | "minutes" | "hours" | "days" | "gems" | "cents" | "share" | "age" | "days7" | "clock" | "flag";
export type RuleValue = number | number[];
export type EconomyRules = Record<string, RuleValue>;

export interface RuleField {
  key: string;
  label: string;
  help?: string;
  kind: RuleKind;
  min: number;
  max: number;
  /** `cents` only: whole cents. */
  whole?: boolean;
}

export interface RuleGroup {
  key: string;
  label: string;
  description: string;
  fields: RuleField[];
}

export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  usdCents: number;
  bonusPercent: number;
  tag?: string;
  totalCoins?: number;
}

export interface VipPlan {
  id: string;
  label: string;
  days: number;
  usdCents: number;
  savePercent: number;
  trialDays: number;
  highlighted: boolean;
}

export interface GiftItem {
  id: string;
  name: string;
  emoji: string;
  coins: number;
  gems?: number;
}

export type EconomySectionKey = "rules" | "packs" | "plans" | "gifts";

export interface EconomySectionMeta {
  custom: boolean;
  updatedAt: string | null;
  updatedById: string | null;
  updatedBy: string | null;
}

export interface Economy {
  version: string;
  economy: EconomyRules;
  packs: CoinPack[];
  plans: VipPlan[];
  gifts: GiftItem[];
  defaults: { economy: EconomyRules; packs: CoinPack[]; plans: VipPlan[]; gifts: GiftItem[] };
  groups: RuleGroup[];
  sections: Record<EconomySectionKey, EconomySectionMeta>;
}


// ── messaging ─────────────────────────────────────────────────────────────

export interface MailFields {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  highlight: string;
  buttonLabel: string;
  buttonUrl: string;
  footer: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  sample: string;
}

export interface MailTemplate extends MailFields {
  key: string;
  name: string;
  description: string;
  usage: "system" | "starter";
  custom: boolean;
  edited: boolean;
  variables: TemplateVariable[];
  required: string[];
  updatedAt: string | null;
  updatedById: string | null;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
  missing: string[];
  variables?: string[];
}

export type CampaignAudience = "USERS" | "SEGMENT" | "ALL";
export type CampaignStatus = "QUEUED" | "SENDING" | "SENT" | "CANCELED" | "FAILED";

export interface Segment {
  vip?: boolean;
  countries?: string[];
  gender?: Gender;
  verified?: boolean;
  activeWithinDays?: number;
  joinedAfter?: string;
  joinedBefore?: string;
}

export interface AudienceCounts {
  total: number;
  inApp: number;
  email: number;
  noEmail: number;
  optedOut: number;
  sample: { id: string; name: string; avatarUrl: string; email: string | null }[];
}

export interface InAppMessage {
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
}

export interface Campaign {
  id: string;
  name: string;
  sendEmail: boolean;
  sendInApp: boolean;
  important: boolean;
  audience: CampaignAudience;
  segment: Segment | null;
  templateKey: string | null;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  footer: string;
  status: CampaignStatus;
  total: number;
  processed: number;
  emailSent: number;
  emailFailed: number;
  emailSkipped: number;
  inAppSent: number;
  lastError: string | null;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  picked?: PersonRef[];
  pickedCount?: number;
}

export interface Delivery {
  id: string;
  userId: string;
  email: string | null;
  status: "SENT" | "FAILED" | "SKIPPED";
  error: string | null;
  createdAt: string;
  user: PersonRef | null;
}

// ── growth: referrals and creator partners ────────────────────────────────

export type ReferralStatus = "PENDING" | "QUALIFIED" | "REWARDED" | "REJECTED";
export type AffiliateStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";
export type CommissionStatus = "PENDING" | "AVAILABLE" | "PAID" | "REVERSED" | "HELD";
export type AffiliatePayoutStatus = "REQUESTED" | "PAID" | "REJECTED";

export interface ReferralPerson extends PersonRef {
  verified: boolean;
  goodCallsCount: number;
  status: "ACTIVE" | "DELETED";
}

export interface ReferralRow {
  id: string;
  code: string;
  kind: "user" | "affiliate";
  source: "link" | "install" | "code" | "web";
  channel: string | null;
  status: ReferralStatus;
  rejectReason: string | null;
  inviterCoins: number;
  inviteeCoins: number;
  /** First 8 hex chars of the device hash (same value = same device). */
  device: string | null;
  ip: string | null;
  createdAt: string;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  invitee: ReferralPerson;
  inviter: ReferralPerson | null;
  affiliate: { id: string; code: string; displayName: string } | null;
  steps: { verified: boolean; verifyNeeded: boolean; calls: number; callsNeeded: number };
}

export interface AffiliateChannel {
  platform: string;
  url: string;
  followers: number;
}

export interface AffiliateSummary {
  id: string;
  userId: string;
  code: string;
  displayName: string;
  status: AffiliateStatus;
  link: string;
  revSharePercent: number;
  cpaUsdCents: number;
  customTerms: boolean;
  channels: AffiliateChannel[];
  appliedAt: string;
  decidedAt: string | null;
  user?: { id: string; name: string; avatarUrl: string; verified: boolean };
  referrals?: number;
}

export interface AffiliateBalance {
  pendingUsdCents: number;
  availableUsdCents: number;
  requestedUsdCents: number;
  paidUsdCents: number;
}

export interface AffiliateFlag {
  key: "idle_users" | "device_clusters" | "refunds" | "click_ratio";
  level: "warn" | "severe";
  message: string;
  value: number;
}

export interface AffiliateStatsDay {
  day: string;
  clicks: number;
  signups: number;
  qualified: number;
  revenueUsdCents: number;
  earnedUsdCents: number;
}

export interface AffiliateStats {
  days: number;
  totals: { clicks: number; signups: number; qualified: number; payingUsers: number; revenueUsdCents: number; earnedUsdCents: number };
  daily: AffiliateStatsDay[];
  byChannel: { channel: string; clicks: number; signups: number; qualified: number; earnedUsdCents: number }[];
}

export interface AffiliateCommission {
  id: string;
  kind: "REVSHARE" | "CPA";
  usdCents: number;
  baseUsdCents: number;
  status: CommissionStatus;
  availableAt: string;
  createdAt: string;
  adjustment: boolean;
  purchaseId: string | null;
  payoutId: string | null;
  user: { id: string; name: string };
}

export interface AffiliatePayout {
  id: string;
  usdCents: number;
  amountPkr: number;
  method: string;
  accountMasked: string;
  status: AffiliatePayoutStatus;
  reference: string | null;
  failureReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  affiliate?: { id: string; code: string; displayName: string; status: AffiliateStatus; user: { id: string; name: string; avatarUrl: string } };
}

export interface AffiliateDetail extends AffiliateSummary {
  user: { id: string; name: string; avatarUrl: string; verified: boolean; createdAt?: string };
  note: string;
  staffNote: string | null;
  decisionReason: string | null;
  decidedBy: string | null;
  defaults: { revSharePercent: number; cpaUsdCents: number };
  stats: AffiliateStats;
  flags: AffiliateFlag[];
  balance: AffiliateBalance;
  referred: { id: string; status: ReferralStatus; rejectReason: string | null; channel: string | null; source: string; createdAt: string; qualifiedAt: string | null; invitee: ReferralPerson }[];
  commissions: AffiliateCommission[];
  payouts: AffiliatePayout[];
}

export interface UserReferrals {
  invitedBy: ReferralRow | null;
  invited: { counts: Partial<Record<ReferralStatus, number>>; items: ReferralRow[] };
  affiliate: { id: string; code: string; status: AffiliateStatus; displayName: string } | null;
}
