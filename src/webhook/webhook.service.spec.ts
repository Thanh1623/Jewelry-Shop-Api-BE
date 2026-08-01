import { NotFoundException } from '@nestjs/common';
import { CraftsmanRequestStatus, MessageSender } from '@prisma/client';

import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { CraftsmanWebhookClient } from './craftsman-webhook.client';
import { CraftsmanReplyDto } from './dto/craftsman-reply.dto';
import { WebhookService } from './webhook.service';

describe('WebhookService.handleCraftsmanReply', () => {
  let service: WebhookService;
  let mockPrisma: {
    craftsmanRequest: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockChatService: { createSystemMessage: jest.Mock };
  let mockChatGateway: {
    emitAdvisorResult: jest.Mock;
    emitCraftsmanRequestUpdated: jest.Mock;
  };

  const existingRequest = {
    id: 'req-1',
    sessionId: 'session-1',
    productId: 'product-1',
    question: 'Giá nhẫn size 8 bao nhiêu?',
    status: CraftsmanRequestStatus.SENT,
    answer: null,
    craftsmanName: null,
    answeredAt: null,
    externalError: null,
  };

  const inputDto: CraftsmanReplyDto = {
    requestId: 'req-1',
    answer: 'Giá đề xuất là 500.000đ.',
    craftsmanName: 'Thợ Nam',
    answeredAt: '2026-08-02T00:00:00.000Z',
  };

  beforeEach(() => {
    mockPrisma = {
      craftsmanRequest: {
        findUnique: jest.fn().mockResolvedValue(existingRequest),
        update: jest.fn().mockResolvedValue({
          ...existingRequest,
          status: CraftsmanRequestStatus.ANSWERED,
          answer: inputDto.answer,
          craftsmanName: inputDto.craftsmanName,
          answeredAt: new Date(inputDto.answeredAt),
        }),
      },
    };
    mockChatService = {
      createSystemMessage: jest.fn().mockResolvedValue({
        id: 'message-1',
        sessionId: existingRequest.sessionId,
        sender: MessageSender.CRAFTSMAN,
        content: inputDto.answer,
      }),
    };
    mockChatGateway = {
      emitAdvisorResult: jest.fn(),
      emitCraftsmanRequestUpdated: jest.fn(),
    };

    service = new WebhookService(
      mockPrisma as unknown as PrismaService,
      mockChatService as unknown as ChatService,
      mockChatGateway as unknown as ChatGateway,
      {} as CraftsmanWebhookClient,
    );
  });

  it('marks the request ANSWERED, persists a CRAFTSMAN message, and emits socket events', async () => {
    // Act
    const actualResult = await service.handleCraftsmanReply(inputDto);

    // Assert
    expect(mockPrisma.craftsmanRequest.update).toHaveBeenCalledWith({
      where: { id: inputDto.requestId },
      data: {
        status: CraftsmanRequestStatus.ANSWERED,
        answer: inputDto.answer,
        craftsmanName: inputDto.craftsmanName,
        answeredAt: new Date(inputDto.answeredAt),
      },
    });
    expect(mockChatService.createSystemMessage).toHaveBeenCalledWith(
      existingRequest.sessionId,
      MessageSender.CRAFTSMAN,
      inputDto.answer,
      { craftsmanName: inputDto.craftsmanName, requestId: existingRequest.id },
    );
    expect(mockChatGateway.emitAdvisorResult).toHaveBeenCalledWith(
      existingRequest.sessionId,
      expect.objectContaining({
        source: 'craftsman',
        content: inputDto.answer,
      }),
    );
    expect(mockChatGateway.emitCraftsmanRequestUpdated).toHaveBeenCalledWith(
      existingRequest.sessionId,
      expect.objectContaining({ status: CraftsmanRequestStatus.ANSWERED }),
    );
    expect(actualResult.status).toBe(CraftsmanRequestStatus.ANSWERED);
  });

  it('throws NotFoundException when the craftsman request does not exist', async () => {
    // Arrange
    mockPrisma.craftsmanRequest.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expect(service.handleCraftsmanReply(inputDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('is idempotent when the request is already ANSWERED', async () => {
    mockPrisma.craftsmanRequest.findUnique.mockResolvedValue({
      ...existingRequest,
      status: CraftsmanRequestStatus.ANSWERED,
      answer: inputDto.answer,
    });

    const actualResult = await service.handleCraftsmanReply(inputDto);

    expect(mockPrisma.craftsmanRequest.update).not.toHaveBeenCalled();
    expect(mockChatService.createSystemMessage).not.toHaveBeenCalled();
    expect(mockChatGateway.emitAdvisorResult).not.toHaveBeenCalled();
    expect(actualResult.status).toBe(CraftsmanRequestStatus.ANSWERED);
  });
});
