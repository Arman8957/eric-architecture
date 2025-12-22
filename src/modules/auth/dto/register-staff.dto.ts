// modules/auth/dto/register-staff.dto.ts
import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { UserRole, User } from '../../../generated/prisma';


export class RegisterStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole, {
    message: 'Invalid role. Allowed: ADMIN, FINANCE, HIGHER_MANAGER, CRAFTER, EMPLOYEE, USER',
  })
  role: UserRole;
}