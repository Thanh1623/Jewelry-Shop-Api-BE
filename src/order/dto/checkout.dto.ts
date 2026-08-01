import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

export class CheckoutDto {
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
