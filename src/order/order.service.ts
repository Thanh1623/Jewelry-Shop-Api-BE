import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { CartService } from '../cart/cart.service';
import { DemoPaymentProvider } from '../payment/demo-payment.provider';
import { PrismaService } from '../prisma/prisma.service';

const orderInclude = {
  items: true,
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly demoPayment: DemoPaymentProvider,
  ) {}

  async listMine(userId: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMine(userId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    return order;
  }

  /** Create PENDING order from current cart (does not clear cart until paid). */
  async checkout(userId: string): Promise<OrderWithItems> {
    const cart = await this.cartService.getCart(userId);
    if (cart.items.length === 0) {
      throw new BadRequestException('Giỏ hàng trống.');
    }

    return this.prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING_PAYMENT,
        totalAmount: cart.totalAmount,
        paymentProvider: 'DEMO',
        items: {
          create: cart.items.map((line) => ({
            productId: line.productId,
            productName: line.product.name,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
          })),
        },
      },
      include: orderInclude,
    });
  }

  async payDemo(userId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.getMine(userId, orderId);
    if (order.status === OrderStatus.PAID) {
      return order;
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Đơn hàng không thể thanh toán.');
    }

    const result = await this.demoPayment.charge({
      orderId: order.id,
      amount: order.totalAmount,
    });

    if (!result.success) {
      return this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED },
        include: orderInclude,
      });
    }

    const paid = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentRef: result.paymentRef,
          paymentProvider: result.provider,
          paidAt: new Date(),
        },
        include: orderInclude,
      });
      await tx.cartItem.deleteMany({ where: { userId } });
      return updated;
    });

    return paid;
  }

  async cancel(userId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.getMine(userId, orderId);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Chỉ hủy được đơn chờ thanh toán.');
    }
    return this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED },
      include: orderInclude,
    });
  }
}
