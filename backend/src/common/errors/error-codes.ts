/**
 * Stable, machine-readable error codes. Clients switch on these, never on
 * message text, so messages can be reworded freely.
 */
export enum ErrorCode {
  // generic
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL = 'INTERNAL',
  MAINTENANCE = 'MAINTENANCE',

  // auth
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  OTP_INVALID = 'OTP_INVALID',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS = 'OTP_TOO_MANY_ATTEMPTS',
  EMAIL_NOT_SENT = 'EMAIL_NOT_SENT',
  SOCIAL_TOKEN_INVALID = 'SOCIAL_TOKEN_INVALID',
  ACCOUNT_BANNED = 'ACCOUNT_BANNED',
  UNDERAGE = 'UNDERAGE',
  PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE',
  SIGNUPS_CLOSED = 'SIGNUPS_CLOSED',

  // staff (admin panel)
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  TWO_FACTOR_INVALID = 'TWO_FACTOR_INVALID',
  TWO_FACTOR_SETUP_REQUIRED = 'TWO_FACTOR_SETUP_REQUIRED',
  PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED',

  // wallet
  INSUFFICIENT_COINS = 'INSUFFICIENT_COINS',
  INSUFFICIENT_GEMS = 'INSUFFICIENT_GEMS',
  ALREADY_CLAIMED = 'ALREADY_CLAIMED',
  DAILY_LIMIT_REACHED = 'DAILY_LIMIT_REACHED',
  CASHOUT_BELOW_MINIMUM = 'CASHOUT_BELOW_MINIMUM',
  /** Selfie verification needed before this cash-out (monthly limit). */
  KYC_REQUIRED = 'KYC_REQUIRED',
  AD_NOT_VERIFIED = 'AD_NOT_VERIFIED',

  // payments
  PAYMENT_DECLINED = 'PAYMENT_DECLINED',
  PAYMENT_ACTION_REQUIRED = 'PAYMENT_ACTION_REQUIRED',
  UNKNOWN_PRODUCT = 'UNKNOWN_PRODUCT',

  // social
  BLOCKED = 'BLOCKED',
  NOT_FRIENDS = 'NOT_FRIENDS',
  NEVER_MATCHED = 'NEVER_MATCHED',
  /** Friend requests are only sent from a live call (`match:friend`); REST can only accept one. */
  FRIEND_IN_CALL_ONLY = 'FRIEND_IN_CALL_ONLY',
  /** Too many new follows today (economy rule maxFollowsPerDay). */
  FOLLOW_LIMIT = 'FOLLOW_LIMIT',
  /** Only a streak that broke yesterday (and was 3+ days) can be restored. */
  STREAK_NOT_RESTORABLE = 'STREAK_NOT_RESTORABLE',
  /** At most 10 moments live at once (429). */
  MOMENT_LIMIT = 'MOMENT_LIMIT',
  /** Gone, expired, deleted or not visible to you (404). */
  MOMENT_NOT_FOUND = 'MOMENT_NOT_FOUND',

  // referrals and affiliates
  /** No such invite / partner code (404). */
  INVITE_CODE_INVALID = 'INVITE_CODE_INVALID',
  /** Invite codes can be added only within 48 h of sign-up (409). */
  INVITE_TOO_LATE = 'INVITE_TOO_LATE',
  /** This account already joined with an invite (409). */
  INVITE_ALREADY_USED = 'INVITE_ALREADY_USED',
  /** Your own invite or partner code (403). */
  INVITE_SELF = 'INVITE_SELF',
  /** Selfie verification needed first (403). */
  VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED',
  /** Partner code is taken, reserved or malformed (409). */
  AFFILIATE_CODE_TAKEN = 'AFFILIATE_CODE_TAKEN',
  /** You already applied (409). */
  AFFILIATE_EXISTS = 'AFFILIATE_EXISTS',
  /** No active partner account (403). */
  AFFILIATE_NOT_ACTIVE = 'AFFILIATE_NOT_ACTIVE',
  /** A payout is already waiting (409). */
  AFFILIATE_PAYOUT_OPEN = 'AFFILIATE_PAYOUT_OPEN',
  /** Available balance is under the minimum payout (400). */
  AFFILIATE_BELOW_MINIMUM = 'AFFILIATE_BELOW_MINIMUM',

  // matching
  NOT_IN_MATCH = 'NOT_IN_MATCH',
  SKIP_COOLDOWN = 'SKIP_COOLDOWN',
  PARTNER_UNAVAILABLE = 'PARTNER_UNAVAILABLE',
  MATCHING_PAUSED = 'MATCHING_PAUSED',
}
