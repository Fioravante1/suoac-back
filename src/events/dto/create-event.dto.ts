import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { CALENDAR_DATE_MESSAGE, CALENDAR_DATE_REGEX } from '../../common/validators/calendar-date.constants';
import { EventType } from '../../generated/prisma/enums';
import { requiresEndDate, usesEndDate } from '../event-type.util';

function isPresent(value: string | null | undefined): boolean {
  return value !== undefined && value !== null;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  title!: string;

  @IsEnum(EventType)
  type!: (typeof EventType)[keyof typeof EventType];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ticketPrice!: number;

  @IsString()
  @Matches(CALENDAR_DATE_REGEX, { message: CALENDAR_DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: CALENDAR_DATE_MESSAGE })
  registrationDeadline!: string;

  @IsString()
  @Matches(CALENDAR_DATE_REGEX, { message: CALENDAR_DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: CALENDAR_DATE_MESSAGE })
  paymentDeadline!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  venue!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 300)
  address!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  state!: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsString()
  @Matches(CALENDAR_DATE_REGEX, { message: CALENDAR_DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: CALENDAR_DATE_MESSAGE })
  date!: string;

  @ValidateIf((o: CreateEventDto) => requiresEndDate(o.type) || (usesEndDate(o.type) && isPresent(o.endDate)))
  @IsString()
  @Matches(CALENDAR_DATE_REGEX, { message: CALENDAR_DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: CALENDAR_DATE_MESSAGE })
  endDate?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}$/, { message: 'departureTime deve estar no formato HH:mm' })
  departureTime!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}$/, { message: 'returnTime deve estar no formato HH:mm' })
  returnTime!: string;
}
