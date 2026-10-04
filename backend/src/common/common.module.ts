import { Global, Module } from '@nestjs/common';

import { Clock } from './utils/clock';

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class CommonModule {}
