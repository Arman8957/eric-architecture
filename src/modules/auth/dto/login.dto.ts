// modules/auth/dto/login.dto.ts
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * Email *or* username — whatever was typed into the "Email / Username" box.
   *
   * Deliberately not `@IsEmail()`: the service matches this against both
   * columns, and validating it as an address rejected every username with
   * "Invalid email format" before the lookup ever ran. Kept under the name
   * `email` so the existing client payload keeps working.
   */
  @IsString()
  @IsNotEmpty({ message: 'Email or username is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;
}
