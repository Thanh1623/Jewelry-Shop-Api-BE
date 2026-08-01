import { UserRole } from '@prisma/client';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự.' })
  password!: string;

  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự.' })
  fullName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]{8,20}$/, {
    message: 'Số điện thoại không hợp lệ.',
  })
  phone?: string;
}

/** Public register luôn tạo CUSTOMER — role SALE chỉ seed/admin. */
export const PUBLIC_REGISTER_ROLE = UserRole.CUSTOMER;
