import { z } from 'zod';

/** dev = stand-in, live = real provider (off without keys), auto = live when keys are set (see integrations/core). */
const providerSwitch = z.enum(['dev', 'live', 'auto']);
const opt = z.string().default('');
/** An optional secret: empty in .env means "not set". */
const optSecret = (message: string) => z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32, message).optional());

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

/**
 * Every environment variable the service reads, validated once at boot.
 * A missing or malformed value stops the process with a readable message
 * instead of failing later at the first request that needs it.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('*'),
  /** Share links: `<INVITE_LINK_BASE>/<code>?s=<channel>` (the landing site's invite page). */
  INVITE_LINK_BASE: z.string().url().default('https://vibe.fawadiqbal.dev/i'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Back office (staff accounts). Separate secret so an app token can never pass as staff.
  /** Defaults to a value derived from JWT_ACCESS_SECRET outside production. */
  JWT_STAFF_SECRET: optSecret('JWT_STAFF_SECRET must be at least 32 characters'),
  STAFF_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  STAFF_SESSION_HOURS: z.coerce.number().int().positive().default(12),
  /** Encrypts TOTP seeds at rest. Defaults to JWT_STAFF_SECRET. */
  STAFF_DATA_KEY: optSecret('STAFF_DATA_KEY must be at least 32 characters'),
  STAFF_LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  STAFF_LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  /** Name shown in authenticator apps. */
  STAFF_TOTP_ISSUER: z.string().default('Vibe Admin'),
  /** First owner, created by `npm run db:seed` when no staff exists. */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  /** Business day boundary for daily rewards/limits (minutes east of UTC; PKT = 300). */
  BUSINESS_TZ_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(300),

  // Sign-in codes by e-mail
  /** console = print codes to the log (dev); smtp = send real e-mail (Gmail, SES, SendGrid… any SMTP). */
  MAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  /** true for port 465 (TLS from the start); false for 587 (STARTTLS). */
  SMTP_SECURE: bool.default(true),
  SMTP_USER: z.string().default(''),
  /** Gmail: a 16-character App Password (Google Account → Security → App passwords), not your normal password. */
  SMTP_PASS: z.string().default(''),
  /** Sender shown to people, e.g. "Vibe <you@gmail.com>". Defaults to SMTP_USER. */
  MAIL_FROM: z.string().default(''),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Development only: every code is this. Ignored in production. */
  OTP_FIXED_CODE: z.string().regex(/^\d{4}$/).optional(),

  /**
   * Seals personal data at rest (payout account numbers, provider refresh tokens).
   * Required in production once payouts or Apple sign-in are live; never change it
   * afterwards (sealed data could no longer be read). `openssl rand -base64 48`
   */
  DATA_ENCRYPTION_KEY: optSecret('DATA_ENCRYPTION_KEY must be at least 32 characters'),

  // ── Social sign-in ──────────────────────────────────────────────────
  /** `jwks` is the old name for `live`. */
  SOCIAL_VERIFIER: z.enum(['dev', 'jwks', 'live', 'auto']).default('dev').transform((v) => (v === 'jwks' ? 'live' : v)),
  /** OAuth client ids allowed as token audience (Android, iOS, web), comma-separated. */
  GOOGLE_CLIENT_IDS: opt,
  /** Bundle id (native) and Services id (web/Android), comma-separated. */
  APPLE_CLIENT_IDS: opt,
  /** Sign in with Apple key, to exchange codes and revoke tokens when an account is deleted. */
  APPLE_TEAM_ID: opt,
  APPLE_SIGNIN_KEY_ID: opt,
  APPLE_SIGNIN_PRIVATE_KEY: opt,
  /** Android application id: Sign in with Apple on Android returns to the app through it. */
  ANDROID_PACKAGE_NAME: z.string().default('com.pingcrood.vibe_app'),
  FACEBOOK_APP_ID: opt,
  FACEBOOK_APP_SECRET: opt,

  // ── Payments ────────────────────────────────────────────────────────
  PAYMENTS_PROVIDER: providerSwitch.default('dev'),
  /** dev provider: decline every Nth charge so the failure path is exercised (0 = never). */
  DEV_PAYMENTS_FAIL_EVERY: z.coerce.number().int().min(0).default(0),
  /** Signs the generic `/webhooks/payments` callback and the card gateway's dev webhooks. */
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  /** Unfinished wallet/card checkouts expire after this many minutes (bank transfers: days, in settings). */
  PAYMENT_CHECKOUT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  /** Where the hosted card/wallet pages send the user back to (the app's deep link). */
  PAYMENT_RETURN_URL: z.string().default('vibe://payment-return'),

  // Google Play Billing (verify, acknowledge, Real-time developer notifications)
  GOOGLE_PLAY_PACKAGE: opt,
  /** Service account JSON (literal, base64:…, or file:…) with Play Console "View financial data" + "Manage orders". */
  GOOGLE_SERVICE_ACCOUNT_JSON: opt,
  /** Pub/Sub push subscription's audience (the push endpoint URL); enables OIDC checks on RTDN. */
  GOOGLE_PLAY_RTDN_AUDIENCE: opt,
  /** Service account e-mail the Pub/Sub push subscription signs with. */
  GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT: opt,

  // App Store (App Store Server API + Server Notifications v2)
  APPLE_ISSUER_ID: opt,
  APPLE_KEY_ID: opt,
  /** In-App Purchase key (.p8). */
  APPLE_PRIVATE_KEY: opt,
  APPLE_BUNDLE_ID: opt,
  /** Numeric app id from App Store Connect (checked on production notifications). */
  APPLE_APP_APPLE_ID: opt,
  APPLE_IAP_ENVIRONMENT: z.enum(['auto', 'production', 'sandbox']).default('auto'),

  // JazzCash (merchant portal → Integrity salt, Merchant ID, Password)
  JAZZCASH_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  JAZZCASH_MERCHANT_ID: opt,
  JAZZCASH_PASSWORD: opt,
  JAZZCASH_INTEGRITY_SALT: opt,

  // Easypaisa (Easypay merchant: store id + API credentials + hash key)
  EASYPAISA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  EASYPAISA_STORE_ID: opt,
  EASYPAISA_USERNAME: opt,
  EASYPAISA_PASSWORD: opt,
  EASYPAISA_HASH_KEY: opt,
  /** Your Easypaisa merchant account number (the inquiry API asks for it). */
  EASYPAISA_ACCOUNT_NUM: opt,

  /** Card gateway adapter: dev (built-in test checkout page) or a real one registered in card-gateways/. */
  CARD_GATEWAY: z.string().default('dev'),
  /** Generic card gateway settings (each adapter documents which it uses). */
  CARD_GATEWAY_API_KEY: opt,
  CARD_GATEWAY_SECRET: opt,
  CARD_GATEWAY_WEBHOOK_SECRET: opt,
  CARD_GATEWAY_BASE_URL: opt,

  // ── Payouts (gems cash-out) ────────────────────────────────────────
  PAYOUTS_PROVIDER: providerSwitch.default('dev'),
  /** JazzCash disbursement API (separate credentials from payments; given with the disbursement agreement). */
  JAZZCASH_DISBURSE_BASE_URL: opt,
  JAZZCASH_DISBURSE_CLIENT_ID: opt,
  JAZZCASH_DISBURSE_CLIENT_SECRET: opt,
  JAZZCASH_DISBURSE_USERNAME: opt,
  JAZZCASH_DISBURSE_PASSWORD: opt,
  /** AES key for the encrypted request body, if your disbursement API version uses one. */
  JAZZCASH_DISBURSE_AES_KEY: opt,
  /** Easypaisa disbursement (Easypay "MA to MA" / corporate disbursement). */
  EASYPAISA_DISBURSE_BASE_URL: opt,
  EASYPAISA_DISBURSE_CLIENT_ID: opt,
  EASYPAISA_DISBURSE_CLIENT_SECRET: opt,
  EASYPAISA_DISBURSE_ACCOUNT: opt,

  // ── Ads (AdMob server-side verification) ───────────────────────────
  ADS_VERIFIER: z.enum(['dev', 'admob', 'live', 'auto']).default('dev').transform((v) => (v === 'admob' ? 'live' : v)),
  /** Optional: only accept rewards from these ad unit ids (numeric part, comma-separated). */
  ADMOB_AD_UNIT_IDS: opt,

  // ── Push notifications (Firebase Cloud Messaging HTTP v1) ──────────
  PUSH_PROVIDER: providerSwitch.default('dev'),
  FCM_PROJECT_ID: opt,
  /** Service account with "Firebase Cloud Messaging API Admin"; defaults to GOOGLE_SERVICE_ACCOUNT_JSON. */
  FCM_SERVICE_ACCOUNT_JSON: opt,

  // ── Selfie verification ────────────────────────────────────────────
  /** dev = approve if there's a photo; face = our own face service; rekognition = AWS face match; manual = staff review queue. */
  VERIFICATION_PROVIDER: z.enum(['dev', 'face', 'rekognition', 'manual']).default('dev'),
  /** face: our own face service (infra: vibe-face) — face match + pose-challenge liveness. */
  FACE_SERVICE_URL: z.string().url().default('http://vibe-face:8000'),
  /** Cosine similarity (SFace) to the profile photo for an automatic badge, and the floor for staff review. */
  FACE_MATCH_APPROVE: z.coerce.number().min(0.3).max(0.9).default(0.4),
  FACE_MATCH_REVIEW: z.coerce.number().min(0.2).max(0.9).default(0.3),
  /** Face similarity (0–100) needed to approve automatically; below goes to staff review. */
  VERIFICATION_MIN_SIMILARITY: z.coerce.number().min(50).max(100).default(90),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: opt,
  AWS_SECRET_ACCESS_KEY: opt,

  // ── Media ──────────────────────────────────────────────────────────
  /** local = disk + /media (one server); s3 = any S3-compatible store (our Garage container, AWS S3, Cloudflare R2, Backblaze B2, MinIO). */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  S3_BUCKET: opt,
  /** Bucket with no public access, for selfies awaiting review. Defaults to S3_BUCKET + private/ prefix. */
  S3_PRIVATE_BUCKET: opt,
  S3_REGION: z.string().default('auto'),
  /** e.g. http://vibe-storage:3900 for our Garage container, https://<account>.r2.cloudflarestorage.com for R2; empty for AWS. */
  S3_ENDPOINT: opt,
  S3_ACCESS_KEY_ID: opt,
  S3_SECRET_ACCESS_KEY: opt,
  /** Public base URL (CDN / R2 custom domain) the app loads media from. Empty = the API serves the bucket at <PUBLIC_URL>/media. */
  S3_PUBLIC_URL: opt,
  S3_FORCE_PATH_STYLE: bool.default(false),

  // WebRTC
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  /** Comma-separated, e.g. `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp`. See turn/README.md. */
  TURN_URLS: z.string().default(''),
  /** coturn `static-auth-secret` for time-limited TURN credentials (same value as turn/.env). */
  TURN_SECRET: z.string().default(''),
  /**
   * How long a TURN login stays valid. coturn re-checks it every ~10 minutes
   * during a call, so it must outlast the longest call (plus the app's
   * 30-minute cache); an expired login drops a relayed call.
   */
  TURN_TTL_SECONDS: z.coerce.number().int().min(3600).default(86400),

  // Matching
  MATCH_SCAN_LIMIT: z.coerce.number().int().positive().default(200),
  MATCH_SWEEP_MS: z.coerce.number().int().positive().default(1000),
  /** Dev: scripted bot partners step in after this many ms of waiting (0 = off). */
  DEV_BOTS_AFTER_MS: z.coerce.number().int().min(0).default(0),

  // Rate limits (per IP / user, per minute)
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),

  SWAGGER_ENABLED: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  const env = parsed.data;
  const turnProblems = checkIceConfig(env);
  if (turnProblems.length) throw new Error(`Invalid environment configuration:\n  • ${turnProblems.join('\n  • ')}`);
  if (env.MAIL_PROVIDER === 'smtp' && (!env.SMTP_USER || !env.SMTP_PASS)) {
    throw new Error('Invalid environment configuration:\n  • MAIL_PROVIDER=smtp needs SMTP_USER and SMTP_PASS (for Gmail: your address and an App Password)');
  }
  if (env.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (env.OTP_FIXED_CODE) problems.push('OTP_FIXED_CODE must not be set in production');
    // if (env.MAIL_PROVIDER === 'console') problems.push('MAIL_PROVIDER=console is not allowed in production (use smtp)');
    // if (env.SOCIAL_VERIFIER === 'dev') problems.push('SOCIAL_VERIFIER=dev is not allowed in production');
    // if (env.PAYMENTS_PROVIDER === 'dev') problems.push('PAYMENTS_PROVIDER=dev is not allowed in production');
    // if (env.ADS_VERIFIER === 'dev') problems.push('ADS_VERIFIER=dev is not allowed in production');
    if (!env.JWT_STAFF_SECRET) problems.push('JWT_STAFF_SECRET is required in production');
    if (env.JWT_STAFF_SECRET && env.JWT_STAFF_SECRET === env.JWT_ACCESS_SECRET) problems.push('JWT_STAFF_SECRET must differ from JWT_ACCESS_SECRET');
    if (env.DEV_BOTS_AFTER_MS > 0) problems.push('DEV_BOTS_AFTER_MS must be 0 in production');
    if (env.PAYOUTS_PROVIDER !== 'dev' && !env.DATA_ENCRYPTION_KEY) problems.push('DATA_ENCRYPTION_KEY is required in production once payouts are live (openssl rand -base64 48)');
    if (env.STORAGE_DRIVER === 's3' && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) problems.push('STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
    if (problems.length) throw new Error(`Unsafe production configuration:\n  • ${problems.join('\n  • ')}`);
  }
  return env;
}

