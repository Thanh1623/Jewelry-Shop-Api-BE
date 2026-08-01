import { Module } from '@nestjs/common';

import { DemoPaymentProvider } from './demo-payment.provider';

@Module({
  providers: [DemoPaymentProvider],
  exports: [DemoPaymentProvider],
})
export class PaymentModule {}
