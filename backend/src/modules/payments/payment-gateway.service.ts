import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfig } from '../../config/app-config.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AppleJwsVerifier } from '../../integrations/apple/apple-jws';
import { Integration, IntegrationMode, IntegrationReporter, IntegrationStatus, missingKeys, ProviderSwitch, resolveMode } from '../../integrations/core/integration.types';
import { readSecret, readServiceAccount } from '../../integrations/core/secrets';
import { GoogleAuth } from '../../integrations/google/google-auth';
import { SettingsService } from '../settings/settings.service';
import { BankTransferAdapter } from './adapters/bank-transfer.adapter';
import { CardAdapter } from './adapters/card/card.adapter';
import { CardGateway } from './adapters/card/card-gateway';
import { CARD_GATEWAYS } from './adapters/card/gateways';
import { DevCardGateway } from './adapters/card/gateways/dev.gateway';
import { DevDecliner, DevStoreAdapter, DevWalletAdapter } from './adapters/dev/dev-adapters';
import { EasypaisaAdapter } from './adapters/easypaisa/easypaisa.adapter';
import { EasypaisaClient } from './adapters/easypaisa/easypaisa.client';
import { JazzCashAdapter } from './adapters/jazzcash/jazzcash.adapter';
import { JazzCashClient } from './adapters/jazzcash/jazzcash.client';
import { METHOD_LABEL, MethodInfo, PaymentAdapter } from './adapters/payment-adapter';
import { AppStoreAdapter } from './adapters/store/app-store.adapter';
import { AppStoreClient } from './adapters/store/app-store.client';
import { GooglePlayAdapter } from './adapters/store/google-play.adapter';
import { GooglePlayClient } from './adapters/store/google-play.client';

interface Slot {
  mode: IntegrationMode;
  adapter?: PaymentAdapter;
  requiredEnv: string[];
  endpoints: { label: string; url: string }[];
  notes: string[];
}

const NEEDS: Record<PaymentMethod, MethodInfo['needs']> = {
  GOOGLE_PLAY: ['receipt'],
  APP_STORE: ['receipt'],
  JAZZCASH: ['phone', 'cnicLast6'],
  EASYPAISA: ['phone'],
  CARD: [],
  BANK: [],
};

/**
 * One adapter per payment method, chosen at boot from PAYMENTS_PROVIDER and
 * the keys present (see integrations/core resolveMode). The rest of the
 * payments code only ever asks `gateway.adapter(method)`.
 */
@Integration()
@Injectable()
export class PaymentGateway implements IntegrationReporter {
  private readonly slots = new Map<PaymentMethod, Slot>();
  readonly bank: BankTransferAdapter;
  /** The built-in test card page, when the card method runs in dev mode. */
  readonly devCard?: DevCardGateway;
  readonly cardGateway?: CardGateway;
  /** A real (non-dev) card gateway is registered for CARD_GATEWAY. */
  private realCard = false;
  readonly jazzcash?: JazzCashClient;
  /** Live Google Play API client (store notifications re-read subscription state with it). */
  readonly playClient?: GooglePlayClient;
  readonly easypaisa?: EasypaisaClient;

