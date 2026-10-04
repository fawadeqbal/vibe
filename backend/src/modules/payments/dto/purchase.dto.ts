import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, ProductType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Store purchase token / transaction id' })
  @IsOptional()
  @IsString()
  @Length(1, 4096)
  receipt?: string;

  @ApiPropertyOptional({ example: '03001234567', description: 'JazzCash / Easypaisa number' })
  @IsOptional()
  @Matches(/^\+?\d{10,13}$/, { message: 'Enter the full wallet number' })
  phone?: string;

  @ApiPropertyOptional({ description: "Card token from the gateway's client SDK" })
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
