import chain from '../../test/fixtures/test-cert-chain.json';
import { signLikeApple, trustTestChain } from '../../test/support/apple-test-signing';
import { AppleJwsError, AppleJwsVerifier } from './apple/apple-jws';
import { missingKeys, resolveMode } from './core/integration.types';
import { ProviderError, ProviderHttp } from './core/provider-http';
import { redact } from './core/redact';
import { readSecret } from './core/secrets';

describe('integration plumbing', () => {
  it('resolveMode: dev stays dev; live needs keys; auto falls back to dev outside production only', () => {
    expect(resolveMode('dev', true, true)).toBe('dev');
    expect(resolveMode('live', true, true)).toBe('live');
    expect(resolveMode('live', false, false)).toBe('off');
    expect(resolveMode('auto', false, false)).toBe('dev');
    expect(resolveMode('auto', false, true)).toBe('off');
    expect(resolveMode('auto', true, true)).toBe('live');
    expect(missingKeys({ A: 'x', B: '  ', C: undefined }, ['A', 'B', 'C'])).toEqual(['B', 'C']);
  });

  it('readSecret understands literal \\n, base64: and file:', () => {
    expect(readSecret('-----BEGIN-----\\nabc')).toBe('-----BEGIN-----\nabc');
    expect(readSecret(`base64:${Buffer.from('hello').toString('base64')}`)).toBe('hello');
    expect(readSecret('')).toBeUndefined();
  });

  it('redact hides secrets and keeps only the tail of personal numbers', () => {
    expect(redact({ pp_Password: 'x', pp_SecureHash: 'ABC', pp_MobileNumber: '03001234567', nested: { iban: 'PK36SCBL0000001123456702', amount: 5 } })).toEqual({
      pp_Password: '[redacted]',
      pp_SecureHash: '[redacted]',
      pp_MobileNumber: '••4567',
      nested: { iban: '••6702', amount: 5 },
    });
  });

  it('ProviderHttp retries 5xx for idempotent calls and classifies errors', async () => {
    let calls = 0;
    const http = new ProviderHttp('t', 'https://x.test', async () => {
      calls++;
      return calls < 3 ? new Response('busy', { status: 503 }) : new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await expect(http.request('/a', { retries: 2 })).resolves.toMatchObject({ body: { ok: true } });
    expect(calls).toBe(3);
    const denied = new ProviderHttp('t', 'https://x.test', async () => new Response('{}', { status: 401 }));
    await expect(denied.request('/a')).rejects.toMatchObject({ kind: 'misconfigured' });
    const slow = new ProviderHttp('t', 'https://x.test', async (_i, init) => new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))));
    const err = await slow.request('/pay', { method: 'POST', body: { a: 1 }, timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('unknown'); // a timed-out POST may have gone through
  });

  it('Apple JWS: accepts a chain to the trusted root, rejects tampering and other roots', async () => {
    const v = trustTestChain();
    const jws = await signLikeApple({ hello: 'apple' });
    await expect(v.verify(jws)).resolves.toEqual({ hello: 'apple' });
    const [h, , s] = jws.split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify({ hello: 'evil' })).toString('base64url')}.${s}`;
    await expect(v.verify(tampered)).rejects.toBeInstanceOf(AppleJwsError);
    // The real verifier only trusts Apple's root.
    await expect(new AppleJwsVerifier().verify(jws)).rejects.toThrow('Chain does not end at the Apple root');
    await expect(v.verify(await signLikeApple({}, chain.x5c.slice(0, 2)))).rejects.toThrow('incomplete');
  });
});
