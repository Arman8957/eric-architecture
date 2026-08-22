// modules/auth/dto/register-staff.dto.ts
import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';


export class RegisterStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole, {
    message: 'Invalid role. Allowed: ADMIN, FINANCE, HIGHER_MANAGER, DRAFTER, EMPLOYEE, USER',
  })
  role!: UserRole;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  // The Add Team Member form collects a full address. Without these the global
  // ValidationPipe (whitelist + forbidNonWhitelisted) rejected the whole
  // request with "property city should not exist", so no staff could be created.
  @IsString()
  @IsOptional()
  streetAddress?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  stateRegion?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;
}