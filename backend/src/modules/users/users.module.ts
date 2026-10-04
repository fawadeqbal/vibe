import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { LastSeenListener } from './last-seen.listener';
import { DevVerificationProvider, VerificationProvider } from './providers/verification.provider';
import { MeController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [WalletModule],
  controllers: [MeController, UsersController],
  providers: [UsersService, LastSeenListener, { provide: VerificationProvider, useClass: DevVerificationProvider }],
  exports: [UsersService],
})
export class UsersModule {}
