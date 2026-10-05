import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';

import { AppConfig } from '../../config/app-config.service';
import { Integration, IntegrationReporter, IntegrationStatus, missingKeys } from '../../integrations/core/integration.types';
import { readSecret } from '../../integrations/core/secrets';
import { OpenedObject, StorageProvider, StoreOptions } from './storage.provider';

const REQUIRED = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];

/**
 * Any S3-compatible store: our own Garage container (infra/garage), AWS S3, Cloudflare R2
 * (S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com, S3_REGION=auto), Backblaze B2, MinIO.
 * Public media is served from S3_PUBLIC_URL (CDN / custom domain) or, when that is empty, by the
 * API itself at `<PUBLIC_URL>/media` (see media.handler.ts) so the bucket never faces the
 * internet. Private objects go to S3_PRIVATE_BUCKET (or the private/ prefix — keep that prefix
 * blocked from public access).
 */
@Integration()
@Injectable()
export class S3StorageProvider extends StorageProvider implements IntegrationReporter {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly privateBucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: AppConfig) {
    super();
    this.bucket = config.get('S3_BUCKET');
    this.privateBucket = config.get('S3_PRIVATE_BUCKET') || this.bucket;
    this.publicUrl = (config.get('S3_PUBLIC_URL') || `${config.get('PUBLIC_URL')}/media`).replace(/\/$/, '');
    this.s3 = new S3Client({
      region: config.get('S3_REGION'),
      endpoint: config.get('S3_ENDPOINT') || undefined,
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
      credentials: { accessKeyId: config.get('S3_ACCESS_KEY_ID'), secretAccessKey: readSecret(config.get('S3_SECRET_ACCESS_KEY')) ?? '' },
    });
  }

  private where(key: string, opts?: StoreOptions) {
    if (!opts?.private) return { Bucket: this.bucket, Key: key };
    return { Bucket: this.privateBucket, Key: this.privateBucket === this.bucket ? `private/${key}` : key };
  }

  async put(key: string, data: Buffer, contentType: string, opts?: StoreOptions): Promise<string> {
    await this.s3.send(new PutObjectCommand({ ...this.where(key, opts), Body: data, ContentType: contentType, CacheControl: opts?.private ? 'no-store' : 'public, max-age=31536000, immutable' }));
    return opts?.private ? key : `${this.publicUrl}/${key}`;
  }

  async delete(key: string, opts?: StoreOptions): Promise<void> {
    await this.s3.send(new DeleteObjectCommand(this.where(key, opts)));
  }

  async read(key: string, opts?: StoreOptions): Promise<Buffer | null> {
    try {
      const r = await this.s3.send(new GetObjectCommand(this.where(key, opts)));
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async open(key: string, opts?: { ifNoneMatch?: string }): Promise<OpenedObject | null> {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, IfNoneMatch: opts?.ifNoneMatch || undefined }));
      if (!r.Body) return null;
      return { body: r.Body as Readable, contentType: r.ContentType, contentLength: r.ContentLength, etag: r.ETag, lastModified: r.LastModified };
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.$metadata?.httpStatusCode === 304) return { notModified: true, etag: opts?.ifNoneMatch };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  keyFromUrl(url: string): string | null {
    return url.startsWith(`${this.publicUrl}/`) ? decodeURIComponent(url.slice(this.publicUrl.length + 1)) : null;
  }

  integrationStatus(): IntegrationStatus {
    const missing = missingKeys(this.config.env, REQUIRED);
    return {
      key: 'storage.media',
      kind: 'storage',
      label: 'Media storage',
      mode: missing.length ? 'off' : 'live',
      requiredEnv: REQUIRED,
      missingEnv: missing,
      notes: [`Bucket ${this.bucket}${this.config.get('S3_ENDPOINT') ? ` at ${new URL(this.config.get('S3_ENDPOINT')).host}` : ''}`, `Served from ${this.publicUrl}`, this.config.get('S3_PRIVATE_BUCKET') ? `Private bucket ${this.privateBucket}` : 'Private files under private/ — block public access to that prefix.'],
    };
  }
}