  constructor(
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
    redis: RedisService,
    googleAuth: GoogleAuth,
    appleJws: AppleJwsVerifier,
  ) {
    const sw = config.get('PAYMENTS_PROVIDER') as ProviderSwitch;
    const decliner = new DevDecliner(() => config.get('DEV_PAYMENTS_FAIL_EVERY'));
    const env = config.env;
    const slot = (method: PaymentMethod, required: string[], live: () => PaymentAdapter, dev: () => PaymentAdapter, endpoints: Slot['endpoints'] = [], notes: string[] = [], configured = missingKeys(env, required).length === 0): Slot => {
      const mode = resolveMode(sw, configured, config.isProduction);
      const s: Slot = { mode, requiredEnv: required, endpoints, notes, adapter: mode === 'live' ? live() : mode === 'dev' ? dev() : undefined };
      this.slots.set(method, s);
      return s;
    };

    slot(
      PaymentMethod.GOOGLE_PLAY,
      ['GOOGLE_PLAY_PACKAGE', 'GOOGLE_SERVICE_ACCOUNT_JSON'],
      () => new GooglePlayAdapter(this.playClientFor(googleAuth)),
      () => new DevStoreAdapter(PaymentMethod.GOOGLE_PLAY, decliner),
      [{ label: 'Real-time developer notifications (Pub/Sub push endpoint)', url: config.url('/v1/webhooks/google-play') }],
      config.get('GOOGLE_PLAY_RTDN_AUDIENCE') ? [] : ['Set GOOGLE_PLAY_RTDN_AUDIENCE (+ _SERVICE_ACCOUNT) to authenticate Pub/Sub pushes.'],
    );
    slot(
      PaymentMethod.APP_STORE,
      ['APPLE_ISSUER_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_BUNDLE_ID'],
      () =>
        new AppStoreAdapter(
          new AppStoreClient(
            { issuerId: config.get('APPLE_ISSUER_ID'), keyId: config.get('APPLE_KEY_ID'), privateKey: readSecret(config.get('APPLE_PRIVATE_KEY'))!, bundleId: config.get('APPLE_BUNDLE_ID') },
            appleJws,
            config.get('APPLE_IAP_ENVIRONMENT'),
          ),
          config.get('APPLE_BUNDLE_ID'),
        ),
      () => new DevStoreAdapter(PaymentMethod.APP_STORE, decliner),
      [{ label: 'App Store Server Notifications V2 URL', url: config.url('/v1/webhooks/app-store') }],
    );

    const jazz = slot(
      PaymentMethod.JAZZCASH,
      ['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT'],
      () => new JazzCashAdapter(this.jazzClient(), config),
      () => new DevWalletAdapter(PaymentMethod.JAZZCASH, decliner),
      [{ label: 'Return URL / IPN URL', url: config.url('/v1/webhooks/jazzcash') }],
      [`Environment: ${config.get('JAZZCASH_ENV')}`],
    );
    if (jazz.mode === 'live') this.jazzcash = this.jazzClient();

    const ep = slot(
      PaymentMethod.EASYPAISA,
      ['EASYPAISA_STORE_ID', 'EASYPAISA_USERNAME', 'EASYPAISA_PASSWORD', 'EASYPAISA_ACCOUNT_NUM'],
      () => new EasypaisaAdapter(this.epClient(), config),
      () => new DevWalletAdapter(PaymentMethod.EASYPAISA, decliner),
      [{ label: 'IPN URL', url: config.url('/v1/webhooks/easypaisa') }],
      [`Environment: ${config.get('EASYPAISA_ENV')}`],
    );
    if (ep.mode === 'live') this.easypaisa = this.epClient();

    const name = config.get('CARD_GATEWAY');
    const factory = CARD_GATEWAYS[name];
    const real = name !== 'dev' && factory ? factory({ config, redis }) : undefined;
    const card = slot(
      PaymentMethod.CARD,
      real ? real.requiredEnv : ['CARD_GATEWAY'],
      () => new CardAdapter(real!, config),
      () => new CardAdapter(CARD_GATEWAYS.dev({ config, redis }), config),
      [{ label: 'Card gateway webhook', url: config.url(`/v1/webhooks/card/${real?.name ?? name}`) }],
      real ? [`Gateway: ${real.name}`] : name !== 'dev' ? [`CARD_GATEWAY="${name}" is not a known gateway (see card/gateways/index.ts)`] : ['No real gateway yet: implement CardGateway and set CARD_GATEWAY (see card/gateways/index.ts).'],
      !!real && missingKeys(env, real.requiredEnv).length === 0,
    );
    this.realCard = !!real;
    const cardAdapter = card.adapter as CardAdapter | undefined;
    this.cardGateway = cardAdapter?.gateway;
    if (this.cardGateway instanceof DevCardGateway) this.devCard = this.cardGateway;

    this.bank = new BankTransferAdapter(settings);
    this.slots.set(PaymentMethod.BANK, { mode: sw === 'dev' ? 'dev' : 'live', adapter: this.bank, requiredEnv: [], endpoints: [], notes: ['Staff confirm transfers in Finance → Purchases. Bank details are in Settings → Payments.'] });
  }

