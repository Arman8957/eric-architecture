import { IsOptional, IsString, MaxLength, IsBooleanString } from 'class-validator';

/**
 * Self-service profile update. Every field is optional so the form can PATCH
 * only what changed. Arrives as multipart/form-data when a photo is included,
 * so booleans are validated as strings and coerced in the service.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  middleInitial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  zipCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBooleanString()
  emailNotifications?: string;

  @IsOptional()
  @IsBooleanString()
  projectUpdates?: string;

  @IsOptional()
  @IsBooleanString()
  securityAlerts?: string;
}
