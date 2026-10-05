import { SetMetadata } from '@nestjs/common';

/** What an integration is for — groups the admin panel's Integrations page. */
export type IntegrationKind = 'payment' | 'payout' | 'login' | 'ads' | 'push' | 'storage' | 'kyc' | 'mail';

/**
 * How an integration is running right now:
 * - `live`: talking to the real provider with real keys.
 * - `dev`: a local stand-in that behaves like the provider (no keys needed).
 * - `off`: not available (no keys in production, or switched off).
 */
export type IntegrationMode = 'live' | 'dev' | 'off';

export interface IntegrationStatus {
  /** Stable id, e.g. `payments.jazzcash`. */
  key: string;
  kind: IntegrationKind;
  label: string;
  mode: IntegrationMode;
  /** Every env key the live adapter needs. */
  requiredEnv: string[];
  /** Required keys that are still empty. Live needs this to be []. */
  missingEnv: string[];
  /** URLs to paste into the provider's console (webhooks, return URLs). */
  endpoints?: { label: string; url: string }[];
  /** Short operator notes ("sandbox", "manual payouts"…). */
  notes?: string[];
  docsUrl?: string;
}

/** Anything that reports an [IntegrationStatus]. Mark the class with `@Integration()`. */
export interface IntegrationReporter {
  integrationStatus(): IntegrationStatus | IntegrationStatus[] | Promise<IntegrationStatus | IntegrationStatus[]>;
}

export const INTEGRATION_METADATA = 'vibe:integration';

/** Marks a provider so the IntegrationRegistry finds it (it must implement IntegrationReporter). */
export const Integration = (): ClassDecorator => SetMetadata(INTEGRATION_METADATA, true);

/**
 * The switch every integration area reads (PAYMENTS_PROVIDER, PUSH_PROVIDER…):
 * - `dev`  → always the stand-in (no money moves, no messages leave)
 * - `live` → the real provider; if keys are missing it's `off`
 * - `auto` → live when its keys are set; otherwise dev outside production, off in production
 */
export type ProviderSwitch = 'dev' | 'live' | 'auto';

export function resolveMode(sw: ProviderSwitch, configured: boolean, isProduction: boolean): IntegrationMode {
  if (sw === 'dev') return 'dev';
  if (configured) return 'live';
  return sw === 'auto' && !isProduction ? 'dev' : 'off';
}

/** The keys from `required` that have no value in `env`. */
export function missingKeys(env: Record<string, unknown>, required: readonly string[]): string[] {
  return required.filter((k) => {
    const v = env[k];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}
