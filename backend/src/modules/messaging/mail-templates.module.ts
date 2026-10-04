import { Global, Module } from '@nestjs/common';

import { MailTemplatesService } from './mail-templates.service';

/** Templates are used by auth (sign-in codes) and messaging, so they're global. */
@Global()
@Module({ providers: [MailTemplatesService], exports: [MailTemplatesService] })
export class MailTemplatesModule {}
