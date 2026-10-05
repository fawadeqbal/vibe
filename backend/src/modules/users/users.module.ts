import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { LastSeenListener } from './last-seen.listener';
import { VerificationService } from './verification/verification.service';
import { MeController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [WalletModule],
  controllers: [MeController, UsersController],
  providers: [UsersService, LastSeenListener, VerificationService],
  exports: [UsersService, VerificationService],
})
export class UsersModule {}
