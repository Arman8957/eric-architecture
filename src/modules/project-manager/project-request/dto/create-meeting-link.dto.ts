import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  MaxLength,
  IsUrl,
  IsEnum,
} from 'class-validator';
import { MeetingType } from '@prisma/client';

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

  /** End of the meeting window. Defaults to one 30-minute slot when omitted. */
  @IsString()
  @IsOptional()
  @IsDateString({}, { message: 'endsAt must be a valid date' })
  endsAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  stageId?: string;

  @IsOptional()
  @IsEnum(MeetingType, { message: 'Invalid meeting type' })
  meetingType?: MeetingType;
}

/**
 * Adding the joining link to a meeting that already exists. The time is
 * optional — omit it to keep the slot both sides already agreed on.
 */
export class AttachMeetingLinkDto {
  @IsString()
  @IsNotEmpty({ message: 'Meeting URL is required' })
  @IsUrl({}, { message: 'Meeting URL must be a valid URL' })
  meetingUrl: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  @IsDateString({}, { message: 'scheduledAt must be a valid date' })
  scheduledAt?: string;

  @IsString()
  @IsOptional()
  @IsDateString({}, { message: 'endsAt must be a valid date' })
  endsAt?: string;
}
