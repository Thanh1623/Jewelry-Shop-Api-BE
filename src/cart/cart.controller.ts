import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayloadUser } from '../common/interfaces/jwt-payload.interface';
import { CartService, CartResponse } from './cart.service';
import { UpdateCartQuantityDto } from './dto/update-cart-quantity.dto';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

@ApiTags('Cart')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: JwtPayloadUser): Promise<CartResponse> {
    return this.cartService.getCart(user.sub);
  }

  @Post('items')
  upsertItem(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpsertCartItemDto,
  ): Promise<CartResponse> {
    return this.cartService.upsertItem(user.sub, dto);
  }

  @Patch('items/:id')
  updateQuantity(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartQuantityDto,
  ): Promise<CartResponse> {
    return this.cartService.updateQuantity(user.sub, id, dto.quantity);
  }

  @Delete('items/:id')
  removeItem(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CartResponse> {
    return this.cartService.removeItem(user.sub, id);
  }

  @Delete()
  clear(@CurrentUser() user: JwtPayloadUser): Promise<CartResponse> {
    return this.cartService.clear(user.sub);
  }
}
