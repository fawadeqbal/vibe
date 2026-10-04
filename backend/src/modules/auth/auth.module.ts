import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AppConfig } from '../../config/app-config.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { DevSocialVerifier, JwksSocialVerifier, SocialVerifier } from './providers/social-verifier';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ secret: config.get('JWT_ACCESS_SECRET'), signOptions: { issuer: 'vibe' }, verifyOptions: { issuer: 'vibe' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    { provide: SocialVerifier, inject: [AppConfig], useFactory: (c: AppConfig) => (c.get('SOCIAL_VERIFIER') === 'jwks' ? new JwksSocialVerifier(c) : new DevSocialVerifier()) },
  ],
  exports: [TokenService],
})
export class AuthModule {}
