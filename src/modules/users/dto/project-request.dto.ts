import {
  IsString,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsDateString,
  MaxLength,
  MinLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ServiceType, ProjectCategory } from '@prisma/client';

export class CreateProjectRequestDto {
  // Required client info
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  clientFirstName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  clientLastName!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  projectName!: string;

  @IsEnum(ServiceType)
  @IsNotEmpty()
  serviceType!: ServiceType;

  @IsString()
  @IsNotEmpty()
  paymentIntentId!: string;

  // Optional fields
  @IsString()
  @IsOptional()
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
  @MaxLength(100)
  aptSuiteUnit?: string;

  @IsString()
  @MaxLength(20)
  zipCode?: string;

  @IsString()
  additionalComments?: string;

  // Multipart sends booleans as strings. enableImplicitConversion runs Boolean("false")
  // before this transform, so read the untouched value off `obj` rather than `value`.
  @Transform(({ obj }) => {
    const raw = obj?.projectLocationSameAsClient;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === true || raw === 'true';
  })
  @IsBoolean()
  @IsOptional()
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
  @MaxLength(100)
  projectAptSuiteUnit?: string;

  @IsString()
  @MaxLength(20)
  projectZipCode?: string;

  @IsEnum(ProjectCategory)
  projectCategory?: ProjectCategory;

  @IsString()
  @MaxLength(100)
  projectSize?: string;


  @IsString()
  @IsOptional()
  projectTimeline?: string;

  @IsString()
  @MaxLength(100)
  budgetRange?: string;

  @IsOptional()
  @IsString()
  preferredArchitecturalStyle?: string;

  @IsString()
  siteConstraints?: string;

  @IsOptional()
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