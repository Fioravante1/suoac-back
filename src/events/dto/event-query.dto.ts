import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EventStatus } from '../../generated/prisma/enums';

export class EventQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
