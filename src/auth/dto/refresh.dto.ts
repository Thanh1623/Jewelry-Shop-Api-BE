import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(20, { message: 'Refresh token không hợp lệ.' })
  refreshToken!: string;
}
