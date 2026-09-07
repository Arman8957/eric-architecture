// modules/auth/dto/change-password.dto.ts
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/**
 * Changing your own password while signed in. Unlike the reset flow this
 * proves ownership with the current password rather than an emailed token,
 * so a session left open on a shared machine can't be used to lock the
 * account's owner out.
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Your current password is required' })
  currentPassword!: string;

  /** Chosen by the account's owner, so it carries the full rule. */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Z]/, { message: 'Password needs at least 1 capital letter' })
  @Matches(/[0-9]/, { message: 'Password needs at least 1 number' })
  newPassword!: string;
}
