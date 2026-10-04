import { z } from 'zod';

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

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Back office (staff accounts). Separate secret so an app token can never pass as staff.
  /** Defaults to a value derived from JWT_ACCESS_SECRET outside production. */
  JWT_STAFF_SECRET: z.string().min(32, 'JWT_STAFF_SECRET must be at least 32 characters').optional(),
  STAFF_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  STAFF_SESSION_HOURS: z.coerce.number().int().positive().default(12),
  /** Encrypts TOTP seeds at rest. Defaults to JWT_STAFF_SECRET. */
  STAFF_DATA_KEY: z.string().min(32).optional(),
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

  // Social sign-in
  SOCIAL_VERIFIER: z.enum(['dev', 'jwks']).default('dev'),
  GOOGLE_CLIENT_IDS: z.string().default(''),
  APPLE_CLIENT_IDS: z.string().default(''),

  // Payments
  PAYMENTS_PROVIDER: z.enum(['dev', 'live']).default('dev'),
  /** dev provider: decline every Nth charge so the failure path is exercised (0 = never). */
  DEV_PAYMENTS_FAIL_EVERY: z.coerce.number().int().min(0).default(0),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),

  // Ads (AdMob server-side verification)
  ADS_VERIFIER: z.enum(['dev', 'admob']).default('dev'),

  // Selfie verification
  VERIFICATION_PROVIDER: z.enum(['dev']).default('dev'),

  // Media
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

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
