import { Injectable, NotFoundException } from '@nestjs/common';
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
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, sender: true, content: true, createdAt: true },
        },
      },
    });
    return sessions.map(mapSessionToSummary);
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
    if (dto.sender === MessageSender.CUSTOMER) {
      return this.postCustomerMessage(sessionId, dto.content);
    }
    return this.postSaleMessage(sessionId, dto.content);
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

  async getLastCustomerMessage(sessionId: string): Promise<ChatMessage | null> {
    return this.prisma.chatMessage.findFirst({
      where: { sessionId, sender: MessageSender.CUSTOMER },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async postCustomerMessage(
    sessionId: string,
    content: string,
  ): Promise<ChatMessage> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, customerLocale: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trò chuyện.');
    }

    const translation = await this.translationService.detectAndTranslateToSale(
      content,
      session.customerLocale,
    );

    let metaJson: Prisma.InputJsonValue | undefined;
    if (translation) {
      const i18n: MessageI18nMeta = {
        sourceLocale: translation.sourceLocale,
        targetLocale: translation.targetLocale,
        translatedText: translation.translatedText,
      };
      metaJson = { i18n } as unknown as Prisma.InputJsonValue;

      if (!session.customerLocale) {
        await this.prisma.chatSession.update({
          where: { id: sessionId },
          data: { customerLocale: translation.sourceLocale },
        });
      }
    }

    return this.createMessage(
      sessionId,
      MessageSender.CUSTOMER,
      content,
      metaJson,
    );
  }

  private async postSaleMessage(
    sessionId: string,
    content: string,
  ): Promise<ChatMessage> {
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
    const translation = await this.translationService.translateToCustomer(
      content,
      customerLocale,
    );

    if (!translation) {
      return this.createMessage(sessionId, MessageSender.SALE, content);
    }

    const i18n: MessageI18nMeta = {
      sourceLocale: translation.sourceLocale,
      targetLocale: translation.targetLocale,
      originalText: content,
    };

    // Customer sees translated content; sale UI can show originalText from meta
    return this.createMessage(
      sessionId,
      MessageSender.SALE,
      translation.translatedText,
      { i18n } as unknown as Prisma.InputJsonValue,
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
