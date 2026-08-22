import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Client contact details editable from the proposal wizard's Client step.
 *
 * Email is deliberately not editable here: it is the link to the client's user
 * account, so changing it belongs in account management, not in a proposal.
 */
export class UpdateClientDetailsDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  clientFirstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  clientLastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  companyName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  streetAddress?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  aptSuiteUnit?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  zipCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @IsString()
  @IsOptional()
  additionalComments?: string;
}
