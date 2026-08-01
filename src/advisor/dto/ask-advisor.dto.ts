import { IsOptional, IsUUID } from 'class-validator';

export class AskAdvisorDto {
  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsUUID()
  messageId?: string;
}
