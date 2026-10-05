import { AppConfig } from '../../../../../config/app-config.service';
import { RedisService } from '../../../../../infra/redis/redis.service';
import { CardGateway } from '../card-gateway';
import { DevCardGateway } from './dev.gateway';

export interface CardGatewayDeps {
  config: AppConfig;
  redis: RedisService;
}

/**
 * Card gateways by CARD_GATEWAY name. Add a real one here, e.g.
 *   safepay: (d) => new SafepayGateway(d.config),
 * (implement CardGateway in ./safepay.gateway.ts). Its `requiredEnv`
 * decides whether it's live.
 */
export const CARD_GATEWAYS: Record<string, (deps: CardGatewayDeps) => CardGateway> = {
  dev: (d) => new DevCardGateway(d.redis, (p) => d.config.url(p), d.config.get('PAYMENT_WEBHOOK_SECRET')),
};
