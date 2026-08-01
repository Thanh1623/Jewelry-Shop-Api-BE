import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatMessage, MessageSender, Prisma } from '@prisma/client';

import {
  MessageI18nMeta,
  TranslationService,
} from '../llm/translation.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../product/product.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { TranslatePreviewDto } from './dto/translate-preview.dto';
import {
  ChatSessionSummary,
  mapSessionToSummary,
} from './mappers/chat-session.mapper';

const sessionDetailInclude = {
  product: true,
  customer: {
    select: { id: true, fullName: true, email: true, phone: true },
  },
  messages: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ChatSessionInclude;

export type ChatSessionDetail = Prisma.ChatSessionGetPayload<{
  include: typeof sessionDetailInclude;
}>;

type SystemMessageSender =
  | typeof MessageSender.AI
  | typeof MessageSender.CRAFTSMAN
  | typeof MessageSender.SYSTEM;

export interface TranslatePreviewResponse {
  sourceLocale: string;
  targetLocale: string;
  translatedText: string;
  customerLocale: string | null;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productService: ProductService,
    private readonly translationService: TranslationService,
  ) {}

  async createSession(
    dto: CreateSessionDto,
    customer: { sub: string; fullName: string },
  ): Promise<ChatSessionDetail> {
    if (dto.productId) {
      await this.productService.findById(dto.productId);
    }
    const session = await this.prisma.chatSession.create({
      data: {
        customerId: customer.sub,
        guestName: dto.guestName?.trim() || customer.fullName,
        productId: dto.productId,
      },
    });
    return this.getSessionWithMessages(session.id);
  }

  async listOpenSessions(): Promise<ChatSessionSummary[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { isOpen: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, imageUrl: true } },
        customer: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        sale: {
          select: { id: true, fullName: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, sender: true, content: true, createdAt: true },
        },
      },
    });
    return sessions.map(mapSessionToSummary);
  }

  /** Atomic claim: first sale to claim wins. */
  async claimSession(
    sessionId: string,
    saleUserId: string,
  ): Promise<ChatSessionSummary> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, isOpen: true, saleId: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }
    if (!session.isOpen) {
      throw new BadRequestException('Phiên đã đóng.');
    }
    if (session.saleId && session.saleId !== saleUserId) {
      throw new ConflictException('Phiên đã được sale khác nhận.');
    }
    if (session.saleId === saleUserId) {
      return this.getSessionSummary(sessionId);
    }

    const claimed = await this.prisma.chatSession.updateMany({
      where: { id: sessionId, saleId: null, isOpen: true },
      data: { saleId: saleUserId },
    });
    if (claimed.count === 0) {
      throw new ConflictException('Phiên đã được sale khác nhận.');
    }
    return this.getSessionSummary(sessionId);
  }

  async releaseSession(
    sessionId: string,
    saleUserId: string,
  ): Promise<ChatSessionSummary> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, saleId: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }
    if (session.saleId !== saleUserId) {
      throw new BadRequestException('Chỉ sale đang nhận phiên mới được trả lại.');
    }
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { saleId: null },
    });
    return this.getSessionSummary(sessionId);
  }

  private async getSessionSummary(sessionId: string): Promise<ChatSessionSummary> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        product: { select: { id: true, name: true, imageUrl: true } },
        customer: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        sale: {
          select: { id: true, fullName: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, sender: true, content: true, createdAt: true },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }
    return mapSessionToSummary(session);
  }

  async getSessionWithMessages(sessionId: string): Promise<ChatSessionDetail> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: sessionDetailInclude,
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }
    return session;
  }

  async postMessage(
    sessionId: string,
    dto: SendMessageDto,
  ): Promise<ChatMessage> {
    const content =
      dto.content?.trim() ||
      (dto.imageUrl ? '[Ảnh đính kèm]' : '');
    if (!content) {
      throw new BadRequestException('Nội dung tin nhắn không được để trống.');
    }

    if (dto.sender === MessageSender.CUSTOMER) {
      return this.postCustomerMessage(sessionId, content, dto.imageUrl);
    }
    return this.postSaleMessage(sessionId, content, dto.imageUrl);
  }

  async previewSaleTranslation(
    sessionId: string,
    dto: TranslatePreviewDto,
  ): Promise<TranslatePreviewResponse> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, customerLocale: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }

    const customerLocale =
      session.customerLocale ??
      this.translationService.getDefaultCustomerLocale();
    const result = await this.translationService.translateToCustomer(
      dto.text,
      customerLocale,
    );

    if (!result) {
      return {
        sourceLocale: this.translationService.getSaleLocale(),
        targetLocale: customerLocale,
        translatedText: dto.text,
        customerLocale: session.customerLocale,
      };
    }

    return {
      sourceLocale: result.sourceLocale,
      targetLocale: result.targetLocale,
      translatedText: result.translatedText,
      customerLocale: session.customerLocale,
    };
  }

  async createSystemMessage(
    sessionId: string,
    sender: SystemMessageSender,
    content: string,
    metaJson?: Prisma.InputJsonValue,
  ): Promise<ChatMessage> {
    return this.createMessage(sessionId, sender, content, metaJson);
  }

  /** Sale → AI / thợ: hiện trong lane nội bộ, không lộ sang khách. */
  async createInternalSaleMessage(
    sessionId: string,
    content: string,
    options: {
      internalLane: 'AI' | 'CRAFTSMAN';
      imageUrl?: string | null;
    },
  ): Promise<ChatMessage> {
    const trimmed = content.trim();
    const text =
      trimmed ||
      (options.imageUrl ? '[Ảnh đính kèm]' : '');
    if (!text) {
      throw new BadRequestException('Nội dung tin nhắn không được để trống.');
    }

    const metaJson = {
      internalLane: options.internalLane,
      ...(options.imageUrl ? { imageUrl: options.imageUrl } : {}),
    } as unknown as Prisma.InputJsonValue;

    return this.createMessage(
      sessionId,
      MessageSender.SALE,
      text,
      metaJson,
    );
  }

  /** Public SALE quote visible to customer (accept → order). */
  async createQuoteMessage(
    sessionId: string,
    dto: {
      productId: string;
      unitPrice: number;
      quantity: number;
      size?: number;
      note?: string;
    },
  ): Promise<ChatMessage> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, productId: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }

    const product = await this.productService.findById(dto.productId);
    if (!product.isActive) {
      throw new BadRequestException('Sản phẩm không còn bán.');
    }

    const unitPrice = Math.round(dto.unitPrice);
    const quantity = dto.quantity;
    const lineTotal = unitPrice * quantity;
    const sizePart = dto.size ? ` · size ${dto.size}` : '';
    const notePart = dto.note?.trim() ? `\nGhi chú: ${dto.note.trim()}` : '';
    const content = `Báo giá: ${product.name}${sizePart}\n${unitPrice.toLocaleString('vi-VN')}đ × ${quantity} = ${lineTotal.toLocaleString('vi-VN')}đ${notePart}`;

    const metaJson = {
      type: 'quote',
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity,
      ...(dto.size !== undefined ? { size: dto.size } : {}),
      ...(dto.note?.trim() ? { note: dto.note.trim() } : {}),
    } as unknown as Prisma.InputJsonValue;

    return this.createMessage(
      sessionId,
      MessageSender.SALE,
      content,
      metaJson,
    );
  }

  async getLastCustomerMessage(sessionId: string): Promise<ChatMessage | null> {
    return this.prisma.chatMessage.findFirst({
      where: { sessionId, sender: MessageSender.CUSTOMER },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async postCustomerMessage(
    sessionId: string,
    content: string,
    imageUrl?: string,
  ): Promise<ChatMessage> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, customerLocale: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }

    const meta: Record<string, unknown> = {};
    if (imageUrl) {
      meta.imageUrl = imageUrl;
    }

    // skip translation for image-only placeholder
    if (content !== '[Ảnh đính kèm]') {
      const translation = await this.translationService.detectAndTranslateToSale(
        content,
        session.customerLocale,
      );

      if (translation) {
        meta.i18n = {
          sourceLocale: translation.sourceLocale,
          targetLocale: translation.targetLocale,
          translatedText: translation.translatedText,
        } satisfies MessageI18nMeta;

        if (!session.customerLocale) {
          await this.prisma.chatSession.update({
            where: { id: sessionId },
            data: { customerLocale: translation.sourceLocale },
          });
        }
      }
    }

    return this.createMessage(
      sessionId,
      MessageSender.CUSTOMER,
      content,
      Object.keys(meta).length > 0
        ? (meta as unknown as Prisma.InputJsonValue)
        : undefined,
    );
  }

  private async postSaleMessage(
    sessionId: string,
    content: string,
    imageUrl?: string,
  ): Promise<ChatMessage> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, customerLocale: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }

    const meta: Record<string, unknown> = {};
    if (imageUrl) {
      meta.imageUrl = imageUrl;
    }

    if (content === '[Ảnh đính kèm]') {
      return this.createMessage(
        sessionId,
        MessageSender.SALE,
        content,
        meta as unknown as Prisma.InputJsonValue,
      );
    }

    const customerLocale =
      session.customerLocale ??
      this.translationService.getDefaultCustomerLocale();
    const translation = await this.translationService.translateToCustomer(
      content,
      customerLocale,
    );

    if (!translation) {
      return this.createMessage(
        sessionId,
        MessageSender.SALE,
        content,
        Object.keys(meta).length > 0
          ? (meta as unknown as Prisma.InputJsonValue)
          : undefined,
      );
    }

    meta.i18n = {
      sourceLocale: translation.sourceLocale,
      targetLocale: translation.targetLocale,
      originalText: content,
    } satisfies MessageI18nMeta;

    // Customer sees translated content; sale UI can show originalText from meta
    return this.createMessage(
      sessionId,
      MessageSender.SALE,
      translation.translatedText,
      meta as unknown as Prisma.InputJsonValue,
    );
  }

  private async createMessage(
    sessionId: string,
    sender: MessageSender,
    content: string,
    metaJson?: Prisma.InputJsonValue,
  ): Promise<ChatMessage> {
    await this.assertSessionExists(sessionId);
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { sessionId, sender, content, metaJson },
      }),
      this.prisma.chatSession.update({
        where: { id: sessionId },
        data: {},
      }),
    ]);
    return message;
  }

  private async assertSessionExists(sessionId: string): Promise<void> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }
  }
}
