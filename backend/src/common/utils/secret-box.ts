import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for small secrets at rest (TOTP seeds). Output:
 * `v1.<iv>.<tag>.<ciphertext>` in base64url. The key is derived from a
 * configured secret, so rotating that secret means re-enrolling 2FA.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash('sha256').update(`secret-box:${secret}`).digest();
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
  }

  open(sealed: string): string {
    const [v, iv, tag, data] = sealed.split('.');
    if (v !== 'v1') throw new Error('Unknown secret format');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  }
}
