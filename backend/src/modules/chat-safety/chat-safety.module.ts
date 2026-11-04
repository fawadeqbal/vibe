import { Module } from '@nestjs/common';

import { ChatSafetyService } from './chat-safety.service';

/** Contact details in chat text (see ChatSafetyService). Used by friend chats and random calls. */
@Module({ providers: [ChatSafetyService], exports: [ChatSafetyService] })
export class ChatSafetyModule {}
