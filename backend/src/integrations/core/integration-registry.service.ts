import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import { INTEGRATION_METADATA, IntegrationReporter, IntegrationStatus } from './integration.types';

const ORDER: IntegrationStatus['kind'][] = ['payment', 'payout', 'login', 'ads', 'push', 'storage', 'kyc', 'mail'];

/**
 * Finds every provider marked `@Integration()` and asks it how it's running.
 * Adding an integration needs no change here: mark the class, implement
 * `integrationStatus()`, and it shows up on the admin panel's Integrations page.
 */
@Injectable()
export class IntegrationRegistry {
  constructor(private readonly discovery: DiscoveryService) {}

  private reporters(): IntegrationReporter[] {
    const seen = new Set<unknown>();
    const out: IntegrationReporter[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as IntegrationReporter | undefined;
      if (!instance || typeof instance !== 'object' || seen.has(instance)) continue;
      if (!Reflect.getMetadata(INTEGRATION_METADATA, instance.constructor)) continue;
      if (typeof instance.integrationStatus !== 'function') continue;
      seen.add(instance);
      out.push(instance);
    }
    return out;
  }

  async statuses(): Promise<IntegrationStatus[]> {
    const all = (await Promise.all(this.reporters().map(async (r) => r.integrationStatus()))).flatMap((s) => (Array.isArray(s) ? s : [s]));
    const byKey = new Map(all.map((s) => [s.key, s]));
    return [...byKey.values()].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.key.localeCompare(b.key));
  }

  async status(key: string): Promise<IntegrationStatus | undefined> {
    return (await this.statuses()).find((s) => s.key === key);
  }
}
