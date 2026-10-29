import { Module } from '@nestjs/common';

import { SocialModule } from '../social/social.module';
import { WavesController } from './waves.controller';
import { WavesService } from './waves.service';

/** "Recently here" and waves. Matching uses WavesService to pair people who waved first. */
@Module({
  imports: [SocialModule],
  controllers: [WavesController],
  providers: [WavesService],
  exports: [WavesService],
})
export class WavesModule {}
