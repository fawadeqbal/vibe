import { Global, Module } from '@nestjs/common';

import { MailProvider, SmtpMailProvider } from './mail.provider';
import { SmtpSettingsService } from './smtp-settings.service';

/**
 * E-mail: SMTP with the settings saved in Admin → Settings → E-mail sending
 * (the SMTP_* environment is a fallback); printed to the log in development
 * when neither is set.
 */
@Global()
@Module({
  providers: [SmtpSettingsService, SmtpMailProvider, { provide: MailProvider, useExisting: SmtpMailProvider }],
  exports: [MailProvider, SmtpSettingsService],
})
export class MailModule {}
