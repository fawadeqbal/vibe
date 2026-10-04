import { Global, Module } from '@nestjs/common';

import { LocalStorageProvider } from './local-storage.provider';
import { StorageProvider } from './storage.provider';

@Global()
@Module({ providers: [{ provide: StorageProvider, useClass: LocalStorageProvider }], exports: [StorageProvider] })
export class StorageModule {}
