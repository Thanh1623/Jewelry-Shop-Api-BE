import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Product } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const SEED_PRODUCTS: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    sku: 'RING-SLV-001',
    name: 'Nhẫn bạc trơn Ý',
    description:
      'Nhẫn bạc 925 trơn, kiểu dáng tối giản, phù hợp đeo hàng ngày.',
    imageUrl:
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&q=80',
    weightGrams: 3.2,
    laborCost: 120_000,
    baseSize: 6,
    sizeDeltaGrams: 0.15,
    isActive: true,
  },
  {
    sku: 'RING-SLV-002',
    name: 'Nhẫn bạc đính đá Cubic Zirconia',
    description: 'Nhẫn bạc 925 đính đá CZ lấp lánh, thiết kế thanh lịch.',
    imageUrl:
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80',
    weightGrams: 4.1,
    laborCost: 180_000,
    baseSize: 6,
    sizeDeltaGrams: 0.18,
    isActive: true,
  },
  {
    sku: 'NECK-SLV-001',
    name: 'Dây chuyền bạc mặt trái tim',
    description: 'Dây chuyền bạc 925 mặt trái tim, dài 45cm, quà tặng ý nghĩa.',
    imageUrl:
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80',
    weightGrams: 8.5,
    laborCost: 220_000,
    baseSize: 6,
    sizeDeltaGrams: 0.15,
    isActive: true,
  },
  {
    sku: 'BRAC-SLV-001',
    name: 'Vòng tay bạc mắt xích Ý',
    description: 'Vòng tay bạc 925 mắt xích Ý chắc chắn, phong cách unisex.',
    imageUrl:
      'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80',
    weightGrams: 12.0,
    laborCost: 250_000,
    baseSize: 6,
    sizeDeltaGrams: 0.2,
    isActive: true,
  },
  {
    sku: 'EAR-SLV-001',
    name: 'Bông tai bạc ngọc trai',
    description: 'Bông tai bạc 925 đính ngọc trai nhân tạo, nhẹ nhàng nữ tính.',
    imageUrl:
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80',
    weightGrams: 2.4,
    laborCost: 100_000,
    baseSize: 6,
    sizeDeltaGrams: 0.1,
    isActive: true,
  },
];

@Injectable()
export class ProductService implements OnModuleInit {
  private readonly logger = new Logger(ProductService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedProducts();
    await this.syncSeedImages();
  }

  async findAllActive(): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    return product;
  }

  private async seedProducts(): Promise<void> {
    const productCount = await this.prisma.product.count();
    if (productCount > 0) {
      return;
    }

    await this.prisma.product.createMany({ data: SEED_PRODUCTS });
    this.logger.log(
      `Seeded ${SEED_PRODUCTS.length} demo silver jewelry products.`,
    );
  }

  // ponytail: fix broken seed image URLs on already-seeded DBs without migrate reset
  private async syncSeedImages(): Promise<void> {
    for (const seed of SEED_PRODUCTS) {
      await this.prisma.product.updateMany({
        where: { sku: seed.sku, NOT: { imageUrl: seed.imageUrl } },
        data: { imageUrl: seed.imageUrl },
      });
    }
  }
}
