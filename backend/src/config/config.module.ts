import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { AppConfig } from './app-config.service';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv })],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigModule {}
