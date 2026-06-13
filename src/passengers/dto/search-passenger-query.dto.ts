import { IsNotEmpty, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class SearchPassengerQueryDto extends PaginationQueryDto {
  @IsString()
  @IsNotEmpty()
  q!: string;
}
