import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AskAdvisorDto {
  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsUUID()
  messageId?: string;

  /** Câu hỏi riêng của sale trong khung AI (không lộ sang khách). */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Câu hỏi cần ít nhất 2 ký tự.' })
  question?: string;

  /** Ảnh đính kèm câu hỏi nội bộ (URL đã upload). */
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
