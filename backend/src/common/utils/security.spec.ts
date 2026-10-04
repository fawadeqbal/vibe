import { hashPassword, passwordProblem, temporaryPassword, verifyPassword } from './password';
import { SecretBox } from './secret-box';
import { base32Decode, base32Encode, totpAt, verifyTotp } from './totp';

describe('totp (RFC 6238)', () => {
  // RFC 6238 appendix B, SHA-1 key "12345678901234567890", last 6 of the 8-digit values.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('at t=%i the code is %s', (t, code) => {
    expect(totpAt(secret, Math.floor(t / 30))).toBe(code);
  });

  it('accepts ±1 step of clock drift and nothing further', () => {
    const at = 1_700_000_000_000;
    const step = Math.floor(at / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step - 1), at)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), at)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), at)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', at)).toBeNull();
  });

  it('base32 round-trips', () => {
    const buf = Buffer.from('any bytes \u0000ÿ here');
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });
});

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('Correct-horse-1');
    expect(h).toMatch(/^scrypt\$/);
    expect(await verifyPassword('Correct-horse-1', h)).toBe(true);
    expect(await verifyPassword('correct-horse-1', h)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('rules and temporary passwords', () => {
    expect(passwordProblem('short1')).not.toBeNull();
    expect(passwordProblem('onlyletters')).not.toBeNull();
    expect(passwordProblem('letters-and-1')).toBeNull();
    expect(passwordProblem(temporaryPassword())).toBeNull();
  });
});

describe('SecretBox', () => {
  it('seals, opens, and rejects tampering or the wrong key', () => {
    const box = new SecretBox('k'.repeat(32));
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => new SecretBox('x'.repeat(32)).open(sealed)).toThrow();
    const parts = sealed.split('.');
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'B' : 'A') + parts[3].slice(-1);
    expect(() => box.open(parts.join('.'))).toThrow();
  });
});
