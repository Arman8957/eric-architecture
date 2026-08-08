import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';

export class CreateAmendmentRequestDto {
  @IsString()
  @MaxLength(200)
  projectName!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  // Client's scope estimate for the requested extension.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  squareFootage?: string;

  @IsOptional()
  @IsEnum(['sqf', 'sqm'])
  projectSizeUnit?: 'sqf' | 'sqm';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  budgetRange?: string;

  // Legacy intake fields, kept so older clients keep working.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  services?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  urgency?: string;
}

export class ReviewAmendmentDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  action!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNotes?: string;
}

export class CreateAmendmentProposalDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  additionalContext?: string;

  @IsOptional()
  @IsString()
  budgetRange?: string;

  @IsOptional()
  @IsString()
  expectedTimeline?: string;

  // How the client settles this amendment: per completed phase, or all at once.
  @IsOptional()
  @IsEnum(['PHASE_COMPLETION', 'LUMP_SUM'])
  paymentType?: 'PHASE_COMPLETION' | 'LUMP_SUM';

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;
}