import { CompactSign, importPKCS8 } from 'jose';

import { AppleJwsVerifier } from '../../src/integrations/apple/apple-jws';
import chain from '../fixtures/test-cert-chain.json';

/** Signs a payload the way Apple does (ES256, x5c chain in the header) — with the TEST chain, not Apple's. */
export async function signLikeApple(payload: object, x5c: string[] = chain.x5c): Promise<string> {
  const key = await importPKCS8(chain.leafKeyPkcs8, 'ES256');
  return new CompactSign(Buffer.from(JSON.stringify(payload))).setProtectedHeader({ alg: 'ES256', x5c }).sign(key);
}

/** Makes a verifier trust the test chain (and skip Apple's marker OIDs). */
export function trustTestChain(v: AppleJwsVerifier = new AppleJwsVerifier()): AppleJwsVerifier {
  v.roots = [chain.rootPem];
  v.requireAppleOids = false;
  return v;
}
