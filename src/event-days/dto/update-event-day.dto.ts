import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateEventDayDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'departureTime deve estar no formato HH:mm' })
  departureTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'returnTime deve estar no formato HH:mm' })
  returnTime?: string;
}
