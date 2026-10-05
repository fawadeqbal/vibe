import { Injectable } from '@nestjs/common';
import { decodeProtectedHeader, compactVerify } from 'jose';
import { X509Certificate } from 'node:crypto';

/** Apple Root CA - G3 (https://www.apple.com/certificateauthority/), valid until 2039. */
export const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/** DER of the OIDs Apple puts on its signing chain (leaf: 1.2.840.113635.100.6.11.1, intermediate: 1.2.840.113635.100.6.2.1). */
const LEAF_OID = Buffer.from('060a2a864886f76364060b01', 'hex');
const INTERMEDIATE_OID = Buffer.from('060a2a864886f76364060201', 'hex');

export class AppleJwsError extends Error {}

/**
 * Verifies Apple's signed data (App Store Server API transactions, Server
 * Notifications v2, renewal info): the x5c chain must lead to Apple Root
 * CA G3 with Apple's marker OIDs, and the leaf must have signed the JWS.
 * Returns the decoded payload.
 */
@Injectable()
export class AppleJwsVerifier {
  /** Tests swap in their own root. */
  roots: string[] = [APPLE_ROOT_CA_G3];
  /** Tests can turn off the Apple OID check for their self-made chain. */
  requireAppleOids = true;

  async verify<T = Record<string, unknown>>(jws: string, at: Date = new Date()): Promise<T> {
    let header: { x5c?: string[]; alg?: string };
    try {
      header = decodeProtectedHeader(jws) as { x5c?: string[]; alg?: string };
    } catch {
      throw new AppleJwsError('Not a JWS');
    }
    if (header.alg !== 'ES256') throw new AppleJwsError(`Unexpected alg ${header.alg}`);
    const chain = (header.x5c ?? []).map((c) => new X509Certificate(Buffer.from(c, 'base64')));
    if (chain.length < 3) throw new AppleJwsError('Certificate chain is incomplete');
    const [leaf, intermediate, root] = chain;
    const trusted = this.roots.map((pem) => new X509Certificate(pem));
    if (!trusted.some((t) => t.fingerprint256 === root.fingerprint256)) throw new AppleJwsError('Chain does not end at the Apple root');
    if (!leaf.verify(intermediate.publicKey) || !intermediate.verify(root.publicKey)) throw new AppleJwsError('Certificate chain signatures are invalid');
    for (const c of chain) {
      if (new Date(c.validFrom) > at || new Date(c.validTo) < at) throw new AppleJwsError('A certificate in the chain is not valid at the signing time');
    }
    if (this.requireAppleOids && (!leaf.raw.includes(LEAF_OID) || !intermediate.raw.includes(INTERMEDIATE_OID))) throw new AppleJwsError('Not an Apple signing certificate');
    try {
      const { payload } = await compactVerify(jws, leaf.publicKey);
      return JSON.parse(Buffer.from(payload).toString('utf8')) as T;
    } catch {
      throw new AppleJwsError('Signature does not match');
    }
  }

  /** Reads a JWS payload without checking it — only for data that was already verified as part of an outer JWS. */
  static decodeUnverified<T>(jws: string): T {
    return JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8')) as T;
  }
}
