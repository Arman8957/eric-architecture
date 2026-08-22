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

  // Optional fields. Every one of these needs @IsOptional(): the client omits
  // empty fields from the multipart body, and without it class-validator fails
  // an absent property against @IsString().
  @IsString()
  @IsOptional()
  @MaxLength(50)
  clientMiddleName?: string;

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
  @MaxLength(100)
  country?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

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
  @MaxLength(20)
  zipCode?: string;

  @IsString()
  @IsOptional()
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
  @IsOptional()
  @MaxLength(100)
  projectCountry?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  projectState?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  projectCity?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  projectStreetAddress?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  projectAptSuiteUnit?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  projectZipCode?: string;

  // Free text captured when the client picks "Other" for service / project type
  @IsString()
  @IsOptional()
  @MaxLength(200)
  serviceTypeOther?: string;

  @IsEnum(ProjectCategory)
  @IsOptional()
  projectCategory?: ProjectCategory;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  projectCategoryOther?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  projectSize?: string;

  @IsString()
  @IsOptional()
  projectTimeline?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  budgetRange?: string;

  @IsString()
  @IsOptional()
  preferredArchitecturalStyle?: string;

  @IsString()
  @IsOptional()
  siteConstraints?: string;

  @IsString()
  @IsOptional()
  sustainabilityGoals?: string;

  @IsString()
  @IsOptional()
  specialRequirements?: string;

  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @IsString()
  @IsOptional()
  appointmentType?: string;

  // Only sent for in-person appointments
  @IsString()
  @IsOptional()
  @MaxLength(255)
  meetingLocation?: string;

  @IsString()
  @IsOptional()
  additionalNotes?: string;
}
