import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class AdRewardDto {
  @ApiProperty({ description: 'The nonce the app put in AdMob ServerSideVerificationOptions.customData for this view (dev: any unique string)' })
  @IsString()
  @Length(1, 200)
  adToken!: string;
}

export class CashoutDto {
  @ApiPropertyOptional({ description: 'Defaults to the whole balance' })
  @IsOptional()
  @IsInt()
  @Min(1)
  gems?: number;

  @ApiPropertyOptional({ description: 'A saved payout account (GET /wallet/payout-accounts). Without it, the default account or the method + account below.' })
  @IsOptional()
  @IsString()
  @Length(10, 40)
  payoutAccountId?: string;

  @ApiPropertyOptional({ enum: [PaymentMethod.JAZZCASH, PaymentMethod.EASYPAISA, PaymentMethod.BANK] })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: '03001234567', description: 'Wallet number or IBAN (saved as a payout account)' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9 +]{6,40}$/, { message: 'account must be a phone number or IBAN' })
  account?: string;

  @ApiPropertyOptional({ description: 'Account holder name (defaults to your profile name)' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  holderName?: string;

  @ApiPropertyOptional({ description: 'Bank name (bank accounts)' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  bankName?: string;
}

export class PayoutAccountDto {
  @ApiProperty({ enum: [PaymentMethod.JAZZCASH, PaymentMethod.EASYPAISA, PaymentMethod.BANK] })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ example: '03001234567', description: 'Wallet number, or IBAN for bank accounts' })
  @IsString()
  @Matches(/^[A-Za-z0-9 +]{6,40}$/, { message: 'Enter a wallet number or IBAN' })
  account!: string;

  @ApiProperty({ example: 'Sara Khan', description: 'Name on the account' })
  @IsString()
  @Length(2, 80)
  holderName!: string;

  @ApiPropertyOptional({ example: 'Meezan Bank' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  bankName?: string;

  @ApiPropertyOptional({ description: 'CNIC (13 digits), when the payout rail asks for it' })
  @IsOptional()
  @Matches(/^\d{5}-?\d{7}-?\d$/, { message: 'CNIC looks like 35202-1234567-1' })
  cnic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  makeDefault?: boolean;
}
