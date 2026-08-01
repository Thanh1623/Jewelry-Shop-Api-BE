import { IsISO8601, IsString, IsUUID } from 'class-validator';

export class CraftsmanReplyDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  answer!: string;

  @IsString()
  craftsmanName!: string;

  @IsISO8601()
  answeredAt!: string;
}
