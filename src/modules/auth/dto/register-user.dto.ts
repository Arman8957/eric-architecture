// modules/auth/dto/register-user.dto.ts
import { IsEmail, IsString, MinLength, IsOptional, IsNotEmpty } from 'class-validator';

export class RegisterUserDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  // Username — stored on `User.name`
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  // ── Optional address details ────────────────────────────────────────────
  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  streetAddress?: string;

  @IsString()
  @IsOptional()
  aptSuiteUnit?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;
}
