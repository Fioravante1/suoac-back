import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Matches, Min, ValidateIf } from 'class-validator';
import { EventType } from '../../generated/prisma/enums';

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
  @IsNotEmpty()
  registrationDeadline!: string;

  @IsString()
  @IsNotEmpty()
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
  @IsNotEmpty()
  date!: string;

  @ValidateIf((o: CreateEventDto) => o.type === EventType.REGIONAL_CONVENTION)
  @IsString()
  @IsNotEmpty()
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
