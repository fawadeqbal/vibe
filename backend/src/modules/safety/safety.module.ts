import { Module } from '@nestjs/common';

import { ImageSafetyService } from './image-safety.service';

/** Photo safety (see ImageSafetyService). Used by friend chats, Moments and profile photos. */
@Module({ providers: [ImageSafetyService], exports: [ImageSafetyService] })
export class SafetyModule {}
