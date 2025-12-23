import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ServiceType, ProjectCategory,  } from '@prisma/client';

export class CreateProjectRequestDto {
  // Client Details
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  clientFirstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  clientMiddleName?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  clientLastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @IsOptional()
  @IsString()
  additionalComments?: string;

  // Project Details
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  projectName: string;

  @IsOptional()
  @IsBoolean()
  projectLocationSameAsClient?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  projectStreetAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  projectZipCode?: string;

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @IsOptional()
  @IsEnum(ProjectCategory)
  projectCategory?: ProjectCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  budgetRange?: string;

  // Architectural Preferences
  @IsOptional()
  @IsString()
  preferredArchitecturalStyle?: string;

  @IsOptional()
  @IsString()
  siteConstraints?: string;

  // Sustainability
  @IsOptional()
  @IsString()
  sustainabilityGoals?: string;

  @IsOptional()
  @IsString()
  specialRequirements?: string;

  // Appointment
  @IsOptional()
  @IsDateString()
  appointmentDate?: string;

  @IsOptional()
  @IsString()
  appointmentTime?: string;

  @IsOptional()
  @IsString()
  appointmentType?: string;

  @IsOptional()
  @IsString()
  additionalNotes?: string;
}
