import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { CraftsmanWebhookClient } from './craftsman-webhook.client';
import { WebhookController } from './webhook.controller';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';
import { WebhookService } from './webhook.service';

@Module({
  imports: [ChatModule],
  controllers: [WebhookController],
  providers: [WebhookService, CraftsmanWebhookClient, WebhookSecretGuard],
})
export class WebhookModule {}
