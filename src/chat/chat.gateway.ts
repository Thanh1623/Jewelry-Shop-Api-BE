import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ChatMessage, CraftsmanRequestStatus, MessageSender, UserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { JwtPayloadUser } from '../common/interfaces/jwt-payload.interface';
import { PushService } from '../push/push.service';
import { ChatService } from './chat.service';
import { HumanMessageSender } from './dto/send-message.dto';

export interface AdvisorResultPayload {
  sessionId: string;
  source: 'ai' | 'craftsman';
  content: string;
  meta?: unknown;
  message: ChatMessage;
}

export interface CraftsmanRequestUpdatedPayload {
  requestId: string;
  status: CraftsmanRequestStatus;
  answer?: string | null;
}

export interface SaleInboxPayload {
  kind:
    | 'customer_message'
    | 'craftsman_reply'
    | 'new_session'
    | 'session_claimed'
    | 'session_released';
  sessionId: string;
  title: string;
  body: string;
}

interface JoinLeaveSessionPayload {
  sessionId: string;
}

interface SendMessagePayload {
  sessionId: string;
  content: string;
  sender: HumanMessageSender;
  imageUrl?: string;
}

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly pushService: PushService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayloadUser>(token);
      (client.data as { user?: JwtPayloadUser }).user = payload;
      if (payload.role === UserRole.SALE) {
        void client.join(this.salesRoom());
      }
    } catch {
      this.logger.warn(`Socket ${client.id} sent an invalid auth token`);
    }
  }

  @SubscribeMessage('join_session')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinLeaveSessionPayload,
  ): void {
    void client.join(this.roomName(data.sessionId));
  }

  @SubscribeMessage('leave_session')
  handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinLeaveSessionPayload,
  ): void {
    void client.leave(this.roomName(data.sessionId));
  }

  @SubscribeMessage('join_sales')
  handleJoinSales(@ConnectedSocket() client: Socket): void {
    const user = (client.data as { user?: JwtPayloadUser }).user;
    if (user?.role === UserRole.SALE) {
      void client.join(this.salesRoom());
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: SendMessagePayload,
  ): Promise<void> {
    const message = await this.chatService.postMessage(data.sessionId, {
      content: data.content,
      sender: data.sender,
      imageUrl: data.imageUrl,
    });
    this.emitMessageCreated(data.sessionId, message);
    void this.notifySalesIfCustomerMessage(data.sessionId, message);
  }

  emitMessageCreated(sessionId: string, message: ChatMessage): void {
    this.server.to(this.roomName(sessionId)).emit('message_created', message);
  }

  emitAdvisorResult(sessionId: string, payload: AdvisorResultPayload): void {
    this.server.to(this.roomName(sessionId)).emit('advisor_result', payload);
  }

  emitCraftsmanRequestUpdated(
    sessionId: string,
    payload: CraftsmanRequestUpdatedPayload,
  ): void {
    this.server
      .to(this.roomName(sessionId))
      .emit('craftsman_request_updated', payload);
  }

  emitSaleInbox(payload: SaleInboxPayload): void {
    this.server.to(this.salesRoom()).emit('sale_inbox', payload);
  }

  async notifySalesIfCustomerMessage(
    sessionId: string,
    message: ChatMessage,
  ): Promise<void> {
    if (message.sender !== MessageSender.CUSTOMER) {
      return;
    }

    const preview =
      message.content === '[Ảnh đính kèm]'
        ? 'Đã gửi một ảnh'
        : message.content.slice(0, 120);

    const inbox: SaleInboxPayload = {
      kind: 'customer_message',
      sessionId,
      title: 'Khách vừa nhắn',
      body: preview,
    };
    this.emitSaleInbox(inbox);
    await this.pushService.notifySales(inbox);
  }

  async notifySalesCraftsmanReply(
    sessionId: string,
    answer: string,
  ): Promise<void> {
    const inbox: SaleInboxPayload = {
      kind: 'craftsman_reply',
      sessionId,
      title: 'Thợ đã trả lời',
      body: answer.slice(0, 120),
    };
    this.emitSaleInbox(inbox);
    await this.pushService.notifySales(inbox);
  }

  private roomName(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private salesRoom(): string {
    return 'sales';
  }
}
