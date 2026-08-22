import { IsString, IsDateString, IsArray, IsNumber, IsOptional, ValidateNested, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TimecardEntryDto {
  @IsString()
  category!: string;

  @IsString()
  @IsOptional()
  projectRequestId?: string;

  @IsString()
  @IsOptional()
  phaseName?: string;

  // Which contract the phase belongs to — the original proposal or one of its
  // amendments. Phase names repeat across contracts, so this is what makes the
  // attribution unambiguous.
  @IsString()
  @IsOptional()
  proposalId?: string;

  @IsString()
  @IsOptional()
  proposalNumber?: string;

  @IsString()
  @IsOptional()
  stageId?: string;

  @IsInt()
  @IsOptional()
  entryWeek?: number; // 1 or 2

  @IsNumber()
  monday!: number;

  @IsNumber()
  tuesday!: number;

  @IsNumber()
  wednesday!: number;

  @IsNumber()
  thursday!: number;

  @IsNumber()
  friday!: number;

  @IsNumber()
  saturday!: number;

  @IsNumber()
  sunday!: number;
}

export class TimecardBillableEntryDto {
  @IsString()
  projectRequestId!: string;

  @IsString()
  projectName!: string;

  @IsString()
  phaseName!: string;

  // Which contract the phase belongs to — the original proposal or one of its
  // amendments. Phase names repeat across contracts, so this is what makes the
  // attribution unambiguous.
  @IsString()
  @IsOptional()
  proposalId?: string;

  @IsString()
  @IsOptional()
  proposalNumber?: string;

  @IsString()
  @IsOptional()
  stageId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  entryWeek?: number; // 1 or 2

  // Billable hours
  @IsNumber()
  monday!: number;

  @IsNumber()
  tuesday!: number;

  @IsNumber()
  wednesday!: number;

  @IsNumber()
  thursday!: number;

  @IsNumber()
  friday!: number;

  @IsNumber()
  saturday!: number;

  @IsNumber()
  sunday!: number;

}

export class CreateTimecardDto {
  @IsDateString()
  weekStarting!: string; // Start of bi-weekly period (Monday)

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(26)
  payPeriod?: number;

  @IsInt()
  @IsOptional()
  payYear?: number;
}

export class UpdateTimecardDto {
  @IsNumber()
  @IsOptional()
  billableHours?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimecardEntryDto)
  entries!: TimecardEntryDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TimecardBillableEntryDto)
  billableEntries?: TimecardBillableEntryDto[];
}

export class RejectTimecardDto {
  @IsString()
  @IsOptional()
  rejectionNote?: string;
}
