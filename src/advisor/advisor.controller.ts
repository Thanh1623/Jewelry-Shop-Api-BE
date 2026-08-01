import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator';
import { AdvisorAskResponse, AdvisorService } from './advisor.service';
import { AskAdvisorDto } from './dto/ask-advisor.dto';

@ApiTags('Advisor')
@ApiBearerAuth()
@Controller('advisor')
export class AdvisorController {
  constructor(private readonly advisorService: AdvisorService) {}

  @Roles(UserRole.SALE)
  @Post('ask')
  ask(@Body() dto: AskAdvisorDto): Promise<AdvisorAskResponse> {
    return this.advisorService.ask(dto);
  }
}
