import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessage, MessageSender, Prisma } from '@prisma/client';

import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { LlmClient } from '../llm/llm.client';
import { AskAdvisorDto } from './dto/ask-advisor.dto';
import {
  buildTemplateExplanation,
  calculateJewelryPrice,
  parseRequestedSizeFromText,
  PricingBreakdown,
} from './pricing.rules';

export interface AdvisorAskResponse {
  message: ChatMessage;
  breakdown: PricingBreakdown;
}

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly configService: ConfigService,
    private readonly llmClient: LlmClient,
  ) {}

  async ask(dto: AskAdvisorDto): Promise<AdvisorAskResponse> {
    const session = await this.chatService.getSessionWithMessages(
      dto.sessionId,
    );
    if (!session.product) {
      throw new BadRequestException(
        'Phiên trò chuyện chưa gắn sản phẩm để tư vấn giá.',
      );
    }

    const questionMessage = dto.messageId
      ? session.messages.find(
          (m) => m.id === dto.messageId && m.sender === MessageSender.CUSTOMER,
        )
      : await this.chatService.getLastCustomerMessage(dto.sessionId);

    if (!questionMessage) {
      throw new BadRequestException(
        'Chưa có câu hỏi nào từ khách hàng trong phiên này.',
      );
    }

    const product = session.product;
    const requestedSize = parseRequestedSizeFromText(questionMessage.content);
    const breakdown = calculateJewelryPrice({
      weightGrams: product.weightGrams,
      laborCost: product.laborCost,
      baseSize: product.baseSize,
      sizeDeltaGrams: product.sizeDeltaGrams,
      requestedSize,
      silverPricePerGram: this.getNumberConfig('SILVER_PRICE_PER_GRAM', 28_000),
      marginRate: this.getNumberConfig('DEFAULT_MARGIN_RATE', 0.25),
    });

    const explanation = await this.buildExplanation(
      product.name,
      questionMessage.content,
      breakdown,
    );

    const message = await this.chatService.createSystemMessage(
      dto.sessionId,
      MessageSender.AI,
      explanation,
      breakdown as unknown as Prisma.InputJsonValue,
    );

    this.chatGateway.emitAdvisorResult(dto.sessionId, {
      sessionId: dto.sessionId,
      source: 'ai',
      content: explanation,
      meta: breakdown,
      message,
    });

    return { message, breakdown };
  }

  private async buildExplanation(
    productName: string,
    question: string,
    breakdown: PricingBreakdown,
  ): Promise<string> {
    const fallback = buildTemplateExplanation(breakdown, productName);
    const prompt =
      `Khách hỏi: "${question}" về sản phẩm "${productName}".\n` +
      `Đây là bảng giá đã tính sẵn (đừng thay đổi số liệu, chỉ diễn giải bằng tiếng Việt tự nhiên, ngắn gọn, thân thiện):\n` +
      `${JSON.stringify(breakdown)}\n` +
      `Hãy viết đoạn giải thích giá cho khách hàng.`;

    try {
      const llmText = await this.llmClient.generateExplanation(prompt);
      return llmText?.trim() || fallback;
    } catch (error) {
      this.logger.warn(
        `AI explanation failed, falling back to template: ${String(error)}`,
      );
      return fallback;
    }
  }

  private getNumberConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
