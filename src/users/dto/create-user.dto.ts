import { IsEmail, IsEnum, IsString, IsUUID, Length, MaxLength } from 'class-validator';

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

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 100)
  password!: string;

  @IsEnum(USER_ROLES)
  role!: (typeof USER_ROLES)[number];

  @IsUUID()
  congregationId!: string;
}
