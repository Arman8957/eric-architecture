import { IsString, IsEnum, IsOptional, IsDecimal } from 'class-validator';
import { ServiceType, ProjectCategory } from '@prisma/client';

export class CreateProposalDto {
  @IsString()
  projectRequestId: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsOptional() @IsString()
  additionalContext?: string;

  @IsOptional() @IsString()
  streetAddress?: string;

  @IsString()
  country: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  zip: string;

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @IsOptional()
  @IsEnum(ProjectCategory)
  projectCategory?: ProjectCategory;   // ← ADD THIS

  @IsOptional() @IsString()
  budgetRange?: string;

  @IsOptional() @IsString()
  expectedTimeline?: string;

  @IsOptional() @IsString()
  squareFootage?: string;

  @IsDecimal()
  totalCost: number;

  @IsOptional() @IsString()
  paymentMethod?: string;
}