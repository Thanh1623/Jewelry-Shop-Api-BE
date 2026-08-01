import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AskCraftsmanDto {
  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  customerNote?: string;
}
