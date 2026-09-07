// modules/auth/dto/reset-password.dto.ts
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token!: string;

  /**
   * A password the account's owner chooses for themselves, so it carries the
   * full rule. The initial password a manager sets on the Add Team Member form
   * is deliberately exempt — it is a throwaway handed over in person, and the
   * member is held to this the moment they set their own.
   */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Z]/, { message: 'Password needs at least 1 capital letter' })
  @Matches(/[0-9]/, { message: 'Password needs at least 1 number' })
  password!: string;
}
