import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChatMessage, UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayloadUser } from '../common/interfaces/jwt-payload.interface';
import { ChatGateway } from './chat.gateway';
import {
  ChatService,
  ChatSessionDetail,
  TranslatePreviewResponse,
} from './chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { TranslatePreviewDto } from './dto/translate-preview.dto';
import { ChatSessionSummary } from './mappers/chat-session.mapper';

@ApiTags('Chat')
@Controller('chat/sessions')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @ApiBearerAuth()
  @Roles(UserRole.CUSTOMER)
  @Post()
  createSession(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateSessionDto,
  ): Promise<ChatSessionDetail> {
    return this.chatService.createSession(dto, {
      sub: user.sub,
      fullName: user.fullName,
    });
  }

  @ApiBearerAuth()
  @Roles(UserRole.SALE)
  @Get()
  listOpenSessions(): Promise<ChatSessionSummary[]> {
    return this.chatService.listOpenSessions();
  }

  @Public()
  @Get(':id')
  getSession(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChatSessionDetail> {
    return this.chatService.getSessionWithMessages(id);
  }

  @Public()
  @Post(':id/messages')
  async postMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatMessage> {
    const message = await this.chatService.postMessage(id, dto);
    this.chatGateway.emitMessageCreated(id, message);
    void this.chatGateway.notifySalesIfCustomerMessage(id, message);
    return message;
  }

  @ApiBearerAuth()
  @Roles(UserRole.SALE)
  @Post(':id/translate-preview')
  previewTranslation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TranslatePreviewDto,
  ): Promise<TranslatePreviewResponse> {
    return this.chatService.previewSaleTranslation(id, dto);
  }
}
