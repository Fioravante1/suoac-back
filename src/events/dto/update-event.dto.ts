import { IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { CALENDAR_DATE_MESSAGE, CALENDAR_DATE_REGEX } from '../../common/validators/calendar-date.constants';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ticketPrice?: number;

  @IsOptional()
  @IsString()
  @Matches(CALENDAR_DATE_REGEX, { message: CALENDAR_DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: CALENDAR_DATE_MESSAGE })
  registrationDeadline?: string;

  @IsOptional()
  @IsString()
  @Matches(CALENDAR_DATE_REGEX, { message: CALENDAR_DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: CALENDAR_DATE_MESSAGE })
  paymentDeadline?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  venue?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 300)
  address?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  state?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
