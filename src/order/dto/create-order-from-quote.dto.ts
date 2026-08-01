import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateOrderFromQuoteDto {
  @IsUUID()
  messageId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shippingName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  shippingPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string;
}
