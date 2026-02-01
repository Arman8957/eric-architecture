import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  MaxLength,
  IsUrl,
} from 'class-validator';

export class CreateMeetingLinkDto {
  @IsString()
  @IsNotEmpty({ message: 'Project request ID is required' })
  projectRequestId: string;

  @IsString()
  @IsNotEmpty({ message: 'Meeting URL is required' })
  @IsUrl({}, { message: 'Meeting URL must be a valid URL' })
  meetingUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(200)
  title: string;

  @IsString()
  @IsDateString({}, { message: 'scheduledAt must be a valid date' })
  @IsNotEmpty({ message: 'Scheduled date is required' })
  scheduledAt: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}