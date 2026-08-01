import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { JwtPayloadUser } from '../common/interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse, AuthUserResponse } from './mappers/auth-response.mapper';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public() // Bỏ qua JwtAuthGuard — ai cũng gọi được
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK) // Login trả 200 (POST mặc định là 201)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @ApiBearerAuth() // Swagger hiện nút Authorize cho /me để user có thể test API
  @Get('me')
  // @CurrentUser() Lấy request.user từ Guard — không parse JWT thủ công
  getMe(@CurrentUser() user: JwtPayloadUser): Promise<AuthUserResponse> {
    return this.authService.getMe(user.sub);
  }
}
