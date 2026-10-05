import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AppConfig } from '../../config/app-config.service';
import { UsersModule } from '../users/users.module';
import { AuthController, IdentitiesController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { IdentityService } from './identity/identity.service';
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
  controllers: [AuthController, IdentitiesController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    IdentityService,
  ],
  exports: [TokenService],
})
export class AuthModule {}
