import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';

export class CreateAmendmentRequestDto {
  @IsString()
  @MaxLength(200)
  projectName!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @MaxLength(2000)
  services!: string;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  urgency!: string;
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

  @IsOptional()
  taxRate?: number;

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