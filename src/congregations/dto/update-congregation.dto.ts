import { PartialType } from '@nestjs/swagger';
import { CreateCongregationDto } from './create-congregation.dto';

export class UpdateCongregationDto extends PartialType(CreateCongregationDto) {}
