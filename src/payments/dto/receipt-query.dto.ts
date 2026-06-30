import { IsOptional, IsUUID } from 'class-validator';

export class ReceiptQueryDto {
  @IsOptional()
  @IsUUID('4')
  congregationId?: string;
}
