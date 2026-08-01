import { Global, Module } from '@nestjs/common';

import { LlmClient } from './llm.client';
import { TranslationService } from './translation.service';

@Global()
@Module({
  providers: [LlmClient, TranslationService],
  exports: [LlmClient, TranslationService],
})
export class LlmModule {}
