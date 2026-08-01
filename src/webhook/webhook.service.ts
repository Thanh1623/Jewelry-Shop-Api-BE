import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CraftsmanRequest,
  CraftsmanRequestStatus,
  MessageSender,
} from '@prisma/client';

import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { CraftsmanWebhookClient } from './craftsman-webhook.client';
import { AskCraftsmanDto } from './dto/ask-craftsman.dto';
import { CraftsmanReplyDto } from './dto/craftsman-reply.dto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly craftsmanClient: CraftsmanWebhookClient,
  ) {}

  async askCraftsman(dto: AskCraftsmanDto): Promise<CraftsmanRequest> {
    const session = await this.chatService.getSessionWithMessages(
      dto.sessionId,
    );

    const question =
      dto.question ??
      (await this.chatService.getLastCustomerMessage(dto.sessionId))?.content;
    if (!question) {
      throw new BadRequestException(
        'Chưa có câu hỏi nào từ khách hàng để gửi cho thợ chế tác.',
      );
    }

    const product = session.product;
    const request = await this.prisma.craftsmanRequest.create({
      data: {
        sessionId: dto.sessionId,
        productId: product?.id,
        question,
        status: CraftsmanRequestStatus.PENDING,
      },
    });

    // Bubble câu hỏi sale trong lane Thợ (không lộ khách)
    const askMessage = await this.chatService.createInternalSaleMessage(
      dto.sessionId,
      question,
      {
        internalLane: 'CRAFTSMAN',
        imageUrl: dto.referenceImageUrl ?? dto.productImageUrl ?? null,
      },
    );
    this.chatGateway.emitMessageCreated(dto.sessionId, askMessage);

    try {
      await this.craftsmanClient.sendAskRequest({
        requestId: request.id,
        chatSessionId: dto.sessionId,
        productId: product?.id ?? null,
        productName: product?.name ?? 'Sản phẩm chưa xác định',
        productWeightGrams: product?.weightGrams ?? 0,
        productLaborCost: product?.laborCost ?? 0,
        productBaseSize: product?.baseSize ?? 6,
        productImageUrl: dto.productImageUrl ?? product?.imageUrl ?? null,
        referenceImageUrl: dto.referenceImageUrl ?? null,
        question,
        customerNote: dto.customerNote ?? null,
        replyWebhookUrl: this.craftsmanClient.buildReplyWebhookUrl(),
      });

      const sentRequest = await this.prisma.craftsmanRequest.update({
        where: { id: request.id },
        data: { status: CraftsmanRequestStatus.SENT },
      });
      this.chatGateway.emitCraftsmanRequestUpdated(dto.sessionId, {
        requestId: sentRequest.id,
        status: sentRequest.status,
      });
      return sentRequest;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send ask-craftsman webhook: ${errorMessage}`,
      );
      const failedRequest = await this.prisma.craftsmanRequest.update({
        where: { id: request.id },
        data: {
          status: CraftsmanRequestStatus.FAILED,
          externalError: errorMessage,
        },
      });
      this.chatGateway.emitCraftsmanRequestUpdated(dto.sessionId, {
        requestId: failedRequest.id,
        status: failedRequest.status,
      });
      // do not return 200 with FAILED — sale FE must see a real error
      throw new BadGatewayException(
        `Không gửi được yêu cầu sang app thợ: ${errorMessage}`,
      );
    }
  }

  async handleCraftsmanReply(
    dto: CraftsmanReplyDto,
  ): Promise<CraftsmanRequest> {
    const request = await this.prisma.craftsmanRequest.findUnique({
      where: { id: dto.requestId },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu tư vấn thợ chế tác.');
    }

    // ponytail: idempotent — webhook retries must not spam duplicate CRAFTSMAN messages
    if (request.status === CraftsmanRequestStatus.ANSWERED) {
      return request;
    }

    const updatedRequest = await this.prisma.craftsmanRequest.update({
      where: { id: dto.requestId },
      data: {
        status: CraftsmanRequestStatus.ANSWERED,
        answer: dto.answer,
        craftsmanName: dto.craftsmanName,
        answeredAt: new Date(dto.answeredAt),
      },
    });

    const message = await this.chatService.createSystemMessage(
      request.sessionId,
      MessageSender.CRAFTSMAN,
      dto.answer,
      { craftsmanName: dto.craftsmanName, requestId: request.id },
    );

    this.chatGateway.emitAdvisorResult(request.sessionId, {
      sessionId: request.sessionId,
      source: 'craftsman',
      content: dto.answer,
      meta: { craftsmanName: dto.craftsmanName },
      message,
    });
    this.chatGateway.emitCraftsmanRequestUpdated(request.sessionId, {
      requestId: updatedRequest.id,
      status: updatedRequest.status,
      answer: updatedRequest.answer,
    });
    void this.chatGateway.notifySalesCraftsmanReply(
      request.sessionId,
      dto.answer,
    );

    return updatedRequest;
  }
}
