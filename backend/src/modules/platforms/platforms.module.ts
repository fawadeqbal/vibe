import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ClientActivityInterceptor } from './client-activity.interceptor';
import { PlatformsService } from './platforms.service';

/** App vs web: sign-ups and daily use by client, and APK downloads. */
@Global()
@Module({
  providers: [PlatformsService, { provide: APP_INTERCEPTOR, useClass: ClientActivityInterceptor }],
  exports: [PlatformsService],
})
export class PlatformsModule {}
