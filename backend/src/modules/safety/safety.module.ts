import { Module } from '@nestjs/common';

import { ImageSafetyService } from './image-safety.service';
import { PhotoSweeperService } from './photo-sweeper.service';

/** Photo safety: every upload (ImageSafetyService) and every photo already up (PhotoSweeperService). */
@Module({ providers: [ImageSafetyService, PhotoSweeperService], exports: [ImageSafetyService, PhotoSweeperService] })
export class SafetyModule {}
