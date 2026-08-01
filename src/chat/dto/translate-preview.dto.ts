import { IsString, MinLength } from 'class-validator';

export class TranslatePreviewDto {
  @IsString()
  @MinLength(1, { message: 'Nội dung cần dịch không được để trống.' })
  text!: string;
}
