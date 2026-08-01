import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayloadUser } from '../common/interfaces/jwt-payload.interface';
import { OrderService } from './order.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  listMine(@CurrentUser() user: JwtPayloadUser) {
    return this.orderService.listMine(user.sub);
  }

  @Get(':id')
  getMine(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.getMine(user.sub, id);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: JwtPayloadUser) {
    return this.orderService.checkout(user.sub);
  }

  @Post(':id/pay-demo')
  @HttpCode(HttpStatus.OK)
  payDemo(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.payDemo(user.sub, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.cancel(user.sub, id);
  }
}
