import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { JwtPayloadUser } from '../interfaces/jwt-payload.interface';

/**
 * Decorator để lấy user từ request
 * @param _data - Dữ liệu tùy chọn
 * @param context - ExecutionContext
 * @returns JwtPayloadUser | undefined
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayloadUser | undefined => {
    /**
     * Lấy request từ context
     */
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayloadUser }>();
    /**
     * Trả về user từ request
     */
    return request.user; // request.user là JwtPayloadUser // Chỉ đọc cái Guard đã gán/ parse JWT thành JwtPayloadUser
  },
);
