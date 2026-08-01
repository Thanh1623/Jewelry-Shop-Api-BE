import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface DemoPaymentResult {
  success: boolean;
  paymentRef: string;
  provider: 'DEMO';
  message: string;
}

/**
 * Stub payment gateway — always succeeds after a tiny delay.
 * Swap this for a real provider (VNPay/MoMo/Stripe) later.
 */
@Injectable()
export class DemoPaymentProvider {
  private readonly logger = new Logger(DemoPaymentProvider.name);

  async charge(input: {
    orderId: string;
    amount: number;
  }): Promise<DemoPaymentResult> {
    // ponytail: fake latency; real gateway would call HTTP API here
    await new Promise((resolve) => setTimeout(resolve, 300));

    const paymentRef = `DEMO-${input.orderId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    this.logger.log(
      `Demo charge OK order=${input.orderId} amount=${input.amount} ref=${paymentRef}`,
    );

    return {
      success: true,
      paymentRef,
      provider: 'DEMO',
      message: 'Thanh toán demo thành công. Thay bằng cổng thật khi sẵn sàng.',
    };
  }
}