  private playClientFor(googleAuth: GoogleAuth): GooglePlayClient {
    const client = new GooglePlayClient(this.config.get('GOOGLE_PLAY_PACKAGE'), readServiceAccount(this.config.get('GOOGLE_SERVICE_ACCOUNT_JSON'))!, googleAuth);
    (this as { playClient?: GooglePlayClient }).playClient = client;
    return client;
  }

  private jazzClient() {
    const c = this.config;
    return new JazzCashClient({ env: c.get('JAZZCASH_ENV'), merchantId: c.get('JAZZCASH_MERCHANT_ID'), password: c.get('JAZZCASH_PASSWORD'), salt: c.get('JAZZCASH_INTEGRITY_SALT') });
  }

  private epClient() {
    const c = this.config;
    return new EasypaisaClient({ env: c.get('EASYPAISA_ENV'), storeId: c.get('EASYPAISA_STORE_ID'), username: c.get('EASYPAISA_USERNAME'), password: c.get('EASYPAISA_PASSWORD'), accountNum: c.get('EASYPAISA_ACCOUNT_NUM') });
  }

  /** Bank transfer is live only once staff entered the account in Settings. */
  private async bankMode(): Promise<IntegrationMode> {
    const slot = this.slots.get(PaymentMethod.BANK)!;
    if (slot.mode === 'dev') return 'dev';
    return (await this.bank.configured()) ? 'live' : 'off';
  }

  async mode(method: PaymentMethod): Promise<IntegrationMode> {
    return method === PaymentMethod.BANK ? this.bankMode() : (this.slots.get(method)?.mode ?? 'off');
  }

  async adapter(method: PaymentMethod): Promise<PaymentAdapter> {
    const slot = this.slots.get(method);
    if (!slot?.adapter || (await this.mode(method)) === 'off') {
      throw new AppError(ErrorCode.PAYMENT_DECLINED, `${METHOD_LABEL[method]} isn't available right now`, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return slot.adapter;
  }

  /** Adapter for a stored purchase, even if the method was switched off since (to finish or check it). */
  adapterFor(method: PaymentMethod): PaymentAdapter | undefined {
    return this.slots.get(method)?.adapter;
  }

  /**
   * Methods the app should offer. Apps installed from Google Play / the App
   * Store (header X-App-Store) only get their own store billing unless the
   * `payments.localMethodsInStoreApps` setting allows more.
   */
  async methods(store?: 'play' | 'appstore'): Promise<MethodInfo[]> {
    const allowLocal = !store || (await this.settings.get('payments.localMethodsInStoreApps'));
    const out: MethodInfo[] = [];
    for (const [method, slot] of this.slots) {
      const mode = await this.mode(method);
      if (mode === 'off' || !slot.adapter) continue;
      const isStore = method === PaymentMethod.GOOGLE_PLAY || method === PaymentMethod.APP_STORE;
      if (store === 'play' && method === PaymentMethod.APP_STORE) continue;
      if (store === 'appstore' && method === PaymentMethod.GOOGLE_PLAY) continue;
      if (!isStore && !allowLocal) continue;
      out.push({ method, flow: slot.adapter.flow, label: METHOD_LABEL[method], mode, currency: isStore ? 'USD' : 'PKR', needs: NEEDS[method] });
    }
    return out;
  }

  async integrationStatus(): Promise<IntegrationStatus[]> {
    const out: IntegrationStatus[] = [];
    for (const [method, slot] of this.slots) {
      out.push({
        key: `payments.${method.toLowerCase()}`,
        kind: 'payment',
        label: METHOD_LABEL[method],
        mode: await this.mode(method),
        requiredEnv: slot.requiredEnv,
        missingEnv: method === PaymentMethod.CARD && !this.realCard ? ['CARD_GATEWAY'] : missingKeys(this.config.env, slot.requiredEnv),
        endpoints: slot.endpoints,
        notes: slot.notes,
      });
    }
    return out;
  }
}
