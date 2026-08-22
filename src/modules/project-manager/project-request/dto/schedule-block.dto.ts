import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * A PM/admin marking themselves unavailable — site visit, out of office,
 * vacation. Clients assigned to that manager cannot book inside the range.
 */
export class CreateScheduleBlockDto {
  /** Whose calendar is blocked. Defaults to the caller. */
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsNotEmpty({ message: 'A reason/title is required' })
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsDateString({}, { message: 'startAt must be a valid date' })
  @IsNotEmpty({ message: 'Start date is required' })
  startAt: string;

  @IsDateString({}, { message: 'endAt must be a valid date' })
  @IsNotEmpty({ message: 'End date is required' })
  endAt: string;

  /** Whole-day(s) off — the range is snapped to midnight-to-midnight. */
  @IsBoolean()
  @IsOptional()
  allDay?: boolean;
}
<<<<<<< HEAD

/**
 * Editing an existing block — narrowing an all-day block to specific hours, or
 * moving it to another date. Every field is optional; only what is sent changes.
 */
export class UpdateScheduleBlockDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsDateString({}, { message: 'startAt must be a valid date' })
  @IsOptional()
  startAt?: string;

  @IsDateString({}, { message: 'endAt must be a valid date' })
  @IsOptional()
  endAt?: string;

  @IsBoolean()
  @IsOptional()
  allDay?: boolean;
}
=======
>>>>>>> 647fd1a3608cd8b6e3d8c2e5154103a745db5b6b
