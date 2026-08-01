import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ProductService } from '../product/product.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

export interface CartLineResponse {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product: {
    id: string;
    sku: string;
    name: string;
    imageUrl: string | null;
    weightGrams: number;
    laborCost: number;
  };
}

export interface CartResponse {
  items: CartLineResponse[];
  totalAmount: number;
  itemCount: number;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productService: ProductService,
  ) {}

  async getCart(userId: string): Promise<CartResponse> {
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });

    const lines: CartLineResponse[] = items
      .filter((item) => item.product.isActive)
      .map((item) => {
        const unitPrice = this.productService.estimateUnitPrice(item.product);
        return {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          lineTotal: unitPrice * item.quantity,
          product: {
            id: item.product.id,
            sku: item.product.sku,
            name: item.product.name,
            imageUrl: item.product.imageUrl,
            weightGrams: item.product.weightGrams,
            laborCost: item.product.laborCost,
          },
        };
      });

    return {
      items: lines,
      totalAmount: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }

  async upsertItem(
    userId: string,
    dto: UpsertCartItemDto,
  ): Promise<CartResponse> {
    const product = await this.productService.findById(dto.productId);
    if (!product.isActive) {
      throw new BadRequestException('Sản phẩm không còn bán.');
    }

    await this.prisma.cartItem.upsert({
      where: {
        userId_productId: { userId, productId: dto.productId },
      },
      create: {
        userId,
        productId: dto.productId,
        quantity: dto.quantity,
      },
      update: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  async updateQuantity(
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartResponse> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
    });
    if (!item) {
      throw new NotFoundException('Không tìm thấy mục giỏ hàng.');
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponse> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
    });
    if (!item) {
      throw new NotFoundException('Không tìm thấy mục giỏ hàng.');
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<CartResponse> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
    return this.getCart(userId);
  }
}
