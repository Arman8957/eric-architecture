import {
  IsString,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsDateString,
  MaxLength,
  MinLength,
  IsNotEmpty,
} from 'class-validator';
import { ServiceType, ProjectCategory } from '@prisma/client';

export class CreateProjectRequestDto {
  // Required client info
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  clientFirstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  clientLastName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  projectName: string;

  @IsEnum(ServiceType)
  @IsNotEmpty()
  serviceType: ServiceType;

  // Optional fields
  @IsString()
  @MaxLength(50)
  clientMiddleName?: string;

  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MaxLength(100)
  country?: string;

  @IsString()
  @MaxLength(100)
  state?: string;

  @IsString()
  @MaxLength(100)
  city?: string;

  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @IsString()
  additionalComments?: string;

  @IsBoolean()
  projectLocationSameAsClient?: boolean;

  @IsString()
  @MaxLength(100)
  projectCountry?: string;

  @IsString()
  @MaxLength(100)
  projectState?: string;

  @IsString()
  @MaxLength(100)
  projectCity?: string;

  @IsString()
  @MaxLength(255)
  projectStreetAddress?: string;

  @IsString()
  @MaxLength(20)
  projectZipCode?: string;

  @IsEnum(ProjectCategory)
  projectCategory?: ProjectCategory;

  @IsString()
  @MaxLength(100)
  projectSize?: string;

  @IsString()
  @MaxLength(100)
  budgetRange?: string;

  @IsString()
  preferredArchitecturalStyle?: string;

  @IsString()
  siteConstraints?: string;

  @IsString()
  sustainabilityGoals?: string;

  @IsString()
  specialRequirements?: string;

  @IsDateString()
  appointmentDate?: string;

  @IsString()
  appointmentTime?: string;

  @IsString()
  appointmentType?: string;

  @IsString()
  additionalNotes?: string;
}