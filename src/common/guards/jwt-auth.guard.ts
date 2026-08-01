import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayloadUser } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector, // Reflector là một service của NestJS để lấy metadata từ decorator
    private readonly jwtService: JwtService, // JwtService là một service của NestJS để verify JWT
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Route có @Public()? → cho qua
    // 2. Lấy Authorization header
    // 3. Không có token → 401
    // 4. verifyAsync → gắn request.user → return true
    // 5. verify fail → 401
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayloadUser }>();
    // request này sẽ trả ra Bearer + token thôi đúng không?
    // đúng, request này sẽ trả ra Bearer + token
    // Vậy sao phải & { user?: JwtPayloadUser }?
    // để gán payload vào request.user
    // request.user là JwtPayloadUser
    // JwtPayloadUser là interface chứa thông tin của user
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(
        'Bạn cần đăng nhập để thực hiện thao tác này.',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayloadUser>(token);
      /**
       * Gán payload vào request.user để sử dụng trong controller
       */
      request.user = payload;
      /**
       * Trả về true để cho phép request đi tiếp
       */
      return true;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn.');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
