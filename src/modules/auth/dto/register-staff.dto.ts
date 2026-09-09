// modules/auth/dto/register-staff.dto.ts
import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsIn,
  IsUrl,
} from 'class-validator';
import { UserRole } from '@prisma/client';

/** The three top-level dashboard tabs, as the frontend names them. */
export const DASHBOARD_SECTIONS = ['studio', 'media', 'financials'] as const;


export class RegisterStaffDto {
  @IsEmail()
  email!: string;

  /**
   * No password field. A new member sets their own from the link in the
   * welcome email, so the account is created without one and cannot be signed
   * into until they do — nobody but them ever knows it.
   */

  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Shared folder holding their hiring paperwork. Optional here because the
   * folder often does not exist yet when the account is made; it can be saved
   * on its own afterwards (PATCH /auth/staff/:id/hiring-documents).
   */
  @IsUrl(
    { require_protocol: true },
    { message: 'Hiring documents must be a full URL, e.g. https://…' },
  )
  @IsOptional()
  hiringDocumentsUrl?: string;

  /**
   * Optional second handle the member can sign in with, alongside their email.
   * Whitelisted here for the same reason as the address fields below — the
   * global pipe rejects the whole request for an unknown property.
   */
  @IsString()
  @IsOptional()
  username?: string;

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
  aptSuiteUnit?: string;

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

  /**
   * Which dashboard tabs an EMPLOYEE may open. Ignored for every other role,
   * whose access is decided by the role itself — see the service, which clears
   * this for non-employees so a stray value can't widen someone's access.
   */
  @IsArray()
  @IsIn(DASHBOARD_SECTIONS as unknown as string[], { each: true })
  @IsOptional()
  dashboardSections?: string[];
}