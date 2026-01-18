import { IsString, IsNumber, IsInt, IsOptional, Min, IsNotEmpty } from 'class-validator';

export class AddProposalServiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber({}, { message: 'cost must be a valid number' })
  @Min(0, { message: 'cost cannot be negative' })
  cost: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  timelineWeeks?: number;

  @IsString()
  @IsOptional()
  description?: string;
}