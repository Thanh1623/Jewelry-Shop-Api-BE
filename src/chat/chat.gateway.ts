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
import { ChatMessage, CraftsmanRequestStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { JwtPayloadUser } from '../common/interfaces/jwt-payload.interface';
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

interface JoinLeaveSessionPayload {
  sessionId: string;
}

interface SendMessagePayload {
  sessionId: string;
  content: string;
  sender: HumanMessageSender;
}

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    // Optional auth — guests can still join a session by id for the demo.
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayloadUser>(token);
      (client.data as { user?: JwtPayloadUser }).user = payload;
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

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: SendMessagePayload,
  ): Promise<void> {
    const message = await this.chatService.postMessage(data.sessionId, {
      content: data.content,
      sender: data.sender,
    });
    this.emitMessageCreated(data.sessionId, message);
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

  private roomName(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
