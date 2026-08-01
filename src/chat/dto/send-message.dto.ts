import { MessageSender } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

// ponytail: only CUSTOMER/SALE can post through this human-facing endpoint —
// AI/CRAFTSMAN messages are created internally by the advisor/webhook services.
export const HumanMessageSender = {
  CUSTOMER: MessageSender.CUSTOMER,
  SALE: MessageSender.SALE,
} as const;
export type HumanMessageSender =
  (typeof HumanMessageSender)[keyof typeof HumanMessageSender];

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: 'Nội dung tin nhắn không được để trống.' })
  content!: string;

  @IsEnum(HumanMessageSender, { message: 'Người gửi không hợp lệ.' })
  sender!: HumanMessageSender;
}
