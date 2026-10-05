import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

import { AppConfig } from '../../config/app-config.service';
import { Integration, IntegrationReporter, IntegrationStatus, missingKeys } from '../../integrations/core/integration.types';
import { OpenedObject, StorageProvider, StoreOptions } from './storage.provider';

/**
 * Writes to disk and serves public files from `/media` (one server only).
 * Private files go to `<UPLOAD_DIR>-private`, which is never served.
 */
@Integration()
@Injectable()
export class LocalStorageProvider extends StorageProvider implements IntegrationReporter {
  constructor(private readonly config: AppConfig) {
    super();
  }

  private path(key: string, opts?: StoreOptions): string {
    const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const root = this.config.get('UPLOAD_DIR');
    return join(opts?.private ? `${root.replace(/\/$/, '')}-private` : root, safe);
  }

  async put(key: string, data: Buffer, _contentType: string, opts?: StoreOptions): Promise<string> {
    const file = this.path(key, opts);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    return opts?.private ? key : `${this.config.get('PUBLIC_URL')}/media/${key}`;
  }

  async delete(key: string, opts?: StoreOptions): Promise<void> {
    await rm(this.path(key, opts), { force: true });
  }

  async read(key: string, opts?: StoreOptions): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key, opts));
    } catch {
      return null;
    }
  }

  /** Express's static middleware serves `/media` for this driver; this is here for completeness. */
  async open(key: string): Promise<OpenedObject | null> {
    const file = this.path(key);
    try {
      const s = await stat(file);
      return s.isFile() ? { body: createReadStream(file), contentLength: s.size, lastModified: s.mtime } : null;
    } catch {
      return null;
    }
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.config.get('PUBLIC_URL')}/media/`;
    return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
  }

  integrationStatus(): IntegrationStatus {
    return {
      key: 'storage.media',
      kind: 'storage',
      label: 'Media storage',
      mode: 'dev',
      requiredEnv: ['STORAGE_DRIVER', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
      missingEnv: ['STORAGE_DRIVER', ...missingKeys(this.config.env, ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])],
      notes: ['Local disk (one server, no CDN). Set STORAGE_DRIVER=s3 and the S3_* keys (our Garage container, AWS S3 or Cloudflare R2) to scale.'],
    };
  }
}
