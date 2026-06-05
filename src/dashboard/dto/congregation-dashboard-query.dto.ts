import { IsOptional, IsUUID } from 'class-validator';

export class CongregationDashboardQueryDto {
  @IsOptional()
  @IsUUID()
  congregationId?: string;
}
