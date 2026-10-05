import { Global, Module } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.service';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageProvider } from './storage.provider';

/** STORAGE_DRIVER picks the implementation; everything else depends on StorageProvider only. */
@Global()
@Module({
  providers: [{ provide: StorageProvider, inject: [AppConfig], useFactory: (c: AppConfig) => (c.get('STORAGE_DRIVER') === 's3' ? new S3StorageProvider(c) : new LocalStorageProvider(c)) }],
  exports: [StorageProvider],
})
export class StorageModule {}
