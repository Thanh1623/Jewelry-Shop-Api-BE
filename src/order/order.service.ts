import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageSender, OrderStatus, Prisma } from '@prisma/client';

import { CartService } from '../cart/cart.service';
import { DemoPaymentProvider } from '../payment/demo-payment.provider';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateOrderFromQuoteDto } from './dto/create-order-from-quote.dto';

const orderInclude = {
  items: true,
  user: { select: { id: true, fullName: true, email: true, phone: true } },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

interface QuoteMeta {
  type: 'quote';
  productId: string;
  productName?: string;
  unitPrice: number;
  quantity: number;
  size?: number;
  note?: string;
}

const FULFILLMENT_FLOW: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY,
  OrderStatus.DELIVERED,
];

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

  async listAll(): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
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

  async getById(orderId: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    return order;
  }

  /** Create PENDING order from current cart (does not clear cart until paid). */
  async checkout(
    userId: string,
    shipping?: CheckoutDto,
  ): Promise<OrderWithItems> {
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
        shippingName: shipping?.shippingName?.trim() || null,
        shippingPhone: shipping?.shippingPhone?.trim() || null,
        shippingAddress: shipping?.shippingAddress?.trim() || null,
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

  async createFromQuote(
    userId: string,
    dto: CreateOrderFromQuoteDto,
  ): Promise<OrderWithItems> {
    const existing = await this.prisma.order.findUnique({
      where: { quoteMessageId: dto.messageId },
      include: orderInclude,
    });
    if (existing) {
      if (existing.userId !== userId) {
        throw new ConflictException('Báo giá này đã được dùng.');
      }
      return existing;
    }

    const message = await this.prisma.chatMessage.findUnique({
      where: { id: dto.messageId },
      include: {
        session: { select: { customerId: true } },
      },
    });
    if (!message || message.sender !== MessageSender.SALE) {
      throw new BadRequestException('Tin báo giá không hợp lệ.');
    }
    if (
      message.session.customerId &&
      message.session.customerId !== userId
    ) {
      throw new BadRequestException('Báo giá không thuộc phiên của bạn.');
    }

    const quote = this.parseQuoteMeta(message.metaJson);
    if (!quote) {
      throw new BadRequestException('Tin nhắn không phải báo giá.');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: quote.productId },
    });
    if (!product) {
      throw new NotFoundException('Sản phẩm trong báo giá không tồn tại.');
    }

    const totalAmount = quote.unitPrice * quote.quantity;
    const productName =
      quote.productName ||
      (quote.size
        ? `${product.name} (size ${quote.size})`
        : product.name);

    try {
      return await this.prisma.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING_PAYMENT,
          totalAmount,
          paymentProvider: 'DEMO',
          quoteMessageId: dto.messageId,
          shippingName: dto.shippingName?.trim() || null,
          shippingPhone: dto.shippingPhone?.trim() || null,
          shippingAddress: dto.shippingAddress?.trim() || null,
          items: {
            create: [
              {
                productId: product.id,
                productName,
                unitPrice: quote.unitPrice,
                quantity: quote.quantity,
              },
            ],
          },
        },
        include: orderInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.order.findUnique({
          where: { quoteMessageId: dto.messageId },
          include: orderInclude,
        });
        if (again) return again;
      }
      throw error;
    }
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

    return this.prisma.$transaction(async (tx) => {
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

  async updateStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderWithItems> {
    const order = await this.getById(orderId);
    if (status === OrderStatus.CANCELLED) {
      if (
        order.status !== OrderStatus.PENDING_PAYMENT &&
        order.status !== OrderStatus.PAID &&
        order.status !== OrderStatus.PROCESSING
      ) {
        throw new BadRequestException('Không hủy được đơn ở trạng thái này.');
      }
    } else if (FULFILLMENT_FLOW.includes(status)) {
      const currentIdx = FULFILLMENT_FLOW.indexOf(order.status);
      const nextIdx = FULFILLMENT_FLOW.indexOf(status);
      if (currentIdx < 0 || nextIdx !== currentIdx + 1) {
        throw new BadRequestException(
          'Chỉ chuyển tiếp: Đã thanh toán → Đang làm → Sẵn sàng → Đã giao.',
        );
      }
    } else {
      throw new BadRequestException('Trạng thái không hợp lệ.');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: orderInclude,
    });
  }

  private parseQuoteMeta(metaJson: Prisma.JsonValue | null): QuoteMeta | null {
    if (!metaJson || typeof metaJson !== 'object' || Array.isArray(metaJson)) {
      return null;
    }
    const meta = metaJson as Record<string, unknown>;
    if (meta.type !== 'quote') return null;
    if (typeof meta.productId !== 'string') return null;
    if (typeof meta.unitPrice !== 'number' || meta.unitPrice < 1) return null;
    if (typeof meta.quantity !== 'number' || meta.quantity < 1) return null;
    return {
      type: 'quote',
      productId: meta.productId,
      productName:
        typeof meta.productName === 'string' ? meta.productName : undefined,
      unitPrice: Math.round(meta.unitPrice),
      quantity: Math.round(meta.quantity),
      size: typeof meta.size === 'number' ? meta.size : undefined,
      note: typeof meta.note === 'string' ? meta.note : undefined,
    };
  }
}
