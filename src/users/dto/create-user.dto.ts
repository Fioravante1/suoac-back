import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { toNormalizedEmail } from '../../common/validators/email.transform';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../common/validators/password.constants';

export const USER_ROLES = [
  'CIRCUIT_COORDINATOR',
  'CIRCUIT_ASSISTANT',
  'CONGREGATION_COORDINATOR',
  'CONGREGATION_ASSISTANT',
] as const;

export class CreateUserDto {
  @IsString()
  @Length(2, 150)
  name!: string;

  @Transform(({ value }) => toNormalizedEmail(value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 100)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;

  @IsEnum(USER_ROLES)
  role!: (typeof USER_ROLES)[number];

  @IsUUID()
  congregationId!: string;
}
