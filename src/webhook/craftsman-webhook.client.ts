import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AskCraftsmanWebhookBody {
  requestId: string;
  chatSessionId: string;
  productId: string | null;
  productName: string;
  productWeightGrams: number;
  productLaborCost: number;
  productBaseSize: number;
  question: string;
  customerNote: string | null;
  replyWebhookUrl: string;
}

@Injectable()
export class CraftsmanWebhookClient {
  private readonly logger = new Logger(CraftsmanWebhookClient.name);

  constructor(private readonly configService: ConfigService) {}

  buildReplyWebhookUrl(): string {
    const publicUrl = this.configService.get<string>(
      'SHOP_API_PUBLIC_URL',
      'http://localhost:3000/api',
    );
    return `${publicUrl}/webhooks/craftsman/reply`;
  }

  async sendAskRequest(payload: AskCraftsmanWebhookBody): Promise<void> {
    const baseUrl = this.configService.get<string>('CRAFTSMAN_API_URL');
    const webhookPath = this.configService.get<string>(
      'CRAFTSMAN_ASK_WEBHOOK_PATH',
    );
    const secret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!baseUrl || !webhookPath || !secret) {
      throw new Error(
        'Craftsman webhook is not configured (missing env vars).',
      );
    }

    const response = await fetch(`${baseUrl}${webhookPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': secret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Craftsman webhook responded with ${response.status}: ${body}`,
      );
    }

    this.logger.log(
      `Sent ask-craftsman webhook for request ${payload.requestId}`,
    );
  }
}
