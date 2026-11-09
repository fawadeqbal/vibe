import { Global, Module } from '@nestjs/common';

import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

@Global()
@Module({ controllers: [LegalController], providers: [LegalService], exports: [LegalService] })
export class LegalModule {}
