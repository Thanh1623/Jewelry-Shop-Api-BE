import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from '@prisma/client';

import { calculateJewelryPrice } from '../advisor/pricing.rules';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.configService.get<string>('SEED_DEMO') !== 'true') {
      return;
    }
    await this.seedProducts();
    await this.syncSeedImages();
  }

  async findAllActive(): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAllAdmin(): Promise<Product[]> {
    return this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const existing = await this.prisma.product.findUnique({
      where: { sku: dto.sku },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('SKU đã tồn tại.');
    }

    return this.prisma.product.create({
      data: {
        sku: dto.sku.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        weightGrams: dto.weightGrams,
        laborCost: Math.round(dto.laborCost),
        baseSize: dto.baseSize ?? 6,
        sizeDeltaGrams: dto.sizeDeltaGrams ?? 0.15,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.findById(id);

    if (dto.sku) {
      const conflict = await this.prisma.product.findFirst({
        where: { sku: dto.sku, NOT: { id } },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException('SKU đã tồn tại.');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.imageUrl !== undefined
          ? { imageUrl: dto.imageUrl.trim() || null }
          : {}),
        ...(dto.weightGrams !== undefined
          ? { weightGrams: dto.weightGrams }
          : {}),
        ...(dto.laborCost !== undefined
          ? { laborCost: Math.round(dto.laborCost) }
          : {}),
        ...(dto.baseSize !== undefined ? { baseSize: dto.baseSize } : {}),
        ...(dto.sizeDeltaGrams !== undefined
          ? { sizeDeltaGrams: dto.sizeDeltaGrams }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async softDelete(id: string): Promise<Product> {
    await this.findById(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Estimate list unit price for cart/checkout (base size). */
  estimateUnitPrice(product: Product): number {
    const silverPricePerGram = Number(
      this.configService.get<string>('SILVER_PRICE_PER_GRAM', '28000'),
    );
    const marginRate = Number(
      this.configService.get<string>('DEFAULT_MARGIN_RATE', '0.25'),
    );
    return calculateJewelryPrice({
      weightGrams: product.weightGrams,
      laborCost: product.laborCost,
      baseSize: product.baseSize,
      sizeDeltaGrams: product.sizeDeltaGrams,
      silverPricePerGram,
      marginRate,
    }).totalPrice;
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
