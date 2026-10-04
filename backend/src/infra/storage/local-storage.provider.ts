import { Injectable } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

import { AppConfig } from '../../config/app-config.service';
import { StorageProvider } from './storage.provider';

/** Writes to disk and serves from `/media` (dev, single instance). */
@Injectable()
export class LocalStorageProvider extends StorageProvider {
  constructor(private readonly config: AppConfig) {
    super();
  }

  private path(key: string): string {
    const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    return join(this.config.get('UPLOAD_DIR'), safe);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<string> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    return `${this.config.get('PUBLIC_URL')}/media/${key}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
