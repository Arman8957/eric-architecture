// modules/auth/dto/register-user.dto.ts
import { IsEmail, IsString, MinLength, IsOptional, IsNotEmpty } from 'class-validator';

export class RegisterUserDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  // The username. Kept on this field name because that is what the signup form
  // has always sent; it is written to both `User.name` (as the display name the
  // client chose) and `User.username`, which is what login matches on.
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

  // One-time token from an "Inquiry Accepted" email. When valid, the new
  // account adopts the accepted inquiry (and any sibling account-less requests
  // on the same email) and is auto-verified.
  @IsString()
  @IsOptional()
  claimToken?: string;
}