const ICE_URL = {
  STUN_URLS: /^stuns?:(\[[0-9a-f:.]+\]|[^\s:?[\]]+)(:\d{1,5})?$/i,
  TURN_URLS: /^turns?:(\[[0-9a-f:.]+\]|[^\s:?[\]]+)(:\d{1,5})?(\?transport=(udp|tcp))?$/i,
} as const;

/** TURN/STUN settings that would otherwise fail silently on users' phones. */
export function checkIceConfig(env: Pick<Env, 'STUN_URLS' | 'TURN_URLS' | 'TURN_SECRET'>): string[] {
  const problems: string[] = [];
  for (const key of ['STUN_URLS', 'TURN_URLS'] as const) {
    for (const url of env[key].split(',').map((u) => u.trim()).filter(Boolean)) {
      if (!ICE_URL[key].test(url)) problems.push(`${key}: "${url}" is not a valid ${key === 'STUN_URLS' ? 'stun:host[:port]' : 'turn:host[:port][?transport=udp|tcp]'} address`);
    }
  }
  const hasTurn = env.TURN_URLS.trim() !== '';
  if (hasTurn && !env.TURN_SECRET) problems.push('TURN_URLS is set but TURN_SECRET is empty (use the same secret as turn/.env)');
  if (!hasTurn && env.TURN_SECRET) problems.push('TURN_SECRET is set but TURN_URLS is empty');
  if (env.TURN_SECRET && env.TURN_SECRET.length < 32) problems.push('TURN_SECRET must be at least 32 characters (openssl rand -hex 32)');
  return problems;
}
