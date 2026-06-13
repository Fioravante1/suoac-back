import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PassengerFilterQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  congregationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  q?: string;
}
