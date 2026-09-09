// modules/auth/dto/update-hiring-documents.dto.ts
import { IsOptional, IsUrl, ValidateIf } from 'class-validator';

/**
 * Attaches (or clears) the shared folder holding a staff member's hiring
 * paperwork, separately from creating their account — the folder is often made
 * after the person is, so onboarding does not wait on it.
 */
export class UpdateHiringDocumentsDto {
  /**
   * Null or an empty string detaches the folder. Anything else must be a full
   * URL, so a half-typed "drive.google.com/…" is rejected here rather than
   * arriving in someone's welcome email as a dead link.
   */
  @ValidateIf(
    (_object, value) => value !== null && value !== '' && value !== undefined,
  )
  @IsUrl(
    { require_protocol: true },
    { message: 'Hiring documents must be a full URL, e.g. https://…' },
  )
  @IsOptional()
  hiringDocumentsUrl?: string | null;
}
