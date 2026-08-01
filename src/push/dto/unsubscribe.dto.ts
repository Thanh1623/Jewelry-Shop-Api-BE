import { IsUrl } from 'class-validator';

export class UnsubscribeDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;
}
