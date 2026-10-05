import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, ProductType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  productType!: ProductType;

  @ApiProperty({ example: 'value', description: 'Coin pack id or VIP plan id from /catalog' })
  @IsString()
  @Length(1, 40)
  productId!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Google Play purchase token / App Store transaction id' })
  @IsOptional()
  @IsString()
  @Length(1, 4096)
  receipt?: string;

  @ApiPropertyOptional({ example: '03001234567', description: 'JazzCash / Easypaisa number' })
  @IsOptional()
  @Matches(/^\+?\d{10,13}$/, { message: 'Enter the full wallet number' })
  phone?: string;

  @ApiPropertyOptional({ example: '123456', description: 'Last 6 digits of the CNIC (JazzCash wallet payments)' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Enter the last 6 digits of your CNIC' })
  cnicLast6?: string;

  @ApiPropertyOptional({ description: 'Deep link the hosted payment page returns to (defaults to PAYMENT_RETURN_URL)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^(vibe|https):\/\//, { message: 'Return URL must be vibe:// or https://' })
  returnUrl?: string;

  /** @deprecated Cards now use the gateway's hosted page; ignored. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  cardToken?: string;
}

export class ConfirmPurchaseDto {
  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4,6}$/)
  otp!: string;
}

export class BankReferenceDto {
  @ApiProperty({ example: 'FT24123ABC', description: 'Reference / transaction id from your bank app' })
  @IsString()
  @Length(3, 60)
  reference!: string;
}
