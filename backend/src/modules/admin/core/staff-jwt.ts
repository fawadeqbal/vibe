import { JwtService } from '@nestjs/jwt';

import { AppConfig } from '../../../config/app-config.service';

/**
 * JWT signer/verifier for staff tokens: its own secret, issuer and audience,
 * so an app token can never be used against the admin API (and vice versa).
 */
export class StaffJwt extends JwtService {}

export const staffJwtProvider = {
  provide: StaffJwt,
  inject: [AppConfig],
  useFactory: (config: AppConfig) =>
    new StaffJwt({
      secret: config.staffJwtSecret,
      signOptions: { issuer: 'vibe-admin', audience: 'staff' },
      verifyOptions: { issuer: 'vibe-admin', audience: 'staff' },
    }),
};
