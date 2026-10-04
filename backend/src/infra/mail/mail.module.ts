import { Global, Module } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.service';
import { ConsoleMailProvider, MailProvider, SmtpMailProvider } from './mail.provider';

@Global()
@Module({
  providers: [{ provide: MailProvider, inject: [AppConfig], useFactory: (c: AppConfig) => (c.get('MAIL_PROVIDER') === 'smtp' ? new SmtpMailProvider(c) : new ConsoleMailProvider()) }],
  exports: [MailProvider],
})
export class MailModule {}
