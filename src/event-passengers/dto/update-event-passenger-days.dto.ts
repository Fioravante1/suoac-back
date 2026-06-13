import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class UpdateEventPassengerDaysDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  dayIds!: string[];
}
