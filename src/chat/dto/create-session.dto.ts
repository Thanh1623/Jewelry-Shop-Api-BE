import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên khách hàng phải có ít nhất 2 ký tự.' })
  guestName?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;
}
