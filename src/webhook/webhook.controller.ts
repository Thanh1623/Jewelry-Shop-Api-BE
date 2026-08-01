import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CraftsmanRequest, UserRole } from '@prisma/client';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AskCraftsmanDto } from './dto/ask-craftsman.dto';
import { CraftsmanReplyDto } from './dto/craftsman-reply.dto';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';
import { WebhookService } from './webhook.service';

@ApiTags('Webhooks')
@Controller('webhooks/craftsman')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @ApiBearerAuth()
  @Roles(UserRole.SALE)
  @Post('ask')
  askCraftsman(@Body() dto: AskCraftsmanDto): Promise<CraftsmanRequest> {
    return this.webhookService.askCraftsman(dto);
  }

  @Public()
  @UseGuards(WebhookSecretGuard)
  @Post('reply')
  handleReply(@Body() dto: CraftsmanReplyDto): Promise<CraftsmanRequest> {
    return this.webhookService.handleCraftsmanReply(dto);
  }
}
