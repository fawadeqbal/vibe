import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class AdRewardDto {
  @ApiProperty({ description: 'AdMob SSV transaction id (dev: any non-empty string, unique per view)' })
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

  @ApiProperty({ enum: [PaymentMethod.JAZZCASH, PaymentMethod.EASYPAISA, PaymentMethod.BANK] })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ example: '03001234567', description: 'Wallet number or IBAN' })
  @IsString()
  @Matches(/^[A-Za-z0-9 +]{6,34}$/, { message: 'account must be a phone number or IBAN' })
  account!: string;
}
