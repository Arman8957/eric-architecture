import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';

export class CreateOverheadExpenseDto {
  @IsString()
  name: string;

  @IsNumber()
  amount: number;

  @IsString()
  frequency: string; // "monthly", "semi-annually", "yearly"

  @IsString()
  category: string;
}

export class UpdateOverheadExpenseDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  frequency?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
