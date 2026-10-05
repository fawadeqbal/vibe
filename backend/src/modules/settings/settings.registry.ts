import { z } from 'zod';

/**
 * Settings staff can change at runtime, without a deploy. Each one has a
 * type (zod), a default, and copy for the admin panel. Code reads them with
 * `settings.get('maintenance.enabled')` — fully typed.
 *
 * To add one: add an entry here and read it where it matters. The admin
 * panel renders the form from this list (`GET /v1/admin/settings`).
 */
export const SETTINGS = {
  'maintenance.enabled': {
    group: 'App',
    label: 'Maintenance mode',
    description: 'Pauses the app for everyone. Staff and the admin panel keep working.',
    schema: z.boolean(),
    default: false,
  },
  'maintenance.message': {
    group: 'App',
    label: 'Maintenance message',
    description: 'What people see while the app is paused.',
    schema: z.string().max(200),
    default: "We're making Vibe better. Back in a few minutes.",
  },
  'app.minVersion': {
    group: 'App',
    label: 'Minimum app version',
    description: 'Older versions are asked to update (e.g. 1.4.0). Empty = no minimum.',
    schema: z.string().regex(/^$|^\d+\.\d+\.\d+$/, 'Use a version like 1.4.0'),
    default: '',
  },
  'signups.enabled': {
    group: 'Accounts',
    label: 'New sign-ups',
    description: 'Turn off to stop new accounts. Existing people can still sign in.',
    schema: z.boolean(),
    default: true,
  },
  'matching.enabled': {
    group: 'Matching',
    label: 'New video matches',
    description: 'Turn off to stop new video matches (live calls finish normally).',
    schema: z.boolean(),
    default: true,
  },
  'payouts.paused': {
    group: 'Payouts',
    label: 'Hold all cash-outs',
    description: 'Every new cash-out waits for a person to approve it.',
    schema: z.boolean(),
    default: false,
  },
  'payouts.reviewAboveUsd': {
    group: 'Payouts',
    label: 'Review cash-outs above (USD)',
    description: 'Larger cash-outs wait for approval; smaller ones pay automatically. 0 = review all.',
    schema: z.number().min(0).max(100_000),
    default: 100,
  },
  'payments.usdToPkr': {
    group: 'Payments',
    label: 'USD → PKR rate',
    description: 'JazzCash, Easypaisa, card and bank prices are the USD price times this, rounded to whole rupees. Cash-outs use it too.',
    schema: z.number().min(1).max(10_000),
    default: 280,
  },
  'payments.localMethodsInStoreApps': {
    group: 'Payments',
    label: 'Local methods in Play/App Store builds',
    description: 'Off = apps installed from Google Play or the App Store only offer store billing (their rules for coins and VIP). On = also JazzCash, Easypaisa, card and bank.',
    schema: z.boolean(),
    default: false,
  },
  'payments.bankName': {
    group: 'Payments',
    label: 'Bank transfer: bank',
    description: 'Shown to people who pay by bank transfer.',
    schema: z.string().max(80),
    default: '',
  },
  'payments.bankAccountTitle': {
    group: 'Payments',
    label: 'Bank transfer: account title',
    description: 'Shown to people who pay by bank transfer. Empty = bank transfer is hidden.',
    schema: z.string().max(80),
    default: '',
  },
  'payments.bankIban': {
    group: 'Payments',
    label: 'Bank transfer: IBAN',
    description: 'e.g. PK36SCBL0000001123456702',
    schema: z.string().regex(/^$|^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'Use an IBAN like PK36SCBL0000001123456702'),
    default: '',
  },
  'payments.bankTransferDays': {
    group: 'Payments',
    label: 'Bank transfer: days to pay',
    description: 'Unpaid bank-transfer orders expire after this many days.',
    schema: z.number().int().min(1).max(30),
    default: 3,
  },
  'payouts.kycAboveUsdPerMonth': {
    group: 'Payouts',
    label: 'Selfie verification needed above (USD / month)',
    description: 'People who cash out more than this in 30 days must be verified first. 0 = always.',
    schema: z.number().min(0).max(100_000),
    default: 100,
  },
  'mail.perMinute': {
    group: 'E-mail',
    label: 'Message e-mails per minute',
    description: 'How fast messages go out by e-mail. A personal Gmail allows about 500 a day; raise this after moving to SES or SendGrid.',
    schema: z.number().int().min(1).max(10_000),
    default: 60,
  },
  'security.require2fa': {
    group: 'Security',
    label: 'Require 2FA for staff',
    description: 'Staff must set up an authenticator app before using the panel.',
    schema: z.boolean(),
    default: 'production-only' as const,
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export type SettingsSnapshot = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTINGS;
}

export function defaultFor<K extends SettingKey>(key: K, isProduction: boolean): SettingValue<K> {
  const d = SETTINGS[key].default;
  return (d === 'production-only' ? isProduction : d) as SettingValue<K>;
}
