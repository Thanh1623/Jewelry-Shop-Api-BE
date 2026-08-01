import { Module } from '@nestjs/common';

import { CartModule } from '../cart/cart.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [CartModule, PaymentModule],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
