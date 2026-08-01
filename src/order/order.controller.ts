import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CheckoutDto } from './dto/checkout.dto';
import { CreateOrderFromQuoteDto } from './dto/create-order-from-quote.dto';
import { UpdateOrderStatusDto } from './dto/checkout.dto';
import { OrderService } from './order.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @Get()
  listMine(@CurrentUser() user: JwtPayloadUser) {
    return this.orderService.listMine(user.sub);
  }

  @Roles(UserRole.ADMIN, UserRole.SALE)
  @Get('admin/all')
  listAll() {
    return this.orderService.listAll();
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @Post('checkout')
  checkout(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CheckoutDto,
  ) {
    return this.orderService.checkout(user.sub, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @Post('from-quote')
  fromQuote(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateOrderFromQuoteDto,
  ) {
    return this.orderService.createFromQuote(user.sub, dto);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SALE)
  @Get(':id')
  getMine(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SALE) {
      return this.orderService.getById(id);
    }
    return this.orderService.getMine(user.sub, id);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @Post(':id/pay-demo')
  @HttpCode(HttpStatus.OK)
  payDemo(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.payDemo(user.sub, id);
  }

  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.cancel(user.sub, id);
  }

  @Roles(UserRole.ADMIN, UserRole.SALE)
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatus(id, dto.status);
  }
}
