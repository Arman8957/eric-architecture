import { IsString, IsNumber, IsOptional, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EmployeeTaxDto {
  @IsString()
  taxType!: string; // FITWH, MED, SOC, ST, SDI, OTHERS

  @IsString()
  @IsOptional()
  customName?: string; // custom name when taxType is OTHERS

  @IsString()
  @IsOptional()
  state?: string; // US state for a state-specific tax (ST / SDI)

  @IsNumber()
  percentage!: number;
}

export class UpdateEmployeeProfileDto {
  @IsString()
  @IsOptional()
  state?: string;

  @IsDateString()
  @IsOptional()
  startingDate?: string;

  @IsNumber()
  @IsOptional()
  utilizationRate?: number;

  @IsNumber()
  @IsOptional()
  hourlyRate?: number;

  @IsNumber()
  @IsOptional()
  salary?: number;

  @IsNumber()
  @IsOptional()
  taxPercentage?: number;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EmployeeTaxDto)
  taxes?: EmployeeTaxDto[];
}
